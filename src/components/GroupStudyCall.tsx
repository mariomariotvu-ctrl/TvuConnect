import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { User } from 'firebase/auth';
import {
  Camera,
  CameraOff,
  Copy,
  Grid2X2,
  Hand,
  LayoutPanelTop,
  Loader2,
  Maximize2,
  Mic,
  MicOff,
  Minimize2,
  PhoneOff,
  ScreenShare,
  ScreenShareOff,
  Settings2,
  ShieldCheck,
  Smile,
  Users,
  X,
  Youtube,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  StudyReaction,
  StudyRoom,
  StudyRoomParticipant,
  StudySignal,
} from '../types/socialAudio';
import { getCallIceServersForSession } from '../services/callService';
import {
  joinStudyRoom,
  leaveStudyRoom,
  removeStudyRoomParticipant,
  removeStudySignal,
  sendStudyReaction,
  sendStudySignal,
  setStudyParticipantState,
  setStudyRoomControl,
  setStudyRoomYouTube,
  StudyRoomControl,
  subscribeToStudyReactions,
  subscribeToStudyRoom,
  subscribeToStudyRoomParticipants,
  subscribeToStudySignals,
  touchStudyRoom,
} from '../services/studyRoomService';
import { SynchronizedYouTubePlayer } from './SynchronizedYouTubePlayer';
import { getStudyRoomErrorMessage } from '../utils/userFacingErrors';
import { playAppSound } from '../utils/appSounds';
import { applyCallTrackHints, getCallMediaConstraints, optimizeCallSenders } from '../utils/callMedia';
import {
  extractYouTubeVideoId,
  getYouTubeWatchUrl,
  supportsDisplayCapture,
} from '../utils/meetingMedia';
import { MeetingSidePanel } from './MeetingSidePanel';

interface GroupStudyCallProps {
  room: StudyRoom;
  currentUser: User;
  onClose: () => void;
}

const hasLiveVideo = (stream?: MediaStream | null) => Boolean(
  stream?.getVideoTracks().some((track) => track.readyState === 'live'),
);

const optimizeMeetingConnection = async (connection: RTCPeerConnection, peerCount: number) => {
  await optimizeCallSenders(connection);
  const videoCap = peerCount >= 5 ? 420_000 : peerCount >= 3 ? 650_000 : 1_000_000;
  const frameRateCap = peerCount >= 5 ? 15 : peerCount >= 3 ? 20 : 24;

  await Promise.all(connection.getSenders().map(async (sender) => {
    if (sender.track?.kind !== 'video') return;
    const parameters = sender.getParameters();
    if (!parameters.encodings?.length) parameters.encodings = [{}];
    const encoding = parameters.encodings[0];
    encoding.maxBitrate = Math.min(encoding.maxBitrate || videoCap, videoCap);
    encoding.maxFramerate = Math.min(encoding.maxFramerate || frameRateCap, frameRateCap);
    parameters.degradationPreference = sender.track.contentHint === 'detail'
      ? 'maintain-resolution'
      : 'balanced';
    await sender.setParameters(parameters).catch(() => undefined);
  }));
};

const StreamAudio: React.FC<{ stream: MediaStream }> = ({ stream }) => {
  const ref = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream;
  }, [stream]);

  return <audio ref={ref} autoPlay playsInline />;
};

const StreamVideo: React.FC<{
  stream: MediaStream;
  className?: string;
  mirror?: boolean;
}> = ({ stream, className = '', mirror = false }) => {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream;
  }, [stream]);

  return (
    <video
      ref={ref}
      autoPlay
      playsInline
      muted
      className={`${className} ${mirror ? '-scale-x-100' : ''}`}
    />
  );
};

const ParticipantAvatar: React.FC<{
  participant?: StudyRoomParticipant;
  label: string;
  compact?: boolean;
}> = ({ participant, label, compact = false }) => (
  <div
    className={`${compact ? 'h-10 w-10 rounded-xl' : 'h-16 w-16 rounded-2xl'} overflow-hidden bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center font-black text-white shadow-lg`}
  >
    {participant?.photoURL ? (
      <img
        src={participant.photoURL}
        alt=""
        className="h-full w-full object-cover"
        referrerPolicy="no-referrer"
      />
    ) : label.slice(0, 1).toUpperCase()}
  </div>
);

export const GroupStudyCall: React.FC<GroupStudyCallProps> = ({
  room,
  currentUser,
  onClose,
}) => {
  const [participants, setParticipants] = useState<StudyRoomParticipant[]>([]);
  const [currentRoom, setCurrentRoom] = useState(room);
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());
  const [status, setStatus] = useState<'joining' | 'active' | 'error'>('joining');
  const [error, setError] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraBusy, setCameraBusy] = useState(false);
  const [sharingScreen, setSharingScreen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [localPreviewStream, setLocalPreviewStream] = useState<MediaStream | null>(null);
  const [youtubeInput, setYoutubeInput] = useState('');
  const [youtubeComposerOpen, setYoutubeComposerOpen] = useState(false);
  const [sharedYouTubeId, setSharedYouTubeId] = useState(room.youtubeVideoId || '');
  const [youtubePlaybackState, setYoutubePlaybackState] = useState<'playing' | 'paused'>(room.youtubePlaybackState || 'paused');
  const [youtubePlaybackTime, setYoutubePlaybackTime] = useState(room.youtubePlaybackTime || 0);
  const [youtubePlaybackUpdatedAt, setYoutubePlaybackUpdatedAt] = useState(room.youtubePlaybackUpdatedAt);
  const [savingYouTube, setSavingYouTube] = useState(false);
  const [panel, setPanel] = useState<'people' | 'controls' | null>(null);
  const [layoutMode, setLayoutMode] = useState<'grid' | 'focus'>('grid');
  const [spotlightUid, setSpotlightUid] = useState<string | null>(null);
  const [reactionMenuOpen, setReactionMenuOpen] = useState(false);
  const [liveReactions, setLiveReactions] = useState<Array<StudyReaction & { expiresAt: number }>>([]);
  const [busyParticipantUid, setBusyParticipantUid] = useState<string | null>(null);

  const localStreamRef = useRef<MediaStream | null>(null);
  const cameraTrackRef = useRef<MediaStreamTrack | null>(null);
  const screenTrackRef = useRef<MediaStreamTrack | null>(null);
  const activeVideoTrackRef = useRef<MediaStreamTrack | null>(null);
  const connectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const videoSendersRef = useRef<Map<string, RTCRtpSender>>(new Map());
  const pendingCandidatesRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
  const cleanupRef = useRef<((leaveImmediately?: boolean) => Promise<void>) | null>(null);
  const leaveTimerRef = useRef<number | null>(null);
  const lifecycleRef = useRef(0);
  const joinedRef = useRef(false);

  const participantByUid = useMemo(
    () => new Map(participants.map((participant) => [participant.uid, participant])),
    [participants],
  );

  const currentParticipant = participantByUid.get(currentUser.uid);
  const currentName = currentParticipant?.displayName || currentUser.displayName || 'Bạn';
  const isOwner = currentRoom.ownerUid === currentUser.uid;
  const featuredRemoteEntry = useMemo(
    () => [...remoteStreams.entries()].find(([, stream]) => hasLiveVideo(stream)),
    [remoteStreams],
  );

  const setOutgoingVideoTrack = useCallback(async (track: MediaStreamTrack | null) => {
    activeVideoTrackRef.current = track;
    setLocalPreviewStream(track ? new MediaStream([track]) : null);

    await Promise.all([...videoSendersRef.current.values()].map(async (sender) => {
      await sender.replaceTrack(track).catch((replaceError) => {
        console.warn('Could not replace meeting video track:', replaceError);
      });
    }));
    await Promise.all([...connectionsRef.current.values()].map((connection) => (
      optimizeMeetingConnection(connection, connectionsRef.current.size)
    )));
  }, []);

  const stopScreenShare = useCallback(async () => {
    const track = screenTrackRef.current;
    if (!track) return;
    screenTrackRef.current = null;
    track.onended = null;
    track.stop();
    setSharingScreen(false);
    void setStudyParticipantState(room.id, currentUser.uid, { sharingScreen: false }).catch(() => undefined);

    const cameraTrack = cameraTrackRef.current?.readyState === 'live'
      ? cameraTrackRef.current
      : null;
    await setOutgoingVideoTrack(cameraTrack);
  }, [currentUser.uid, room.id, setOutgoingVideoTrack]);

  useEffect(() => {
    const lifecycle = ++lifecycleRef.current;
    if (leaveTimerRef.current !== null) {
      window.clearTimeout(leaveTimerRef.current);
      leaveTimerRef.current = null;
    }

    let disposed = false;
    let participantUnsubscribe: (() => void) | undefined;
    let roomUnsubscribe: (() => void) | undefined;
    let signalUnsubscribe: (() => void) | undefined;
    let heartbeat: number | undefined;
    let activeIceServers: RTCIceServer[] = [];

    const flushCandidates = async (peerUid: string, connection: RTCPeerConnection) => {
      const candidates = pendingCandidatesRef.current.get(peerUid) || [];
      pendingCandidatesRef.current.delete(peerUid);
      for (const candidate of candidates) {
        await connection.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => undefined);
      }
    };

    const createConnection = (peerUid: string) => {
      const existing = connectionsRef.current.get(peerUid);
      if (existing) return existing;

      const connection = new RTCPeerConnection({
        iceServers: activeIceServers,
        iceCandidatePoolSize: 4,
      });

      localStreamRef.current?.getAudioTracks().forEach((track) => {
        connection.addTrack(track, localStreamRef.current!);
      });

      const videoTransceiver = connection.addTransceiver('video', { direction: 'sendrecv' });
      videoSendersRef.current.set(peerUid, videoTransceiver.sender);
      if (activeVideoTrackRef.current) {
        void videoTransceiver.sender.replaceTrack(activeVideoTrackRef.current);
      }

      connection.onicecandidate = (event) => {
        if (!event.candidate) return;
        void sendStudySignal(room.id, currentUser.uid, peerUid, 'candidate', {
          candidate: event.candidate.toJSON(),
        }).catch((candidateError) => console.warn('Could not send study ICE candidate:', candidateError));
      };
      connection.ontrack = (event) => {
        const stream = event.streams[0] || new MediaStream([event.track]);
        setRemoteStreams((current) => new Map(current).set(peerUid, stream));
        event.track.onunmute = () => {
          setRemoteStreams((current) => new Map(current).set(peerUid, stream));
        };
      };
      connection.onconnectionstatechange = () => {
        if (connection.connectionState === 'failed' || connection.connectionState === 'closed') {
          setRemoteStreams((current) => {
            const next = new Map(current);
            next.delete(peerUid);
            return next;
          });
        }
      };
      connectionsRef.current.set(peerUid, connection);
      void optimizeMeetingConnection(connection, connectionsRef.current.size);
      return connection;
    };

    const initiateConnection = async (peerUid: string) => {
      const connection = createConnection(peerUid);
      if (connection.signalingState !== 'stable' || connection.localDescription) return;
      const offer = await connection.createOffer();
      await connection.setLocalDescription(offer);
      await optimizeMeetingConnection(connection, connectionsRef.current.size);
      await sendStudySignal(room.id, currentUser.uid, peerUid, 'offer', {
        description: connection.localDescription?.toJSON() || offer,
      });
    };

    const handleSignal = async (signal: StudySignal) => {
      if (disposed || signal.fromUid === currentUser.uid) return;
      try {
        if (signal.type === 'host-mute') {
          localStreamRef.current?.getAudioTracks().forEach((track) => { track.enabled = false; });
          setMuted(true);
          await setStudyParticipantState(room.id, currentUser.uid, { muted: true });
          toast.info('Chủ phòng đã tắt micro của bạn.');
          return;
        }

        if (signal.type === 'candidate' && signal.candidate) {
          const connection = connectionsRef.current.get(signal.fromUid);
          if (!connection?.remoteDescription) {
            const pending = pendingCandidatesRef.current.get(signal.fromUid) || [];
            pending.push(signal.candidate);
            pendingCandidatesRef.current.set(signal.fromUid, pending);
          } else {
            await connection.addIceCandidate(new RTCIceCandidate(signal.candidate));
          }
          return;
        }

        if (signal.type === 'offer' && signal.description) {
          const connection = createConnection(signal.fromUid);
          await connection.setRemoteDescription(new RTCSessionDescription(signal.description));
          await flushCandidates(signal.fromUid, connection);
          const answer = await connection.createAnswer();
          await connection.setLocalDescription(answer);
          await optimizeMeetingConnection(connection, connectionsRef.current.size);
          await sendStudySignal(room.id, currentUser.uid, signal.fromUid, 'answer', {
            description: connection.localDescription?.toJSON() || answer,
          });
          return;
        }

        if (signal.type === 'answer' && signal.description) {
          const connection = connectionsRef.current.get(signal.fromUid);
          if (connection?.signalingState === 'have-local-offer') {
            await connection.setRemoteDescription(new RTCSessionDescription(signal.description));
            await flushCandidates(signal.fromUid, connection);
          }
        }
      } catch (signalError) {
        console.warn('Could not process meeting room signal:', signalError);
      } finally {
        await removeStudySignal(room.id, signal.id).catch(() => undefined);
      }
    };

    const cleanup = async (leaveImmediately = false) => {
      if (disposed) return;
      disposed = true;
      participantUnsubscribe?.();
      roomUnsubscribe?.();
      signalUnsubscribe?.();
      if (heartbeat) window.clearInterval(heartbeat);
      connectionsRef.current.forEach((connection) => connection.close());
      connectionsRef.current.clear();
      videoSendersRef.current.clear();
      pendingCandidatesRef.current.clear();
      screenTrackRef.current?.stop();
      cameraTrackRef.current?.stop();
      localStreamRef.current?.getTracks().forEach((track) => track.stop());
      screenTrackRef.current = null;
      cameraTrackRef.current = null;
      activeVideoTrackRef.current = null;
      localStreamRef.current = null;
      joinedRef.current = false;
      if (leaveImmediately) {
        await leaveStudyRoom(room);
      } else {
        leaveTimerRef.current = window.setTimeout(() => {
          leaveTimerRef.current = null;
          void leaveStudyRoom(room);
        }, 300);
      }
    };
    cleanupRef.current = cleanup;

    const initialize = async () => {
      try {
        activeIceServers = await getCallIceServersForSession();
        const joinState = await joinStudyRoom(room.id);
        joinedRef.current = true;
        if (disposed) {
          if (lifecycleRef.current === lifecycle) await leaveStudyRoom(room);
          return;
        }

        const stream = await navigator.mediaDevices.getUserMedia(getCallMediaConstraints(false));
        if (disposed) {
          stream.getTracks().forEach((track) => track.stop());
          if (lifecycleRef.current === lifecycle) await leaveStudyRoom(room);
          return;
        }
        localStreamRef.current = stream;
        applyCallTrackHints(stream);
        const startsMuted = joinState.audioLocked && room.ownerUid !== currentUser.uid;
        if (startsMuted) {
          stream.getAudioTracks().forEach((track) => { track.enabled = false; });
          setMuted(true);
        }
        setCurrentRoom((current) => ({
          ...current,
          roomLocked: joinState.roomLocked,
          audioLocked: joinState.audioLocked,
          videoLocked: joinState.videoLocked,
          screenShareLocked: joinState.screenShareLocked,
        }));
        await setStudyParticipantState(room.id, currentUser.uid, {
          muted: startsMuted,
          cameraOn: false,
          sharingScreen: false,
        }).catch(() => undefined);

        roomUnsubscribe = subscribeToStudyRoom(room.id, (latestRoom) => {
          if (disposed) return;
          if (!latestRoom || latestRoom.status !== 'open') {
            setError('Chủ phòng đã đóng phòng họp.');
            void cleanup(true).finally(onClose);
            return;
          }
          setCurrentRoom(latestRoom);
          setSharedYouTubeId(latestRoom.youtubeVideoId || '');
          setYoutubePlaybackState(latestRoom.youtubePlaybackState || 'paused');
          setYoutubePlaybackTime(latestRoom.youtubePlaybackTime || 0);
          setYoutubePlaybackUpdatedAt(latestRoom.youtubePlaybackUpdatedAt);
          if (latestRoom.ownerUid !== currentUser.uid) {
            const audioTrack = localStreamRef.current?.getAudioTracks()[0];
            if (latestRoom.audioLocked && audioTrack?.enabled) {
              audioTrack.enabled = false;
              setMuted(true);
              void setStudyParticipantState(room.id, currentUser.uid, { muted: true }).catch(() => undefined);
              toast.info('Chủ phòng đã khóa micro thành viên.');
            }
            if (latestRoom.videoLocked && cameraTrackRef.current) {
              const track = cameraTrackRef.current;
              cameraTrackRef.current = null;
              track.onended = null;
              track.stop();
              setCameraOn(false);
              if (!screenTrackRef.current) void setOutgoingVideoTrack(null);
              void setStudyParticipantState(room.id, currentUser.uid, { cameraOn: false }).catch(() => undefined);
              toast.info('Chủ phòng đã khóa camera thành viên.');
            }
            if (latestRoom.screenShareLocked && screenTrackRef.current) {
              void stopScreenShare();
              toast.info('Chủ phòng chỉ cho phép chủ phòng chia sẻ màn hình.');
            }
          }
        }, (roomError) => {
          console.warn('Meeting room status listener failed:', roomError);
        });

        signalUnsubscribe = subscribeToStudySignals(room.id, currentUser.uid, (signal) => {
          void handleSignal(signal);
        }, (signalError) => {
          console.error('Meeting signal listener failed:', signalError);
          setError('Tín hiệu phòng họp bị gián đoạn.');
        });

        participantUnsubscribe = subscribeToStudyRoomParticipants(room.id, (nextParticipants) => {
          if (disposed) return;
          setParticipants(nextParticipants);
          const peerUids = new Set(nextParticipants.map((participant) => participant.uid));
          if (joinedRef.current && !peerUids.has(currentUser.uid)) {
            joinedRef.current = false;
            toast.error('Chủ phòng đã mời bạn rời khỏi phòng.');
            void cleanup(true).finally(onClose);
            return;
          }

          connectionsRef.current.forEach((connection, peerUid) => {
            if (!peerUids.has(peerUid)) {
              connection.close();
              connectionsRef.current.delete(peerUid);
              videoSendersRef.current.delete(peerUid);
              setRemoteStreams((current) => {
                const next = new Map(current);
                next.delete(peerUid);
                return next;
              });
            }
          });

          nextParticipants.forEach((participant) => {
            if (participant.uid !== currentUser.uid && currentUser.uid < participant.uid) {
              void initiateConnection(participant.uid).catch((connectionError) => {
                console.warn('Could not initiate meeting peer connection:', connectionError);
              });
            }
          });
          connectionsRef.current.forEach((connection) => {
            void optimizeMeetingConnection(connection, Math.max(1, nextParticipants.length - 1));
          });
        }, (participantsError) => {
          console.error('Meeting participant listener failed:', participantsError);
          setError('Không thể cập nhật danh sách thành viên.');
        });

        heartbeat = window.setInterval(() => {
          void touchStudyRoom(room, currentUser.uid).catch(() => undefined);
        }, 45_000);
        setStatus('active');
        void playAppSound('study-room', { volume: 0.56 });
      } catch (joinError) {
        console.error('Could not join meeting room:', joinError);
        setError(getStudyRoomErrorMessage(joinError));
        setStatus('error');
        await cleanup(true);
      }
    };

    void initialize();
    return () => { void cleanup(); };
  }, [currentUser.uid, onClose, room, setOutgoingVideoTrack, stopScreenShare]);

  useEffect(() => {
    if (status !== 'active') return undefined;
    const unsubscribe = subscribeToStudyReactions(room.id, (reaction) => {
      const expiresAt = Date.now() + 4_200;
      setLiveReactions((current) => [
        ...current.filter((item) => item.id !== reaction.id && item.expiresAt > Date.now()),
        { ...reaction, expiresAt },
      ].slice(-8));
      window.setTimeout(() => {
        setLiveReactions((current) => current.filter((item) => item.id !== reaction.id));
      }, 4_300);
    }, (reactionError) => console.warn('Meeting reaction listener failed:', reactionError));
    return unsubscribe;
  }, [room.id, status]);

  const toggleMute = () => {
    if (muted && currentRoom.audioLocked && !isOwner) {
      toast.info('Chủ phòng đang khóa micro thành viên.');
      return;
    }
    const next = !muted;
    localStreamRef.current?.getAudioTracks().forEach((track) => { track.enabled = !next; });
    setMuted(next);
    void setStudyParticipantState(room.id, currentUser.uid, { muted: next }).catch(() => {
      toast.error('Chưa cập nhật được trạng thái micro.');
    });
  };

  const toggleCamera = async () => {
    if (cameraBusy || status !== 'active') return;
    setCameraBusy(true);
    setError(null);
    try {
      const existingTrack = cameraTrackRef.current;
      if (existingTrack) {
        cameraTrackRef.current = null;
        existingTrack.onended = null;
        existingTrack.stop();
        setCameraOn(false);
        await setStudyParticipantState(room.id, currentUser.uid, { cameraOn: false }).catch(() => undefined);
        if (!screenTrackRef.current) await setOutgoingVideoTrack(null);
        return;
      }

      if (currentRoom.videoLocked && !isOwner) {
        toast.info('Chủ phòng đang khóa camera thành viên.');
        return;
      }

      const constraints = getCallMediaConstraints(true).video;
      const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: constraints });
      const track = stream.getVideoTracks()[0];
      if (!track) throw new Error('Camera did not provide a video track.');
      if ('contentHint' in track) track.contentHint = 'motion';
      track.onended = () => {
        if (cameraTrackRef.current !== track) return;
        cameraTrackRef.current = null;
        setCameraOn(false);
        void setStudyParticipantState(room.id, currentUser.uid, { cameraOn: false }).catch(() => undefined);
        if (!screenTrackRef.current) void setOutgoingVideoTrack(null);
      };
      cameraTrackRef.current = track;
      setCameraOn(true);
      await setStudyParticipantState(room.id, currentUser.uid, { cameraOn: true }).catch(() => undefined);
      if (!screenTrackRef.current) await setOutgoingVideoTrack(track);
    } catch (cameraError) {
      console.error('Could not open meeting camera:', cameraError);
      setError('Không mở được camera. Hãy cho phép quyền camera trong trình duyệt rồi thử lại.');
    } finally {
      setCameraBusy(false);
    }
  };

  const toggleScreenShare = async () => {
    if (status !== 'active') return;
    setError(null);
    if (screenTrackRef.current) {
      await stopScreenShare();
      return;
    }
    if (currentRoom.screenShareLocked && !isOwner) {
      toast.info('Chỉ chủ phòng đang được phép chia sẻ màn hình.');
      return;
    }
    if (!supportsDisplayCapture()) {
      setError('Thiết bị hoặc trình duyệt này chưa hỗ trợ chia sẻ màn hình.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { ideal: 15, max: 24 } },
        audio: false,
      });
      const track = stream.getVideoTracks()[0];
      if (!track) throw new Error('Screen capture did not provide a video track.');
      if ('contentHint' in track) track.contentHint = 'detail';
      screenTrackRef.current = track;
      setSharingScreen(true);
      await setStudyParticipantState(room.id, currentUser.uid, { sharingScreen: true }).catch(() => undefined);
      track.onended = () => { void stopScreenShare(); };
      await setOutgoingVideoTrack(track);
    } catch (shareError) {
      if ((shareError as DOMException)?.name !== 'NotAllowedError') {
        console.error('Could not share meeting screen:', shareError);
        setError('Không thể chia sẻ màn hình. Hãy thử lại hoặc chọn một cửa sổ khác.');
      }
    }
  };

  const saveYouTube = async () => {
    if (room.ownerUid !== currentUser.uid || savingYouTube) return;
    const videoId = extractYouTubeVideoId(youtubeInput);
    if (!videoId) {
      setError('Link YouTube chưa đúng. Hãy dán link video, Shorts hoặc youtu.be.');
      return;
    }
    setSavingYouTube(true);
    setError(null);
    try {
      await setStudyRoomYouTube(room.id, videoId);
      setYoutubeInput('');
      setYoutubeComposerOpen(false);
    } catch (youtubeError) {
      console.error('Could not share YouTube video:', youtubeError);
      setError('Chưa thể chia sẻ video YouTube vào phòng.');
    } finally {
      setSavingYouTube(false);
    }
  };

  const clearYouTube = async () => {
    if (room.ownerUid !== currentUser.uid) return;
    setSavingYouTube(true);
    try {
      await setStudyRoomYouTube(room.id, '');
    } catch (youtubeError) {
      console.error('Could not stop shared YouTube video:', youtubeError);
      setError('Chưa thể đóng video YouTube cho cả phòng.');
    } finally {
      setSavingYouTube(false);
    }
  };

  const copyInviteLink = async () => {
    const inviteUrl = `${window.location.origin}/connect/study?room=${encodeURIComponent(room.id)}`;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      toast.success('Đã sao chép link mời vào phòng.');
    } catch {
      window.prompt('Sao chép link mời này:', inviteUrl);
    }
  };

  const toggleHand = async () => {
    const handRaised = !Boolean(currentParticipant?.handRaised);
    try {
      await setStudyParticipantState(room.id, currentUser.uid, { handRaised });
      if (handRaised) toast.success('Bạn đã giơ tay.');
    } catch (handError) {
      console.error('Could not update hand raise:', handError);
      toast.error('Chưa thể cập nhật trạng thái giơ tay.');
    }
  };

  const react = async (emoji: string) => {
    setReactionMenuOpen(false);
    try {
      await sendStudyReaction(room.id, currentUser.uid, currentName, emoji);
    } catch (reactionError) {
      console.error('Could not send meeting reaction:', reactionError);
      toast.error('Chưa gửi được cảm xúc.');
    }
  };

  const muteParticipant = async (participant: StudyRoomParticipant) => {
    if (!isOwner || participant.uid === currentUser.uid) return;
    try {
      await sendStudySignal(room.id, currentUser.uid, participant.uid, 'host-mute');
      toast.success(`Đã tắt micro của ${participant.displayName}.`);
    } catch (muteError) {
      console.error('Could not mute participant:', muteError);
      toast.error('Chưa thể tắt micro thành viên này.');
    }
  };

  const removeParticipant = async (participant: StudyRoomParticipant) => {
    if (!isOwner || participant.uid === currentUser.uid || busyParticipantUid) return;
    setBusyParticipantUid(participant.uid);
    try {
      await removeStudyRoomParticipant(room.id, participant.uid);
      toast.success(`Đã mời ${participant.displayName} rời phòng.`);
    } catch (removeError) {
      console.error('Could not remove participant:', removeError);
      toast.error(getStudyRoomErrorMessage(removeError));
    } finally {
      setBusyParticipantUid(null);
    }
  };

  const toggleControl = async (control: StudyRoomControl, enabled: boolean) => {
    if (!isOwner) return;
    const previous = currentRoom[control];
    setCurrentRoom((current) => ({ ...current, [control]: enabled }));
    try {
      await setStudyRoomControl(room.id, control, enabled);
      if (control === 'audioLocked' && enabled) {
        await Promise.allSettled(participants
          .filter((participant) => participant.uid !== currentUser.uid)
          .map((participant) => sendStudySignal(room.id, currentUser.uid, participant.uid, 'host-mute')));
      }
    } catch (controlError) {
      console.error('Could not update room controls:', controlError);
      setCurrentRoom((current) => ({ ...current, [control]: previous }));
      toast.error('Chưa thể cập nhật quyền phòng họp.');
    }
  };

  const close = async () => {
    await cleanupRef.current?.(true);
    onClose();
  };

  const renderParticipantTile = (participant: StudyRoomParticipant, featured = false) => {
    const isCurrentUser = participant.uid === currentUser.uid;
    const stream = isCurrentUser ? localPreviewStream : remoteStreams.get(participant.uid);
    const hasVideo = hasLiveVideo(stream);
    const isPresenting = isCurrentUser ? sharingScreen : Boolean(participant.sharingScreen);

    return (
      <button
        type="button"
        key={participant.uid}
        onClick={() => { setSpotlightUid(participant.uid); setLayoutMode('focus'); }}
        className={`relative w-full overflow-hidden rounded-3xl border bg-slate-950 text-left shadow-xl transition hover:border-indigo-400/60 ${featured ? 'min-h-[min(62vh,38rem)] border-indigo-400/40' : 'min-h-[13rem] border-white/10'}`}
        aria-label={`Tập trung vào ${isCurrentUser ? 'bạn' : participant.displayName}`}
      >
        {hasVideo && stream ? (
          <StreamVideo
            stream={stream}
            mirror={isCurrentUser && !isPresenting}
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-950">
            <ParticipantAvatar participant={participant} label={participant.displayName} />
            <p className="mt-3 text-sm font-black text-white">{isCurrentUser ? 'Bạn' : participant.displayName}</p>
          </div>
        )}
        <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-gradient-to-t from-black/80 to-transparent px-4 pb-3 pt-10">
          <span className="truncate text-sm font-bold text-white">{isCurrentUser ? 'Bạn' : participant.displayName}</span>
          <span className="flex items-center gap-1.5">
            {participant.handRaised && <span className="flex h-7 w-7 items-center justify-center rounded-full bg-amber-400 text-slate-950"><Hand className="h-4 w-4" /></span>}
            {participant.muted && <span className="flex h-7 w-7 items-center justify-center rounded-full bg-rose-500 text-white"><MicOff className="h-4 w-4" /></span>}
            {isPresenting && <span className="rounded-full bg-sky-500/90 px-2 py-1 text-[10px] font-black">Đang chia sẻ</span>}
          </span>
        </div>
      </button>
    );
  };

  const focusedParticipant = participantByUid.get(spotlightUid || '')
    || (featuredRemoteEntry ? participantByUid.get(featuredRemoteEntry[0]) : undefined)
    || currentParticipant
    || participants[0];

  const miniStream = featuredRemoteEntry?.[1] || localPreviewStream;
  const miniPeer = featuredRemoteEntry ? participantByUid.get(featuredRemoteEntry[0]) : currentParticipant;
  const miniLabel = featuredRemoteEntry ? miniPeer?.displayName || 'Thành viên' : currentName;

  return (
    <>
      {[...remoteStreams.entries()].map(([uid, stream]) => <StreamAudio key={uid} stream={stream} />)}

      <div className="pointer-events-none fixed inset-0 z-[230] flex items-center justify-center overflow-hidden" aria-live="polite">
        <div className="flex max-w-[90vw] flex-wrap items-center justify-center gap-3">
          {liveReactions.map((reaction) => (
            <div key={reaction.id} className="animate-bounce rounded-3xl border border-white/20 bg-slate-950/80 px-4 py-3 text-center shadow-2xl backdrop-blur-xl">
              <div className="text-4xl">{reaction.emoji}</div>
              <div className="mt-1 max-w-28 truncate text-[10px] font-black text-white">{reaction.displayName}</div>
            </div>
          ))}
        </div>
      </div>

      {isMinimized && (
        <aside className="fixed bottom-[calc(5.25rem+env(safe-area-inset-bottom))] right-3 z-[10001] w-[min(21rem,calc(100vw-1.5rem))] overflow-hidden rounded-3xl border border-white/15 bg-slate-950 text-white shadow-2xl sm:bottom-5 sm:right-5" aria-label="Phòng họp đang thu nhỏ">
          <div className="relative h-36 bg-gradient-to-br from-indigo-900 to-slate-950">
            {miniStream && hasLiveVideo(miniStream) ? (
              <StreamVideo stream={miniStream} mirror={!featuredRemoteEntry && !sharingScreen} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full items-center justify-center"><ParticipantAvatar participant={miniPeer} label={miniLabel} /></div>
            )}
            <button onClick={() => setIsMinimized(false)} className="absolute right-3 top-3 rounded-full bg-black/55 p-2 backdrop-blur" aria-label="Mở rộng phòng họp">
              <Maximize2 className="h-4 w-4" />
            </button>
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent px-4 pb-3 pt-8">
              <p className="truncate text-sm font-black">{currentRoom.title}</p>
              <p className="text-[11px] text-slate-300">{participants.length} người · vẫn đang kết nối</p>
            </div>
          </div>
          <div className="flex items-center justify-center gap-3 p-3">
            <button onClick={toggleMute} className={`rounded-full p-3 ${muted ? 'bg-amber-500' : 'bg-white/10'}`} aria-label={muted ? 'Bật micro' : 'Tắt micro'}>
              {muted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
            </button>
            <button onClick={() => void toggleCamera()} disabled={cameraBusy || sharingScreen} className={`rounded-full p-3 disabled:opacity-40 ${cameraOn ? 'bg-indigo-600' : 'bg-white/10'}`} aria-label={cameraOn ? 'Tắt camera' : 'Bật camera'}>
              {cameraBusy ? <Loader2 className="h-5 w-5 animate-spin" /> : cameraOn ? <Camera className="h-5 w-5" /> : <CameraOff className="h-5 w-5" />}
            </button>
            <button onClick={() => void close()} className="rounded-full bg-rose-600 p-3" aria-label="Rời phòng họp"><PhoneOff className="h-5 w-5" /></button>
          </div>
        </aside>
      )}

      <div className={`${isMinimized ? 'hidden' : 'meeting-room-dialog fixed'} inset-0 z-[210] flex h-[100dvh] w-screen flex-col overflow-hidden bg-slate-950 text-white`} role="dialog" aria-modal="true" aria-label="Phòng họp học nhóm">
        <header className="flex flex-none items-center justify-between gap-3 border-b border-white/10 bg-slate-950/95 px-3 py-3 sm:px-5">
          <div className="min-w-0">
            <p className="truncate text-sm font-black sm:text-base">{currentRoom.title}</p>
            <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-slate-400"><Users className="h-3.5 w-3.5" /> {participants.length}/{currentRoom.maxParticipants} người · {currentRoom.subject || 'Học chung'}</p>
          </div>
          <div className="flex flex-none items-center gap-2">
            <button onClick={() => void copyInviteLink()} className="hidden rounded-full bg-white/10 p-2.5 hover:bg-white/20 sm:block" aria-label="Sao chép link mời"><Copy className="h-5 w-5" /></button>
            <button onClick={() => setLayoutMode((current) => current === 'grid' ? 'focus' : 'grid')} className="hidden rounded-full bg-white/10 p-2.5 hover:bg-white/20 sm:block" aria-label={layoutMode === 'grid' ? 'Chuyển sang bố cục tập trung' : 'Chuyển sang bố cục lưới'}>
              {layoutMode === 'grid' ? <LayoutPanelTop className="h-5 w-5" /> : <Grid2X2 className="h-5 w-5" />}
            </button>
            <button onClick={() => setPanel('people')} className={`rounded-full p-2.5 ${panel === 'people' ? 'bg-indigo-600' : 'bg-white/10 hover:bg-white/20'}`} aria-label="Người tham gia"><Users className="h-5 w-5" /></button>
            {isOwner && <button onClick={() => setPanel('controls')} className={`rounded-full p-2.5 ${panel === 'controls' ? 'bg-indigo-600' : 'bg-white/10 hover:bg-white/20'}`} aria-label="Quyền chủ phòng"><Settings2 className="h-5 w-5" /></button>}
            <button onClick={() => setIsMinimized(true)} className="rounded-full bg-white/10 p-2.5 hover:bg-white/20" aria-label="Thu nhỏ phòng họp"><Minimize2 className="h-5 w-5" /></button>
            <button onClick={() => void close()} className="rounded-full bg-rose-600 p-2.5 hover:bg-rose-500" aria-label={isOwner ? 'Đóng phòng' : 'Rời phòng'}><PhoneOff className="h-5 w-5" /></button>
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto px-3 py-3 pb-32 sm:px-5 sm:pb-28">
          {status === 'joining' && (
            <div className="flex min-h-[45vh] flex-col items-center justify-center text-center">
              <Loader2 className="h-10 w-10 animate-spin text-indigo-300" />
              <p className="mt-4 font-bold">Đang kết nối micro và thành viên…</p>
              <p className="mt-1 text-xs text-slate-400">TURN sẽ tự hỗ trợ khi Wi‑Fi chặn kết nối trực tiếp.</p>
            </div>
          )}

          {error && (
            <div className="mx-auto mb-4 flex max-w-3xl items-start justify-between gap-3 rounded-2xl border border-rose-400/20 bg-rose-500/15 px-4 py-3 text-sm text-rose-100">
              <p>{error}</p>
              <button onClick={() => setError(null)} aria-label="Đóng thông báo"><X className="h-4 w-4" /></button>
            </div>
          )}

          {sharedYouTubeId && (
            <section className="mx-auto mb-4 max-w-5xl overflow-hidden rounded-3xl border border-white/10 bg-black shadow-2xl">
              <div className="flex items-center justify-between gap-3 border-b border-white/10 bg-slate-900 px-4 py-3">
                <p className="flex items-center gap-2 text-sm font-black"><Youtube className="h-5 w-5 text-red-500" /> Cùng xem YouTube</p>
                {isOwner && (
                  <button onClick={() => void clearYouTube()} disabled={savingYouTube} className="rounded-full bg-white/10 px-3 py-1.5 text-xs font-bold hover:bg-white/20">Đóng video</button>
                )}
              </div>
              <div className="aspect-video bg-black">
                <SynchronizedYouTubePlayer
                  key={`${sharedYouTubeId}-${isOwner ? 'controller' : 'viewer'}`}
                  roomId={room.id}
                  videoId={sharedYouTubeId}
                  isController={isOwner}
                  playbackState={youtubePlaybackState}
                  playbackTime={youtubePlaybackTime}
                  playbackUpdatedAt={youtubePlaybackUpdatedAt}
                />
              </div>
              <div className="flex items-center justify-between gap-3 bg-slate-900 px-4 py-2 text-xs text-slate-400">
                <span>{isOwner ? 'Bạn điều khiển; mọi người tự đồng bộ theo thời gian thực.' : 'Phát, dừng và tua đang theo chủ phòng.'}</span>
                <a href={getYouTubeWatchUrl(sharedYouTubeId)} target="_blank" rel="noopener noreferrer" className="flex-none rounded-full bg-white/10 px-3 py-1.5 font-bold text-white hover:bg-white/20">Mở YouTube</a>
              </div>
            </section>
          )}

          {status !== 'joining' && layoutMode === 'grid' && (
            <div className={`mx-auto grid max-w-6xl gap-3 ${participants.length <= 1 ? 'max-w-xl grid-cols-1' : participants.length === 2 ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'}`}>
              {participants.map((participant) => renderParticipantTile(participant))}
            </div>
          )}

          {status !== 'joining' && layoutMode === 'focus' && focusedParticipant && (
            <div className="mx-auto max-w-6xl">
              {renderParticipantTile(focusedParticipant, true)}
              <div className="mt-3 flex snap-x gap-2 overflow-x-auto pb-2">
                {participants.map((participant) => (
                  <button key={participant.uid} onClick={() => setSpotlightUid(participant.uid)} className={`flex min-w-[10rem] snap-start items-center gap-2 rounded-2xl border px-3 py-2 text-left ${focusedParticipant.uid === participant.uid ? 'border-indigo-400 bg-indigo-500/15' : 'border-white/10 bg-white/5'}`}>
                    <ParticipantAvatar participant={participant} label={participant.displayName} compact />
                    <span className="min-w-0 flex-1 truncate text-xs font-black">{participant.uid === currentUser.uid ? 'Bạn' : participant.displayName}</span>
                    {participant.handRaised && <Hand className="h-4 w-4 flex-none text-amber-300" />}
                  </button>
                ))}
              </div>
            </div>
          )}

          {status === 'active' && participants.length <= 1 && (
            <div className="mx-auto mt-4 max-w-xl rounded-2xl border border-dashed border-indigo-400/40 p-4 text-center text-sm text-slate-300">
              <Users className="mx-auto mb-2 h-6 w-6 text-indigo-300" />
              Phòng đã sẵn sàng. Thành viên khác có thể vào từ danh sách phòng học.
            </div>
          )}

          {youtubeComposerOpen && isOwner && (
            <div className="mx-auto mt-4 max-w-2xl rounded-2xl border border-white/10 bg-slate-900 p-4">
              <label className="text-sm font-bold" htmlFor="meeting-youtube-link">Dán link YouTube để cả phòng cùng xem</label>
              <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                <input id="meeting-youtube-link" value={youtubeInput} onChange={(event) => setYoutubeInput(event.target.value)} placeholder="https://youtu.be/…" className="min-h-11 min-w-0 flex-1 rounded-xl border border-white/10 bg-slate-800 px-3 text-sm text-white outline-none focus:border-indigo-400" />
                <button onClick={() => void saveYouTube()} disabled={savingYouTube} className="min-h-11 rounded-xl bg-red-600 px-4 text-sm font-black disabled:opacity-50">{savingYouTube ? 'Đang mở…' : 'Mở cho cả phòng'}</button>
              </div>
              <p className="mt-2 text-xs text-slate-400">Không cần API trả phí; video phát từ trình nhúng riêng tư của YouTube.</p>
            </div>
          )}

          <div className="mx-auto mt-5 flex max-w-3xl items-start gap-2 text-xs text-slate-400">
            <ShieldCheck className="h-4 w-4 flex-none text-emerald-400" />
            <p>Âm thanh và hình ảnh truyền trực tiếp giữa các thành viên, dùng TURN hiện có khi Wi‑Fi chặn WebRTC. Camera chỉ mở khi bạn bấm bật.</p>
          </div>
        </main>

        <footer className="fixed inset-x-0 bottom-0 z-10 border-t border-white/10 bg-slate-950/95 px-2 pb-[calc(.6rem+env(safe-area-inset-bottom))] pt-2 backdrop-blur-xl">
          <div className="mx-auto flex max-w-4xl items-center justify-start gap-2 overflow-x-auto px-1 sm:justify-center sm:gap-3">
            <button onClick={toggleMute} disabled={status !== 'active' || (muted && currentRoom.audioLocked && !isOwner)} className={`flex h-12 min-w-12 items-center justify-center rounded-full disabled:opacity-40 ${muted ? 'bg-amber-500' : 'bg-white/10 hover:bg-white/20'}`} aria-label={muted ? 'Bật micro' : 'Tắt micro'}>
              {muted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
            </button>
            <button onClick={() => void toggleCamera()} disabled={status !== 'active' || cameraBusy || sharingScreen || (!cameraOn && currentRoom.videoLocked && !isOwner)} className={`flex h-12 min-w-12 items-center justify-center rounded-full disabled:opacity-40 ${cameraOn ? 'bg-indigo-600' : 'bg-white/10 hover:bg-white/20'}`} aria-label={cameraOn ? 'Tắt camera' : 'Bật camera'}>
              {cameraBusy ? <Loader2 className="h-5 w-5 animate-spin" /> : cameraOn ? <Camera className="h-5 w-5" /> : <CameraOff className="h-5 w-5" />}
            </button>
            <button onClick={() => void toggleScreenShare()} disabled={status !== 'active' || (!sharingScreen && currentRoom.screenShareLocked && !isOwner)} className={`flex h-12 min-w-12 items-center justify-center rounded-full disabled:opacity-40 ${sharingScreen ? 'bg-sky-600' : 'bg-white/10 hover:bg-white/20'}`} aria-label={sharingScreen ? 'Dừng chia sẻ màn hình' : 'Chia sẻ màn hình'}>
              {sharingScreen ? <ScreenShareOff className="h-5 w-5" /> : <ScreenShare className="h-5 w-5" />}
            </button>
            <button onClick={() => void toggleHand()} disabled={status !== 'active'} className={`flex h-12 min-w-12 items-center justify-center rounded-full disabled:opacity-40 ${currentParticipant?.handRaised ? 'bg-amber-500 text-slate-950' : 'bg-white/10 hover:bg-white/20'}`} aria-label={currentParticipant?.handRaised ? 'Hạ tay' : 'Giơ tay'}><Hand className="h-5 w-5" /></button>
            <div className="relative flex-none">
              {reactionMenuOpen && (
                <div className="absolute bottom-14 left-1/2 flex -translate-x-1/2 gap-1 rounded-2xl border border-white/10 bg-slate-900 p-2 shadow-2xl">
                  {['👍', '❤️', '😂', '🎉', '👏', '😮'].map((emoji) => <button key={emoji} onClick={() => void react(emoji)} className="rounded-xl p-2 text-2xl hover:bg-white/10" aria-label={`Gửi ${emoji}`}>{emoji}</button>)}
                </div>
              )}
              <button onClick={() => setReactionMenuOpen((current) => !current)} disabled={status !== 'active'} className={`flex h-12 min-w-12 items-center justify-center rounded-full disabled:opacity-40 ${reactionMenuOpen ? 'bg-violet-600' : 'bg-white/10 hover:bg-white/20'}`} aria-label="Gửi cảm xúc"><Smile className="h-5 w-5" /></button>
            </div>
            <button onClick={() => void copyInviteLink()} className="flex h-12 min-w-12 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 sm:hidden" aria-label="Sao chép link mời"><Copy className="h-5 w-5" /></button>
            <button onClick={() => setLayoutMode((current) => current === 'grid' ? 'focus' : 'grid')} className="flex h-12 min-w-12 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 sm:hidden" aria-label={layoutMode === 'grid' ? 'Bố cục tập trung' : 'Bố cục lưới'}>{layoutMode === 'grid' ? <LayoutPanelTop className="h-5 w-5" /> : <Grid2X2 className="h-5 w-5" />}</button>
            {isOwner && (
              <button onClick={() => setYoutubeComposerOpen((current) => !current)} className={`flex h-12 min-w-12 items-center justify-center rounded-full ${youtubeComposerOpen ? 'bg-red-600' : 'bg-white/10 hover:bg-white/20'}`} aria-label="Cùng xem YouTube"><Youtube className="h-5 w-5" /></button>
            )}
            <button onClick={() => void close()} className="flex h-12 flex-none items-center justify-center gap-2 rounded-full bg-rose-600 px-4 font-black hover:bg-rose-500" aria-label={isOwner ? 'Đóng phòng' : 'Rời phòng'}>
              <PhoneOff className="h-5 w-5" /><span className="hidden sm:inline">{isOwner ? 'Đóng phòng' : 'Rời phòng'}</span>
            </button>
          </div>
        </footer>
      </div>

      {panel && !isMinimized && (
        <MeetingSidePanel
          panel={panel}
          room={currentRoom}
          participants={participants}
          currentUserUid={currentUser.uid}
          busyParticipantUid={busyParticipantUid}
          onClose={() => setPanel(null)}
          onMuteParticipant={(participant) => { void muteParticipant(participant); }}
          onRemoveParticipant={(participant) => { void removeParticipant(participant); }}
          onToggleControl={(control, enabled) => { void toggleControl(control, enabled); }}
        />
      )}
    </>
  );
};
