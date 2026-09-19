import React, { useCallback, useEffect, useRef, useState } from 'react';
import { User } from 'firebase/auth';
import {
  AlertTriangle,
  Camera,
  CameraOff,
  Mic,
  MicOff,
  Phone,
  PhoneOff,
  Video,
} from 'lucide-react';
import { StudentProfile } from '../types';
import { CallKind, CallSession, CallStatus } from '../types/call';
import {
  addCallCandidate,
  answerCall,
  createCall,
  getCallIceServers,
  subscribeToCall,
  subscribeToCallCandidates,
  updateCallStatus,
} from '../services/callService';
import { ReportModal } from './ReportModal';
import { getCallErrorMessage } from '../utils/userFacingErrors';

type CallDirection = 'incoming' | 'outgoing';

interface CallDialogProps {
  currentUser: User;
  peer: StudentProfile | null;
  direction: CallDirection;
  kind: CallKind;
  incomingCall?: CallSession | null;
  onClose: () => void;
}

type CallPhase = 'incoming' | 'preparing' | 'ringing' | 'connecting' | 'active' | 'ended' | 'failed';

const phaseText: Record<CallPhase, string> = {
  incoming: 'đang gọi cho bạn',
  preparing: 'đang mở thiết bị…',
  ringing: 'đang đổ chuông…',
  connecting: 'đang kết nối…',
  active: 'đang trong cuộc gọi',
  ended: 'cuộc gọi đã kết thúc',
  failed: 'không thể kết nối cuộc gọi',
};

const terminalStatuses: CallStatus[] = ['declined', 'ended', 'failed'];

const peerName = (profile: StudentProfile | null) => profile?.fullName || 'Sinh viên TVU';

const getInitials = (name: string) => name
  .trim()
  .split(/\s+/)
  .slice(-2)
  .map((part) => part[0])
  .join('')
  .toUpperCase();

const timestampToMillis = (value: unknown): number | null => {
  if (typeof value === 'number') return value;
  if (
    value
    && typeof value === 'object'
    && 'toMillis' in value
    && typeof (value as { toMillis?: unknown }).toMillis === 'function'
  ) {
    return (value as { toMillis: () => number }).toMillis();
  }
  return null;
};

export const CallDialog: React.FC<CallDialogProps> = ({
  currentUser,
  peer,
  direction,
  kind,
  incomingCall,
  onClose,
}) => {
  const [phase, setPhase] = useState<CallPhase>(direction === 'incoming' ? 'incoming' : 'preparing');
  const [error, setError] = useState<string | null>(null);
  const [callId, setCallId] = useState<string | null>(incomingCall?.id || null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOn, setIsCameraOn] = useState(kind === 'video');
  const [showReport, setShowReport] = useState(false);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const callIdRef = useRef<string | null>(incomingCall?.id || null);
  const callUnsubscribeRef = useRef<(() => void) | null>(null);
  const candidatesUnsubscribeRef = useRef<(() => void) | null>(null);
  const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const pendingLocalCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const remoteDescriptionSetRef = useRef(false);
  const hasStartedOutgoingRef = useRef(false);
  const isAcceptingRef = useRef(false);
  const isCleaningUpRef = useRef(false);
  const callExpiryTimeoutRef = useRef<number | null>(null);
  const connectionTimeoutRef = useRef<number | null>(null);

  const stopListeners = useCallback(() => {
    callUnsubscribeRef.current?.();
    candidatesUnsubscribeRef.current?.();
    callUnsubscribeRef.current = null;
    candidatesUnsubscribeRef.current = null;
  }, []);

  const releaseMedia = useCallback(() => {
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    peerConnectionRef.current?.close();
    peerConnectionRef.current = null;
    pendingCandidatesRef.current = [];
    pendingLocalCandidatesRef.current = [];
    remoteDescriptionSetRef.current = false;
    setLocalStream(null);
    setRemoteStream(null);
  }, []);

  const clearConnectionTimeout = useCallback(() => {
    if (connectionTimeoutRef.current !== null) {
      window.clearTimeout(connectionTimeoutRef.current);
      connectionTimeoutRef.current = null;
    }
  }, []);

  const clearCallExpiryTimeout = useCallback(() => {
    if (callExpiryTimeoutRef.current !== null) {
      window.clearTimeout(callExpiryTimeoutRef.current);
      callExpiryTimeoutRef.current = null;
    }
  }, []);

  const finishCall = useCallback(async (status: CallStatus = 'ended') => {
    if (isCleaningUpRef.current) return;
    isCleaningUpRef.current = true;
    const activeCallId = callIdRef.current;

    clearCallExpiryTimeout();
    clearConnectionTimeout();
    stopListeners();
    releaseMedia();
    setPhase(status === 'failed' ? 'failed' : 'ended');

    if (activeCallId) {
      try {
        await updateCallStatus(activeCallId, status, currentUser.uid);
      } catch (callError) {
        console.warn('Could not update call end state:', callError);
      }
    }
  }, [clearCallExpiryTimeout, clearConnectionTimeout, currentUser.uid, releaseMedia, stopListeners]);

  const scheduleCallExpiry = useCallback((call: CallSession) => {
    clearCallExpiryTimeout();
    // The expiry only applies while the recipient has not answered. An active
    // or connecting call must not be disconnected merely because it is long.
    if (call.status !== 'ringing') return;

    const expiresAt = timestampToMillis(call.expiresAt);
    if (!expiresAt) return;

    const expire = () => {
      if (isCleaningUpRef.current) return;
      setError('Cuộc gọi đã hết thời gian chờ. Bạn có thể thử gọi lại.');
      void finishCall('failed');
    };
    const remaining = expiresAt - Date.now();

    if (remaining <= 0) {
      expire();
      return;
    }

    callExpiryTimeoutRef.current = window.setTimeout(expire, remaining);
  }, [clearCallExpiryTimeout, finishCall]);

  const addRemoteCandidate = useCallback(async (candidate: RTCIceCandidateInit) => {
    const connection = peerConnectionRef.current;
    if (!connection || !remoteDescriptionSetRef.current) {
      pendingCandidatesRef.current.push(candidate);
      return;
    }

    try {
      await connection.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (candidateError) {
      // A duplicate or late candidate is harmless; it must not close the call.
      console.warn('Could not add remote ICE candidate:', candidateError);
    }
  }, []);

  const flushPendingCandidates = useCallback(async () => {
    const pending = [...pendingCandidatesRef.current];
    pendingCandidatesRef.current = [];
    await Promise.all(pending.map((candidate) => addRemoteCandidate(candidate)));
  }, [addRemoteCandidate]);

  const handleRemoteTermination = useCallback((status: CallStatus) => {
    if (isCleaningUpRef.current) return;
    isCleaningUpRef.current = true;
    clearCallExpiryTimeout();
    stopListeners();
    releaseMedia();
    setPhase(status === 'failed' ? 'failed' : 'ended');
  }, [clearCallExpiryTimeout, clearConnectionTimeout, releaseMedia, stopListeners]);

  const scheduleConnectionTimeout = useCallback(() => {
    clearConnectionTimeout();
    connectionTimeoutRef.current = window.setTimeout(() => {
      if (isCleaningUpRef.current || peerConnectionRef.current?.connectionState === 'connected') return;
      setError('Mạng hiện tại chưa tạo được đường truyền âm thanh. Hãy đổi Wi-Fi/4G rồi thử lại.');
      void finishCall('failed');
    }, 30_000);
  }, [clearConnectionTimeout, finishCall]);

  const flushLocalCandidates = useCallback(async (activeCallId: string, side: 'caller' | 'callee') => {
    const pending = [...pendingLocalCandidatesRef.current];
    pendingLocalCandidatesRef.current = [];
    const results = await Promise.allSettled(
      pending.map((candidate) => addCallCandidate(activeCallId, side, candidate)),
    );
    results.forEach((result) => {
      if (result.status === 'rejected') {
        console.warn('Could not flush a queued ICE candidate:', result.reason);
      }
    });
  }, []);

  const createPeerConnection = useCallback((candidateSide: 'caller' | 'callee') => {
    const connection = new RTCPeerConnection({
      iceServers: getCallIceServers(),
      iceCandidatePoolSize: 4,
    });

    connection.onicecandidate = (event) => {
      const activeCallId = callIdRef.current;
      if (!event.candidate) return;

      const candidate = event.candidate.toJSON();
      if (!activeCallId) {
        pendingLocalCandidatesRef.current.push(candidate);
        return;
      }

      void addCallCandidate(activeCallId, candidateSide, candidate).catch((candidateError) => {
        console.warn('Could not send ICE candidate:', candidateError);
      });
    };

    connection.ontrack = (event) => {
      const stream = event.streams[0] || new MediaStream([event.track]);
      setRemoteStream(stream);
    };

    connection.onconnectionstatechange = () => {
      const connectionState = connection.connectionState;
      if (connectionState === 'connected') {
        clearConnectionTimeout();
        setError(null);
        setPhase('active');
        const activeCallId = callIdRef.current;
        if (activeCallId) {
          void updateCallStatus(activeCallId, 'active').catch(() => undefined);
        }
      }

      if (connectionState === 'failed') {
        setError('Kết nối bị gián đoạn. Hãy thử gọi lại khi mạng ổn định hơn.');
        const activeCallId = callIdRef.current;
        if (activeCallId) {
          void updateCallStatus(activeCallId, 'failed', currentUser.uid).catch(() => undefined);
        }
        handleRemoteTermination('failed');
      }
    };

    connection.oniceconnectionstatechange = () => {
      if (connection.iceConnectionState === 'checking') {
        scheduleConnectionTimeout();
      } else if (connection.iceConnectionState === 'connected' || connection.iceConnectionState === 'completed') {
        clearConnectionTimeout();
      } else if (connection.iceConnectionState === 'disconnected') {
        // Mobile browsers commonly report a short disconnect while changing
        // Wi-Fi/4G. Give WebRTC time to recover before ending the call.
        scheduleConnectionTimeout();
      }
    };

    peerConnectionRef.current = connection;
    return connection;
  }, [clearConnectionTimeout, currentUser.uid, handleRemoteTermination, scheduleConnectionTimeout]);

  const listenToSignaling = useCallback((activeCallId: string, remoteCandidateSide: 'caller' | 'callee') => {
    stopListeners();

    callUnsubscribeRef.current = subscribeToCall(activeCallId, (call) => {
      if (!call) {
        handleRemoteTermination('ended');
        return;
      }

      if (terminalStatuses.includes(call.status)) {
        handleRemoteTermination(call.status);
        return;
      }

      scheduleCallExpiry(call);

      const connection = peerConnectionRef.current;
      const answer = call.answer;
      if (
        direction === 'outgoing'
        && answer
        && connection
        && !remoteDescriptionSetRef.current
      ) {
        void (async () => {
          try {
            await connection.setRemoteDescription(new RTCSessionDescription(answer));
            remoteDescriptionSetRef.current = true;
            await flushPendingCandidates();
            scheduleConnectionTimeout();
            setPhase('connecting');
          } catch (answerError) {
            console.error('Could not apply call answer:', answerError);
            setError('Không thể hoàn tất kết nối cuộc gọi.');
            void updateCallStatus(activeCallId, 'failed', currentUser.uid).catch(() => undefined);
          }
        })();
      }

      if (call.status === 'active') setPhase('active');
    }, (listenerError) => {
      console.error('Call signaling listener failed:', listenerError);
      setError('Kết nối cuộc gọi bị gián đoạn.');
      handleRemoteTermination('failed');
    });

    candidatesUnsubscribeRef.current = subscribeToCallCandidates(
      activeCallId,
      remoteCandidateSide,
      (candidate) => { void addRemoteCandidate(candidate); },
      (candidateError) => console.warn('ICE candidate listener failed:', candidateError),
    );
  }, [addRemoteCandidate, currentUser.uid, direction, flushPendingCandidates, handleRemoteTermination, scheduleCallExpiry, scheduleConnectionTimeout, stopListeners]);

  const getLocalMedia = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('Trình duyệt này không hỗ trợ gọi trực tiếp. Hãy cập nhật Chrome, Safari hoặc Edge.');
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: kind === 'video' ? { facingMode: 'user' } : false,
    });
    localStreamRef.current = stream;
    setLocalStream(stream);
    return stream;
  }, [kind]);

  const beginOutgoingCall = useCallback(async () => {
    if (hasStartedOutgoingRef.current) return;
    hasStartedOutgoingRef.current = true;
    setPhase('preparing');

    try {
      const stream = await getLocalMedia();
      if (isCleaningUpRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      const connection = createPeerConnection('caller');
      stream.getTracks().forEach((track) => connection.addTrack(track, stream));

      const offer = await connection.createOffer();
      await connection.setLocalDescription(offer);

      if (isCleaningUpRef.current) {
        connection.close();
        return;
      }

      const activeCallId = await createCall({
        callerUid: currentUser.uid,
        calleeUid: peer?.uid || '',
        kind,
        offer: connection.localDescription?.toJSON() || offer,
      });

      callIdRef.current = activeCallId;
      if (isCleaningUpRef.current) {
        await updateCallStatus(activeCallId, 'ended', currentUser.uid).catch(() => undefined);
        connection.close();
        return;
      }
      setCallId(activeCallId);
      await flushLocalCandidates(activeCallId, 'caller');
      listenToSignaling(activeCallId, 'callee');
      setPhase('ringing');
    } catch (callError) {
      if (isCleaningUpRef.current) return;
      console.error('Could not start outgoing call:', callError);
      releaseMedia();
      setError(getCallErrorMessage(callError, kind));
      setPhase('failed');
    }
  }, [createPeerConnection, currentUser.uid, flushLocalCandidates, getLocalMedia, kind, listenToSignaling, peer?.uid, releaseMedia]);

  const acceptIncomingCall = async () => {
    if (!incomingCall?.offer || isAcceptingRef.current) return;
    isAcceptingRef.current = true;
    setPhase('preparing');

    try {
      const stream = await getLocalMedia();
      if (isCleaningUpRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      const connection = createPeerConnection('callee');
      stream.getTracks().forEach((track) => connection.addTrack(track, stream));

      callIdRef.current = incomingCall.id;
      setCallId(incomingCall.id);
      listenToSignaling(incomingCall.id, 'caller');

      await connection.setRemoteDescription(new RTCSessionDescription(incomingCall.offer));
      remoteDescriptionSetRef.current = true;
      await flushPendingCandidates();

      const answer = await connection.createAnswer();
      await connection.setLocalDescription(answer);
      await answerCall(incomingCall.id, connection.localDescription?.toJSON() || answer);
      await flushLocalCandidates(incomingCall.id, 'callee');
      scheduleConnectionTimeout();
      setPhase('connecting');
    } catch (callError) {
      if (isCleaningUpRef.current) return;
      console.error('Could not answer incoming call:', callError);
      releaseMedia();
      setError(getCallErrorMessage(callError, kind));
      setPhase('failed');
      void updateCallStatus(incomingCall.id, 'failed', currentUser.uid).catch(() => undefined);
    } finally {
      isAcceptingRef.current = false;
    }
  };

  useEffect(() => {
    if (direction === 'outgoing') {
      void beginOutgoingCall();
    } else if (incomingCall?.id) {
      callIdRef.current = incomingCall.id;
      setCallId(incomingCall.id);
      // Listen immediately so a cancelled incoming call disappears cleanly.
      callUnsubscribeRef.current = subscribeToCall(incomingCall.id, (call) => {
        if (!call || terminalStatuses.includes(call.status)) {
          handleRemoteTermination(call?.status || 'ended');
          return;
        }
        scheduleCallExpiry(call);
      });
    }

    return () => {
      // The caller explicitly ends the call before closing the dialog. Avoid
      // writing from cleanup because React Strict Mode intentionally re-runs effects.
      clearCallExpiryTimeout();
      clearConnectionTimeout();
      stopListeners();
    };
  }, [beginOutgoingCall, clearCallExpiryTimeout, clearConnectionTimeout, direction, handleRemoteTermination, incomingCall?.id, scheduleCallExpiry, stopListeners]);

  useEffect(() => {
    if (localVideoRef.current && localStream) localVideoRef.current.srcObject = localStream;
  }, [localStream]);

  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) remoteVideoRef.current.srcObject = remoteStream;
  }, [remoteStream]);

  useEffect(() => {
    if (remoteAudioRef.current && remoteStream) remoteAudioRef.current.srcObject = remoteStream;
  }, [remoteStream]);

  const toggleMute = () => {
    const nextValue = !isMuted;
    localStreamRef.current?.getAudioTracks().forEach((track) => { track.enabled = !nextValue; });
    setIsMuted(nextValue);
  };

  const toggleCamera = () => {
    const nextValue = !isCameraOn;
    localStreamRef.current?.getVideoTracks().forEach((track) => { track.enabled = nextValue; });
    setIsCameraOn(nextValue);
  };

  const dismiss = () => {
    if (phase === 'incoming') {
      void finishCall('declined').finally(onClose);
      return;
    }
    void finishCall().finally(onClose);
  };

  const name = peerName(peer);
  const isIncoming = phase === 'incoming';
  const showVideo = kind === 'video' && !isIncoming;

  return (
    <div className="fixed inset-0 z-[200] p-4 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Cuộc gọi">
      <div className="relative w-full max-w-2xl min-h-[420px] overflow-hidden rounded-[2rem] bg-slate-900 text-white shadow-2xl flex flex-col">
        {kind === 'audio' && <audio ref={remoteAudioRef} autoPlay playsInline aria-label={`Âm thanh từ ${peerName(peer)}`} />}
        {showVideo && remoteStream ? (
          <video ref={remoteVideoRef} autoPlay playsInline className="absolute inset-0 w-full h-full object-cover" />
        ) : (
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_#4338ca,_#111827_60%)]" />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-slate-950/55 via-transparent to-slate-950/90 pointer-events-none" />

        <div className="relative z-10 flex-1 p-6 flex flex-col items-center text-center">
          {peer && (
            <button
              type="button"
              onClick={() => setShowReport(true)}
              className="absolute top-5 left-5 px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-bold inline-flex items-center gap-1.5"
            >
              <AlertTriangle className="w-4 h-4" /> Báo cáo
            </button>
          )}
          {showVideo && localStream && (
            <video ref={localVideoRef} autoPlay muted playsInline className="absolute top-5 right-5 w-28 sm:w-36 aspect-video object-cover rounded-2xl border-2 border-white/30 bg-slate-800 shadow-xl" />
          )}

          <div className="mt-8 w-24 h-24 rounded-[2rem] overflow-hidden bg-gradient-to-br from-indigo-500 to-violet-600 shadow-2xl flex items-center justify-center text-2xl font-black">
            {peer?.photoURL ? (
              <img src={peer.photoURL} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
            ) : getInitials(name)}
          </div>
          <h2 className="mt-5 text-2xl font-black tracking-tight">{name}</h2>
          <p className="mt-1 text-sm text-slate-200 capitalize">{phaseText[phase]}</p>
          {kind === 'video' && <p className="mt-1 text-xs text-slate-300">Cuộc gọi video</p>}
          {error && <p className="mt-4 max-w-sm rounded-xl bg-red-500/20 px-3 py-2 text-sm text-red-100">{error}</p>}

          {isIncoming && (
            <div className="mt-auto w-full max-w-sm rounded-2xl bg-white/10 border border-white/15 p-4 text-left">
              <p className="text-sm font-semibold">Bạn có thể từ chối nếu chưa sẵn sàng. Camera/micro chỉ được mở khi bạn nhấn Nhận.</p>
            </div>
          )}
          {callId && phase === 'ringing' && <p className="mt-auto text-xs text-slate-400">Đang chờ {name} nhận cuộc gọi…</p>}
        </div>

        <div className="relative z-10 p-5 flex items-center justify-center gap-4 bg-slate-950/55">
          {isIncoming ? (
            <>
              <button onClick={() => void finishCall('declined').finally(onClose)} className="w-14 h-14 rounded-full bg-rose-600 hover:bg-rose-500 flex items-center justify-center shadow-lg" aria-label="Từ chối cuộc gọi">
                <PhoneOff className="w-6 h-6" />
              </button>
              <button onClick={() => void acceptIncomingCall()} className="min-w-36 h-14 rounded-full bg-emerald-500 hover:bg-emerald-400 font-black inline-flex items-center justify-center gap-2 shadow-lg" aria-label="Nhận cuộc gọi">
                {kind === 'video' ? <Video className="w-5 h-5" /> : <Phone className="w-5 h-5" />} Nhận
              </button>
            </>
          ) : phase === 'ended' || phase === 'failed' ? (
            <button onClick={onClose} className="min-w-40 h-12 rounded-full bg-white text-slate-900 font-black">Đóng</button>
          ) : (
            <>
              <button onClick={toggleMute} className={`w-12 h-12 rounded-full flex items-center justify-center ${isMuted ? 'bg-rose-500' : 'bg-white/15 hover:bg-white/25'}`} aria-label={isMuted ? 'Bật micro' : 'Tắt micro'}>
                {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
              </button>
              {kind === 'video' && (
                <button onClick={toggleCamera} className={`w-12 h-12 rounded-full flex items-center justify-center ${!isCameraOn ? 'bg-rose-500' : 'bg-white/15 hover:bg-white/25'}`} aria-label={isCameraOn ? 'Tắt camera' : 'Bật camera'}>
                  {isCameraOn ? <Camera className="w-5 h-5" /> : <CameraOff className="w-5 h-5" />}
                </button>
              )}
              <button onClick={dismiss} className="w-14 h-14 rounded-full bg-rose-600 hover:bg-rose-500 flex items-center justify-center shadow-lg" aria-label="Kết thúc cuộc gọi">
                <PhoneOff className="w-6 h-6" />
              </button>
            </>
          )}
        </div>
      </div>
      {peer && (
        <ReportModal
          isOpen={showReport}
          onClose={() => setShowReport(false)}
          reporterUid={currentUser.uid}
          reportedUid={peer.uid}
          reportedName={name}
        />
      )}
    </div>
  );
};
