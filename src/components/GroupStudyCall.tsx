import React, { useEffect, useMemo, useRef, useState } from 'react';
import { User } from 'firebase/auth';
import { BookOpen, Loader2, Mic, MicOff, PhoneOff, ShieldCheck, Users } from 'lucide-react';
import { StudyRoom, StudyRoomParticipant, StudySignal } from '../types/socialAudio';
import { getCallIceServersForSession } from '../services/callService';
import {
  joinStudyRoom,
  leaveStudyRoom,
  removeStudySignal,
  sendStudySignal,
  subscribeToStudyRoom,
  subscribeToStudyRoomParticipants,
  subscribeToStudySignals,
  touchStudyRoom,
} from '../services/studyRoomService';
import { getStudyRoomErrorMessage } from '../utils/userFacingErrors';
import { playAppSound } from '../utils/appSounds';
import { applyCallTrackHints, getCallMediaConstraints, optimizeCallSenders } from '../utils/callMedia';

interface GroupStudyCallProps {
  room: StudyRoom;
  currentUser: User;
  onClose: () => void;
}

const RemoteAudio: React.FC<{ stream: MediaStream }> = ({ stream }) => {
  const ref = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream;
  }, [stream]);
  return <audio ref={ref} autoPlay playsInline />;
};

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
  const localStreamRef = useRef<MediaStream | null>(null);
  const connectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const pendingCandidatesRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
  const cleanupRef = useRef<((leaveImmediately?: boolean) => Promise<void>) | null>(null);
  const leaveTimerRef = useRef<number | null>(null);
  const lifecycleRef = useRef(0);

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
      localStreamRef.current?.getTracks().forEach((track) => {
        connection.addTrack(track, localStreamRef.current!);
      });
      void optimizeCallSenders(connection);
      connection.onicecandidate = (event) => {
        if (!event.candidate) return;
        void sendStudySignal(room.id, currentUser.uid, peerUid, 'candidate', {
          candidate: event.candidate.toJSON(),
        }).catch((candidateError) => console.warn('Could not send study ICE candidate:', candidateError));
      };
      connection.ontrack = (event) => {
        const stream = event.streams[0] || new MediaStream([event.track]);
        setRemoteStreams((current) => new Map(current).set(peerUid, stream));
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
      return connection;
    };

    const initiateConnection = async (peerUid: string) => {
      const connection = createConnection(peerUid);
      if (connection.signalingState !== 'stable' || connection.localDescription) return;
      const offer = await connection.createOffer();
      await connection.setLocalDescription(offer);
      await optimizeCallSenders(connection);
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
          await optimizeCallSenders(connection);
          await sendStudySignal(room.id, currentUser.uid, signal.fromUid, 'answer', {
            description: connection.localDescription?.toJSON() || answer,
          });
          return;
        }

        if (signal.type === 'answer' && signal.description) {
          const connection = connectionsRef.current.get(signal.fromUid);
          if (connection && !connection.remoteDescription) {
            await connection.setRemoteDescription(new RTCSessionDescription(signal.description));
            await flushCandidates(signal.fromUid, connection);
          }
        }
      } catch (signalError) {
        console.warn('Could not process study room signal:', signalError);
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
      pendingCandidatesRef.current.clear();
      localStreamRef.current?.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
      if (leaveImmediately) {
        await leaveStudyRoom(room);
      } else {
        // React Strict Mode mounts effects twice in development. Deferring the
        // Firestore leave lets the next effect cancel it instead of closing a
        // room that is still actively being joined.
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
          if (lifecycleRef.current === lifecycle) {
            await leaveStudyRoom(room);
          }
          return;
        }
        const stream = await navigator.mediaDevices.getUserMedia(getCallMediaConstraints(false));
        if (disposed) {
          stream.getTracks().forEach((track) => track.stop());
          if (lifecycleRef.current === lifecycle) {
            await leaveStudyRoom(room);
          }
          return;
        }
        localStreamRef.current = stream;
        applyCallTrackHints(stream);

        roomUnsubscribe = subscribeToStudyRoom(room.id, (latestRoom) => {
          if (disposed || latestRoom?.status === 'open') return;
          setError('Chủ phòng đã đóng phòng học.');
          void cleanup(true).finally(onClose);
        }, (roomError) => {
          console.warn('Study room status listener failed:', roomError);
        });

        signalUnsubscribe = subscribeToStudySignals(room.id, currentUser.uid, (signal) => {
          void handleSignal(signal);
        }, (signalError) => {
          console.error('Study signal listener failed:', signalError);
          setError('Tín hiệu phòng học bị gián đoạn.');
        });

        participantUnsubscribe = subscribeToStudyRoomParticipants(room.id, (nextParticipants) => {
          if (disposed) return;
          setParticipants(nextParticipants);
          const peerUids = new Set(nextParticipants.map((participant) => participant.uid));

          connectionsRef.current.forEach((connection, peerUid) => {
            if (!peerUids.has(peerUid)) {
              connection.close();
              connectionsRef.current.delete(peerUid);
            }
          });

          nextParticipants.forEach((participant) => {
            if (participant.uid !== currentUser.uid && currentUser.uid < participant.uid) {
              void initiateConnection(participant.uid).catch((connectionError) => {
                console.warn('Could not initiate study peer connection:', connectionError);
              });
            }
          });
        }, (participantsError) => {
          console.error('Study participant listener failed:', participantsError);
          setError('Không thể cập nhật danh sách thành viên.');
        });

        heartbeat = window.setInterval(() => {
          void touchStudyRoom(room, currentUser.uid).catch(() => undefined);
        }, 45_000);
        setStatus('active');
        void playAppSound('study-room', { volume: 0.56 });
      } catch (joinError) {
        console.error('Could not join study room:', joinError);
        setError(getStudyRoomErrorMessage(joinError));
        setStatus('error');
        await cleanup(true);
      }
    };

    void initialize();
    return () => { void cleanup(); };
  }, [currentUser.uid, onClose, room]);

  const activeNames = useMemo(() => participants.map((participant) => participant.displayName), [participants]);

  const toggleMute = () => {
    const next = !muted;
    localStreamRef.current?.getAudioTracks().forEach((track) => { track.enabled = !next; });
    setMuted(next);
  };

  const close = async () => {
    await cleanupRef.current?.(true);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[210] bg-slate-950/90 backdrop-blur-md p-4 flex items-center justify-center" role="dialog" aria-modal="true" aria-label="Phòng học thoại">
      {[...remoteStreams.entries()].map(([uid, stream]) => <RemoteAudio key={uid} stream={stream} />)}
      <div className="w-full max-w-3xl max-h-[92dvh] overflow-y-auto rounded-[2rem] border border-white/10 bg-slate-900 text-white shadow-2xl">
        <div className="p-6 sm:p-8 bg-gradient-to-br from-indigo-700 via-violet-700 to-slate-900">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[.2em] text-indigo-200">Phòng học thoại</p>
              <h2 className="mt-2 text-2xl sm:text-3xl font-black">{room.title}</h2>
              <p className="mt-1 text-sm text-indigo-100">{room.subject || 'Học chung và trao đổi bài'}</p>
            </div>
            <div className="px-3 py-2 rounded-xl bg-white/10 text-xs font-bold whitespace-nowrap">Không giới hạn thời gian</div>
          </div>
        </div>

        <div className="p-5 sm:p-7">
          {status === 'joining' && (
            <div className="py-12 text-center"><Loader2 className="w-9 h-9 mx-auto animate-spin text-indigo-300" /><p className="mt-3 font-bold">Đang kết nối micro và thành viên…</p></div>
          )}
          {error && <p className="mb-5 rounded-xl bg-rose-500/15 border border-rose-400/20 px-4 py-3 text-sm text-rose-100">{error}</p>}

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {participants.map((participant) => (
              <div key={participant.uid} className="rounded-2xl border border-white/10 bg-white/5 p-4 text-center">
                <div className="w-14 h-14 mx-auto rounded-2xl overflow-hidden bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center font-black">
                  {participant.photoURL ? <img src={participant.photoURL} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" /> : participant.displayName.slice(0, 1).toUpperCase()}
                </div>
                <p className="mt-2 text-sm font-bold truncate">{participant.uid === currentUser.uid ? 'Bạn' : participant.displayName}</p>
                <p className="mt-1 text-[11px] text-emerald-300">● Trong phòng</p>
              </div>
            ))}
          </div>

          {status === 'active' && activeNames.length === 1 && (
            <div className="mt-5 rounded-2xl border border-dashed border-indigo-400/40 p-5 text-center text-sm text-slate-300">
              <Users className="w-7 h-7 mx-auto mb-2 text-indigo-300" />
              Bạn đang ở trong phòng. Hãy chờ thành viên khác tham gia từ danh sách phòng học.
            </div>
          )}

          <div className="mt-6 flex items-center justify-center gap-4">
            <button onClick={toggleMute} disabled={status !== 'active'} className={`w-14 h-14 rounded-full flex items-center justify-center disabled:opacity-40 ${muted ? 'bg-amber-500' : 'bg-white/10 hover:bg-white/20'}`} aria-label={muted ? 'Bật micro' : 'Tắt micro'}>
              {muted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
            </button>
            <button onClick={() => void close()} className="h-14 px-6 rounded-full bg-rose-600 hover:bg-rose-500 font-black inline-flex items-center gap-2">
              <PhoneOff className="w-5 h-5" /> {room.ownerUid === currentUser.uid ? 'Đóng phòng' : 'Rời phòng'}
            </button>
          </div>

          <div className="mt-6 flex items-start gap-2 text-xs text-slate-400">
            <ShieldCheck className="w-4 h-4 text-emerald-400 flex-shrink-0" />
            <p>Âm thanh truyền trực tiếp giữa các thành viên. Phòng không tự ngắt theo thời gian, nhưng vẫn phụ thuộc mạng, pin thiết bị và cấu hình TURN.</p>
          </div>
        </div>
      </div>
    </div>
  );
};
