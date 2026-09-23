import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { User } from 'firebase/auth';
import {
  Camera,
  CameraOff,
  Loader2,
  Maximize2,
  Mic,
  MicOff,
  Minimize2,
  PhoneOff,
  ScreenShare,
  ScreenShareOff,
  ShieldCheck,
  Users,
  X,
  Youtube,
} from 'lucide-react';
import { StudyRoom, StudyRoomParticipant, StudySignal } from '../types/socialAudio';
import { getCallIceServersForSession } from '../services/callService';
import {
  joinStudyRoom,
  leaveStudyRoom,
  removeStudySignal,
  sendStudySignal,
  setStudyRoomYouTube,
  subscribeToStudyRoom,
  subscribeToStudyRoomParticipants,
  subscribeToStudySignals,
  touchStudyRoom,
} from '../services/studyRoomService';
import { getStudyRoomErrorMessage } from '../utils/userFacingErrors';
import { playAppSound } from '../utils/appSounds';
import { applyCallTrackHints, getCallMediaConstraints, optimizeCallSenders } from '../utils/callMedia';
import {
  extractYouTubeVideoId,
  getYouTubeEmbedUrl,
  getYouTubeWatchUrl,
  supportsDisplayCapture,
} from '../utils/meetingMedia';

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
  const [savingYouTube, setSavingYouTube] = useState(false);

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

  const participantByUid = useMemo(
    () => new Map(participants.map((participant) => [participant.uid, participant])),
    [participants],
  );

  const currentParticipant = participantByUid.get(currentUser.uid);
  const currentName = currentParticipant?.displayName || currentUser.displayName || 'Bạn';
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

    const cameraTrack = cameraTrackRef.current?.readyState === 'live'
      ? cameraTrackRef.current
      : null;
    await setOutgoingVideoTrack(cameraTrack);
  }, [setOutgoingVideoTrack]);

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
        await joinStudyRoom(room.id);
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

        roomUnsubscribe = subscribeToStudyRoom(room.id, (latestRoom) => {
          if (disposed) return;
          if (!latestRoom || latestRoom.status !== 'open') {
            setError('Chủ phòng đã đóng phòng họp.');
            void cleanup(true).finally(onClose);
            return;
          }
          setSharedYouTubeId(latestRoom.youtubeVideoId || '');
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
  }, [currentUser.uid, onClose, room]);

  const toggleMute = () => {
    const next = !muted;
    localStreamRef.current?.getAudioTracks().forEach((track) => { track.enabled = !next; });
    setMuted(next);
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
        if (!screenTrackRef.current) await setOutgoingVideoTrack(null);
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
        if (!screenTrackRef.current) void setOutgoingVideoTrack(null);
      };
      cameraTrackRef.current = track;
      setCameraOn(true);
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

  const close = async () => {
    await cleanupRef.current?.(true);
    onClose();
  };

  const renderParticipantTile = (participant: StudyRoomParticipant) => {
    const isCurrentUser = participant.uid === currentUser.uid;
    const stream = isCurrentUser ? localPreviewStream : remoteStreams.get(participant.uid);
    const hasVideo = hasLiveVideo(stream);
    const isPresenting = isCurrentUser && sharingScreen;

    return (
      <div key={participant.uid} className="relative min-h-[13rem] overflow-hidden rounded-3xl border border-white/10 bg-slate-950 shadow-xl">
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
          {isPresenting && <span className="rounded-full bg-sky-500/90 px-2 py-1 text-[10px] font-black">Đang chia sẻ</span>}
        </div>
      </div>
    );
  };

  const miniStream = featuredRemoteEntry?.[1] || localPreviewStream;
  const miniPeer = featuredRemoteEntry ? participantByUid.get(featuredRemoteEntry[0]) : currentParticipant;
  const miniLabel = featuredRemoteEntry ? miniPeer?.displayName || 'Thành viên' : currentName;

  return (
    <>
      {[...remoteStreams.entries()].map(([uid, stream]) => <StreamAudio key={uid} stream={stream} />)}

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
              <p className="truncate text-sm font-black">{room.title}</p>
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
            <p className="truncate text-sm font-black sm:text-base">{room.title}</p>
            <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-slate-400"><Users className="h-3.5 w-3.5" /> {participants.length}/{room.maxParticipants} người · {room.subject || 'Học chung'}</p>
          </div>
          <div className="flex flex-none items-center gap-2">
            <button onClick={() => setIsMinimized(true)} className="rounded-full bg-white/10 p-2.5 hover:bg-white/20" aria-label="Thu nhỏ phòng họp"><Minimize2 className="h-5 w-5" /></button>
            <button onClick={() => void close()} className="rounded-full bg-rose-600 p-2.5 hover:bg-rose-500" aria-label={room.ownerUid === currentUser.uid ? 'Đóng phòng' : 'Rời phòng'}><PhoneOff className="h-5 w-5" /></button>
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
                {room.ownerUid === currentUser.uid && (
                  <button onClick={() => void clearYouTube()} disabled={savingYouTube} className="rounded-full bg-white/10 px-3 py-1.5 text-xs font-bold hover:bg-white/20">Đóng video</button>
                )}
              </div>
              <div className="aspect-video bg-black">
                <iframe
                  className="h-full w-full"
                  src={getYouTubeEmbedUrl(sharedYouTubeId)}
                  title="Video YouTube đang xem chung"
                  referrerPolicy="strict-origin-when-cross-origin"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                />
              </div>
              <div className="flex items-center justify-between gap-3 bg-slate-900 px-4 py-2 text-xs text-slate-400">
                <span>Nếu chủ video tắt quyền nhúng, hãy mở bằng YouTube.</span>
                <a href={getYouTubeWatchUrl(sharedYouTubeId)} target="_blank" rel="noopener noreferrer" className="flex-none rounded-full bg-white/10 px-3 py-1.5 font-bold text-white hover:bg-white/20">Mở YouTube</a>
              </div>
            </section>
          )}

          {status !== 'joining' && (
            <div className={`mx-auto grid max-w-6xl gap-3 ${participants.length <= 1 ? 'max-w-xl grid-cols-1' : participants.length === 2 ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'}`}>
              {participants.map(renderParticipantTile)}
            </div>
          )}

          {status === 'active' && participants.length <= 1 && (
            <div className="mx-auto mt-4 max-w-xl rounded-2xl border border-dashed border-indigo-400/40 p-4 text-center text-sm text-slate-300">
              <Users className="mx-auto mb-2 h-6 w-6 text-indigo-300" />
              Phòng đã sẵn sàng. Thành viên khác có thể vào từ danh sách phòng học.
            </div>
          )}

          {youtubeComposerOpen && room.ownerUid === currentUser.uid && (
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
          <div className="mx-auto flex max-w-3xl items-center justify-center gap-2 sm:gap-3">
            <button onClick={toggleMute} disabled={status !== 'active'} className={`flex h-12 min-w-12 items-center justify-center rounded-full disabled:opacity-40 ${muted ? 'bg-amber-500' : 'bg-white/10 hover:bg-white/20'}`} aria-label={muted ? 'Bật micro' : 'Tắt micro'}>
              {muted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
            </button>
            <button onClick={() => void toggleCamera()} disabled={status !== 'active' || cameraBusy || sharingScreen} className={`flex h-12 min-w-12 items-center justify-center rounded-full disabled:opacity-40 ${cameraOn ? 'bg-indigo-600' : 'bg-white/10 hover:bg-white/20'}`} aria-label={cameraOn ? 'Tắt camera' : 'Bật camera'}>
              {cameraBusy ? <Loader2 className="h-5 w-5 animate-spin" /> : cameraOn ? <Camera className="h-5 w-5" /> : <CameraOff className="h-5 w-5" />}
            </button>
            <button onClick={() => void toggleScreenShare()} disabled={status !== 'active'} className={`flex h-12 min-w-12 items-center justify-center rounded-full disabled:opacity-40 ${sharingScreen ? 'bg-sky-600' : 'bg-white/10 hover:bg-white/20'}`} aria-label={sharingScreen ? 'Dừng chia sẻ màn hình' : 'Chia sẻ màn hình'}>
              {sharingScreen ? <ScreenShareOff className="h-5 w-5" /> : <ScreenShare className="h-5 w-5" />}
            </button>
            {room.ownerUid === currentUser.uid && (
              <button onClick={() => setYoutubeComposerOpen((current) => !current)} className={`flex h-12 min-w-12 items-center justify-center rounded-full ${youtubeComposerOpen ? 'bg-red-600' : 'bg-white/10 hover:bg-white/20'}`} aria-label="Cùng xem YouTube"><Youtube className="h-5 w-5" /></button>
            )}
            <button onClick={() => void close()} className="flex h-12 items-center justify-center gap-2 rounded-full bg-rose-600 px-4 font-black hover:bg-rose-500" aria-label={room.ownerUid === currentUser.uid ? 'Đóng phòng' : 'Rời phòng'}>
              <PhoneOff className="h-5 w-5" /><span className="hidden sm:inline">{room.ownerUid === currentUser.uid ? 'Đóng phòng' : 'Rời phòng'}</span>
            </button>
          </div>
        </footer>
      </div>
    </>
  );
};
