import React, { useCallback, useEffect, useRef, useState } from 'react';
import { User } from 'firebase/auth';
import {
  AlertTriangle,
  Camera,
  CameraOff,
  Clock3,
  Mic,
  MicOff,
  Maximize2,
  Minimize2,
  Phone,
  PhoneOff,
  ShieldCheck,
  SwitchCamera,
  Video,
  Wifi,
} from 'lucide-react';
import { toast } from 'sonner';
import { StudentProfile } from '../types';
import { CallContext, CallKind, CallSession, CallStatus } from '../types/call';
import {
  addCallCandidate,
  answerCall,
  createCall,
  getCallIceServersForSession,
  getIceCandidateType,
  hasTurnRelayServer,
  subscribeToCall,
  subscribeToCallCandidates,
  updateCallStatus,
} from '../services/callService';
import { ReportModal } from './ReportModal';
import { getCallErrorMessage } from '../utils/userFacingErrors';
import { playAppSound, stopAppSound } from '../utils/appSounds';
import {
  applyCallTrackHints,
  formatCallDuration,
  getCallMediaConstraints,
  optimizeCallSenders,
  readCallQuality,
  type CallConnectionQuality,
  type CallFacingMode,
} from '../utils/callMedia';

type CallDirection = 'incoming' | 'outgoing';

interface CallDialogProps {
  currentUser: User;
  peer: StudentProfile | null;
  direction: CallDirection;
  kind: CallKind;
  incomingCall?: CallSession | null;
  context?: CallContext;
  onClose: () => void;
}

type CallPhase = 'incoming' | 'preparing' | 'ringing' | 'connecting' | 'active' | 'ended' | 'failed';

const phaseText: Record<CallPhase, string> = {
  incoming: 'Đang gọi cho bạn',
  preparing: 'Đang mở camera và micro…',
  ringing: 'Đang đổ chuông…',
  connecting: 'Đang thiết lập kết nối an toàn…',
  active: 'Đã kết nối',
  ended: 'Cuộc gọi đã kết thúc',
  failed: 'Không thể kết nối cuộc gọi',
};

const qualityPresentation: Record<CallConnectionQuality, { label: string; className: string }> = {
  checking: { label: 'Đang đo mạng', className: 'bg-white/10 text-white/80' },
  good: { label: 'Kết nối tốt', className: 'bg-emerald-500/20 text-emerald-100' },
  fair: { label: 'Kết nối trung bình', className: 'bg-amber-500/20 text-amber-100' },
  poor: { label: 'Mạng yếu', className: 'bg-rose-500/20 text-rose-100' },
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

const StreamVideo: React.FC<{
  stream: MediaStream;
  muted?: boolean;
  className: string;
  label: string;
}> = ({ stream, muted = false, className, label }) => {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream;
  }, [stream]);
  return <video ref={ref} autoPlay muted={muted} playsInline className={className} aria-label={label} />;
};

const StreamAudio: React.FC<{ stream: MediaStream | null; label: string }> = ({ stream, label }) => {
  const ref = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream;
  }, [stream]);
  return <audio ref={ref} autoPlay playsInline aria-label={label} />;
};

export const CallDialog: React.FC<CallDialogProps> = ({
  currentUser,
  peer,
  direction,
  kind,
  incomingCall,
  context,
  onClose,
}) => {
  const [phase, setPhase] = useState<CallPhase>(direction === 'incoming' ? 'incoming' : 'preparing');
  const [error, setError] = useState<string | null>(null);
  const [callId, setCallId] = useState<string | null>(incomingCall?.id || null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOn, setIsCameraOn] = useState(kind === 'video');
  const [facingMode, setFacingMode] = useState<CallFacingMode>('user');
  const [switchingCamera, setSwitchingCamera] = useState(false);
  const [connectionQuality, setConnectionQuality] = useState<CallConnectionQuality>('checking');
  const [callDurationSeconds, setCallDurationSeconds] = useState(0);
  const [showReport, setShowReport] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);

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
  const previousPhaseRef = useRef<CallPhase | null>(null);
  const relayConfiguredRef = useRef(false);
  const relayCandidateSeenRef = useRef(false);
  const activeStartedAtRef = useRef<number | null>(null);

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
    activeStartedAtRef.current = null;
    setLocalStream(null);
    setRemoteStream(null);
    setConnectionQuality('checking');
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
      setError(relayConfiguredRef.current
        ? 'Wi-Fi hiện tại đang chặn đường truyền cuộc gọi. Hãy thử lại hoặc đổi sang mạng khác.'
        : 'Wi-Fi hiện tại chặn cuộc gọi trực tiếp và hệ thống chưa có máy chủ chuyển tiếp TURN. Tạm thời hãy dùng 4G.');
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

  const createPeerConnection = useCallback(async (candidateSide: 'caller' | 'callee') => {
    const iceServers = await getCallIceServersForSession();
    relayConfiguredRef.current = hasTurnRelayServer(iceServers);
    relayCandidateSeenRef.current = false;
    setConnectionQuality('checking');
    const connection = new RTCPeerConnection({
      iceServers,
      iceCandidatePoolSize: 4,
    });

    connection.onicecandidate = (event) => {
      const activeCallId = callIdRef.current;
      if (!event.candidate) return;

      const candidate = event.candidate.toJSON();
      if (getIceCandidateType(event.candidate) === 'relay') relayCandidateSeenRef.current = true;
      if (!activeCallId) {
        pendingLocalCandidatesRef.current.push(candidate);
        return;
      }

      void addCallCandidate(activeCallId, candidateSide, candidate).catch((candidateError) => {
        console.warn('Could not send ICE candidate:', candidateError);
      });
    };

    connection.onicecandidateerror = (event) => {
      // Do not expose addresses or credentials; the code and URL are enough to
      // distinguish an unreachable STUN/TURN endpoint in diagnostics.
      console.warn('ICE server could not be reached', {
        code: event.errorCode,
        text: event.errorText,
        url: event.url?.replace(/\/[^/]*$/, ''),
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
        setError(relayConfiguredRef.current && relayCandidateSeenRef.current
          ? 'Kết nối chuyển tiếp bị gián đoạn. Hãy thử gọi lại khi mạng ổn định hơn.'
          : relayConfiguredRef.current
            ? 'Không lấy được đường truyền TURN trên Wi-Fi này. Hãy thử lại hoặc đổi mạng.'
            : 'Wi-Fi chặn cuộc gọi trực tiếp và TURN chưa được cấu hình. Tạm thời hãy dùng 4G.');
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

    const stream = await navigator.mediaDevices.getUserMedia(
      getCallMediaConstraints(kind === 'video', 'user'),
    );
    applyCallTrackHints(stream);
    localStreamRef.current = stream;
    setLocalStream(stream);
    return stream;
  }, [kind]);

  const attachLocalMedia = useCallback(async (
    connection: RTCPeerConnection,
    stream: MediaStream,
  ) => {
    stream.getTracks().forEach((track) => connection.addTrack(track, stream));
    await optimizeCallSenders(connection);
  }, []);

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
      const connection = await createPeerConnection('caller');
      await attachLocalMedia(connection, stream);

      const offer = await connection.createOffer();
      await connection.setLocalDescription(offer);
      await optimizeCallSenders(connection);

      if (isCleaningUpRef.current) {
        connection.close();
        return;
      }

      const activeCallId = await createCall({
        callerUid: currentUser.uid,
        calleeUid: peer?.uid || '',
        kind,
        offer: connection.localDescription?.toJSON() || offer,
        privacyMode: context?.privacyMode,
        source: context?.source,
        sourceSessionId: context?.sourceSessionId,
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
  }, [attachLocalMedia, context?.privacyMode, context?.source, context?.sourceSessionId, createPeerConnection, currentUser.uid, flushLocalCandidates, getLocalMedia, kind, listenToSignaling, peer?.uid, releaseMedia]);

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
      const connection = await createPeerConnection('callee');
      await attachLocalMedia(connection, stream);

      callIdRef.current = incomingCall.id;
      setCallId(incomingCall.id);
      listenToSignaling(incomingCall.id, 'caller');

      await connection.setRemoteDescription(new RTCSessionDescription(incomingCall.offer));
      remoteDescriptionSetRef.current = true;
      await flushPendingCandidates();

      const answer = await connection.createAnswer();
      await connection.setLocalDescription(answer);
      await optimizeCallSenders(connection);
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
    stopAppSound('incoming-call');
    stopAppSound('outgoing-call');

    if (phase === 'incoming') {
      void playAppSound('incoming-call', { loop: true, volume: 0.72 });
    } else if (direction === 'outgoing' && phase === 'ringing') {
      void playAppSound('outgoing-call', { loop: true, volume: 0.52 });
    }

    const previousPhase = previousPhaseRef.current;
    if (phase === 'active' && previousPhase !== 'active') {
      void playAppSound('call-connected', { volume: 0.62 });
    } else if ((phase === 'ended' || phase === 'failed') && previousPhase !== phase) {
      void playAppSound('call-ended', { volume: 0.62 });
    }
    previousPhaseRef.current = phase;

    return () => {
      stopAppSound('incoming-call');
      stopAppSound('outgoing-call');
    };
  }, [direction, phase]);

  useEffect(() => {
    if (phase !== 'active') return;
    if (activeStartedAtRef.current === null) activeStartedAtRef.current = Date.now();

    const updateDuration = () => {
      if (activeStartedAtRef.current === null) return;
      setCallDurationSeconds(Math.floor((Date.now() - activeStartedAtRef.current) / 1_000));
    };
    updateDuration();
    const interval = window.setInterval(updateDuration, 1_000);
    return () => window.clearInterval(interval);
  }, [phase]);

  useEffect(() => {
    if (phase === 'ended' || phase === 'failed' || phase === 'incoming') setIsMinimized(false);
  }, [phase]);

  useEffect(() => {
    if (phase !== 'active') return;
    let cancelled = false;

    const updateQuality = async () => {
      const connection = peerConnectionRef.current;
      if (!connection) return;
      try {
        const quality = await readCallQuality(connection);
        if (!cancelled) setConnectionQuality(quality);
      } catch {
        // Some older browsers do not expose connection stats. Calling remains
        // fully functional; only the quality badge stays in checking state.
      }
    };

    void updateQuality();
    const interval = window.setInterval(() => { void updateQuality(); }, 3_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [phase]);

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

  const switchCamera = async () => {
    if (kind !== 'video' || switchingCamera || !localStreamRef.current) return;
    const nextFacingMode: CallFacingMode = facingMode === 'user' ? 'environment' : 'user';
    let replacementStream: MediaStream | null = null;
    let replacementApplied = false;
    setSwitchingCamera(true);

    try {
      const constraints = getCallMediaConstraints(true, nextFacingMode);
      replacementStream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: constraints.video,
      });
      applyCallTrackHints(replacementStream);
      const replacementTrack = replacementStream.getVideoTracks()[0];
      const currentStream = localStreamRef.current;
      const sender = peerConnectionRef.current?.getSenders()
        .find((candidate) => candidate.track?.kind === 'video');
      if (!replacementTrack || !currentStream || !sender) {
        replacementStream.getTracks().forEach((track) => track.stop());
        throw new Error('Camera replacement is unavailable');
      }

      await sender.replaceTrack(replacementTrack);
      replacementApplied = true;
      currentStream.getVideoTracks().forEach((track) => track.stop());
      const nextStream = new MediaStream([
        ...currentStream.getAudioTracks(),
        replacementTrack,
      ]);
      localStreamRef.current = nextStream;
      setLocalStream(nextStream);
      setFacingMode(nextFacingMode);
      setIsCameraOn(true);
      if (peerConnectionRef.current) await optimizeCallSenders(peerConnectionRef.current);
    } catch (cameraError) {
      if (!replacementApplied) replacementStream?.getTracks().forEach((track) => track.stop());
      console.warn('Could not switch camera:', cameraError);
      toast.error('Thiết bị này chưa cho phép đổi camera trong cuộc gọi.');
    } finally {
      setSwitchingCamera(false);
    }
  };

  const dismiss = () => {
    if (phase === 'incoming') {
      void finishCall('declined').finally(onClose);
      return;
    }
    void finishCall().finally(onClose);
  };

  const isAnonymous = context?.privacyMode === 'anonymous' || incomingCall?.privacyMode === 'anonymous';
  const name = isAnonymous ? 'Bạn trò chuyện ẩn danh' : peerName(peer);
  const isIncoming = phase === 'incoming';
  const showVideo = kind === 'video' && !isIncoming;
  const hasRemoteVideo = showVideo && Boolean(
    remoteStream?.getVideoTracks().some((track) => track.readyState === 'live'),
  );
  const showLocalPreview = showVideo
    && Boolean(localStream)
    && phase !== 'ended'
    && phase !== 'failed';
  const quality = qualityPresentation[connectionQuality];

  if (isMinimized && !isIncoming) {
    const miniVideoStream = hasRemoteVideo ? remoteStream : (showVideo ? localStream : null);
    return (
      <aside
        className="fixed bottom-[calc(5.75rem+env(safe-area-inset-bottom))] right-3 z-[10001] w-[min(19rem,calc(100vw-1.5rem))] overflow-hidden rounded-3xl border border-white/15 bg-slate-950 text-white shadow-2xl sm:bottom-5 sm:right-5"
        role="dialog"
        aria-modal="false"
        aria-label="Cuộc gọi thu nhỏ"
      >
        {kind === 'audio' && <StreamAudio stream={remoteStream} label={`Âm thanh từ ${name}`} />}
        <div className="relative h-36 overflow-hidden bg-[radial-gradient(circle_at_top,_#4f46e5,_#0f172a_70%)]">
          {miniVideoStream ? (
            <StreamVideo
              stream={miniVideoStream}
              muted={!hasRemoteVideo}
              label={hasRemoteVideo ? `Video từ ${name}` : 'Video của bạn'}
              className={`h-full w-full object-cover ${!hasRemoteVideo && facingMode === 'user' ? '-scale-x-100' : ''}`}
            />
          ) : (
            <div className="flex h-full items-center justify-center">
              <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl bg-violet-600 text-xl font-black">
                {!isAnonymous && peer?.photoURL
                  ? <img src={peer.photoURL} alt={name} className="h-full w-full object-cover" referrerPolicy="no-referrer" />
                  : getInitials(name)}
              </div>
            </div>
          )}
          <div className="absolute inset-x-0 top-0 flex items-center justify-between gap-2 bg-gradient-to-b from-black/75 to-transparent p-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-black">{name}</p>
              <p className="text-[11px] text-white/70">{phase === 'active' ? formatCallDuration(callDurationSeconds) : phaseText[phase]}</p>
            </div>
            <button type="button" onClick={() => setIsMinimized(false)} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-black/45" aria-label="Mở rộng cuộc gọi">
              <Maximize2 className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div className="flex items-center justify-center gap-3 p-3">
          <button onClick={toggleMute} className={`flex h-11 w-11 items-center justify-center rounded-full ${isMuted ? 'bg-white text-slate-950' : 'bg-white/10'}`} aria-label={isMuted ? 'Bật micro' : 'Tắt micro'}>
            {isMuted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
          </button>
          {kind === 'video' && (
            <button onClick={toggleCamera} className={`flex h-11 w-11 items-center justify-center rounded-full ${!isCameraOn ? 'bg-white text-slate-950' : 'bg-white/10'}`} aria-label={isCameraOn ? 'Tắt camera' : 'Bật camera'}>
              {isCameraOn ? <Camera className="h-5 w-5" /> : <CameraOff className="h-5 w-5" />}
            </button>
          )}
          <button onClick={dismiss} className="flex h-11 w-11 items-center justify-center rounded-full bg-rose-600" aria-label="Kết thúc cuộc gọi">
            <PhoneOff className="h-5 w-5" />
          </button>
        </div>
      </aside>
    );
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-950 sm:p-4" role="dialog" aria-modal="true" aria-label="Cuộc gọi">
      <div className="relative flex h-[100dvh] w-full flex-col overflow-hidden bg-slate-950 text-white shadow-2xl sm:h-[min(92dvh,780px)] sm:max-w-5xl sm:rounded-[2rem]">
        {kind === 'audio' && <StreamAudio stream={remoteStream} label={`Âm thanh từ ${name}`} />}
        {hasRemoteVideo ? (
          <StreamVideo
            stream={remoteStream!}
            label={`Video từ ${name}`}
            className="absolute inset-0 h-full w-full bg-black object-cover"
          />
        ) : (
          <>
            {!isAnonymous && peer?.photoURL && (
              <img
                src={peer.photoURL}
                alt=""
                aria-hidden="true"
                className="absolute inset-0 h-full w-full scale-110 object-cover opacity-20 blur-3xl"
                referrerPolicy="no-referrer"
              />
            )}
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(79,70,229,.78),_#0f172a_58%,_#020617)]" />
          </>
        )}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-slate-950/75 via-transparent to-slate-950/95" />

        <header className="relative z-20 flex items-start justify-between gap-3 px-4 pt-[max(1rem,env(safe-area-inset-top))] sm:px-6 sm:pt-6">
          <div className="min-w-0 rounded-2xl bg-slate-950/35 px-3 py-2 backdrop-blur-md sm:px-4">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/10">
                <ShieldCheck className="h-4 w-4 text-emerald-300" />
              </span>
              <div className="min-w-0 text-left">
                <h2 className="truncate text-sm font-black sm:text-base">{name}</h2>
                <p className="truncate text-[11px] text-white/70 sm:text-xs">
                  {phase === 'active' ? formatCallDuration(callDurationSeconds) : phaseText[phase]}
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {phase === 'active' && (
              <span className={`hidden min-h-9 items-center gap-1.5 rounded-full px-3 text-xs font-bold backdrop-blur-md sm:inline-flex ${quality.className}`}>
                <Wifi className="h-3.5 w-3.5" />{quality.label}
              </span>
            )}
            {!isIncoming && phase !== 'ended' && phase !== 'failed' && (
              <button
                type="button"
                onClick={() => setIsMinimized(true)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-slate-950/35 text-white/80 backdrop-blur-md transition hover:bg-white/20 hover:text-white"
                aria-label="Thu nhỏ cuộc gọi để tiếp tục dùng web"
                title="Thu nhỏ PiP"
              >
                <Minimize2 className="h-4 w-4" />
              </button>
            )}
            {peer && (
              <button
                type="button"
                onClick={() => setShowReport(true)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-slate-950/35 text-white/80 backdrop-blur-md transition hover:bg-white/20 hover:text-white"
                aria-label="Báo cáo người dùng"
                title="Báo cáo"
              >
                <AlertTriangle className="h-4 w-4" />
              </button>
            )}
          </div>
        </header>

        {showLocalPreview && (
          <div className="absolute right-4 top-20 z-20 overflow-hidden rounded-2xl border border-white/25 bg-slate-900 shadow-2xl sm:right-6 sm:top-24">
            {isCameraOn ? (
              <StreamVideo
                stream={localStream!}
                muted
                label="Video của bạn"
                className={`h-36 w-24 object-cover sm:h-32 sm:w-48 ${facingMode === 'user' ? '-scale-x-100' : ''}`}
              />
            ) : (
              <div className="flex h-36 w-24 flex-col items-center justify-center gap-2 bg-slate-800 text-white/65 sm:h-32 sm:w-48">
                <CameraOff className="h-5 w-5" />
                <span className="text-[10px] font-bold">Camera đã tắt</span>
              </div>
            )}
            <span className="absolute bottom-1.5 left-1.5 rounded-md bg-black/55 px-1.5 py-0.5 text-[10px] font-bold">Bạn</span>
          </div>
        )}

        {!hasRemoteVideo && (
          <main className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center px-6 pb-36 pt-24 text-center">
            <div className={`relative flex h-28 w-28 items-center justify-center overflow-hidden rounded-[2.25rem] bg-gradient-to-br from-indigo-500 to-violet-600 text-3xl font-black shadow-2xl sm:h-32 sm:w-32 ${['incoming', 'ringing', 'connecting'].includes(phase) ? 'ring-8 ring-white/5' : ''}`}>
              {!isAnonymous && peer?.photoURL ? (
                <img src={peer.photoURL} alt={name} className="h-full w-full object-cover" referrerPolicy="no-referrer" />
              ) : getInitials(name)}
              {['incoming', 'ringing', 'connecting'].includes(phase) && (
                <span className="absolute inset-0 animate-pulse rounded-[2.25rem] ring-2 ring-white/25" />
              )}
            </div>
            <h3 className="mt-6 max-w-full truncate text-2xl font-black tracking-tight sm:text-3xl">{name}</h3>
            <p className="mt-2 text-sm font-medium text-white/75">{phaseText[phase]}</p>
            {kind === 'video' && <p className="mt-2 text-xs text-white/55">Video HD thích ứng theo tốc độ mạng</p>}
            {kind === 'audio' && <p className="mt-2 text-xs text-white/55">Khử tiếng vọng và giảm nhiễu nền</p>}
          </main>
        )}

        <div className="pointer-events-none absolute inset-x-0 bottom-28 z-20 flex justify-center px-4 sm:bottom-32">
          <div className="pointer-events-auto w-full max-w-md space-y-2">
            {phase === 'active' && (
              <div className={`mx-auto flex w-fit items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-bold backdrop-blur-md sm:hidden ${quality.className}`}>
                <Wifi className="h-3.5 w-3.5" />{quality.label}
              </div>
            )}
            {error && <p className="rounded-2xl border border-rose-300/20 bg-rose-500/20 px-4 py-3 text-center text-sm text-rose-50 backdrop-blur-md">{error}</p>}
            {isIncoming && (
              <p className="rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3 text-center text-xs leading-relaxed text-white/75 backdrop-blur-md">
                Camera và micro chỉ mở sau khi bạn nhấn nhận cuộc gọi.
              </p>
            )}
            {callId && phase === 'ringing' && (
              <p className="text-center text-xs text-white/60">Đang chờ {name} nhận cuộc gọi…</p>
            )}
          </div>
        </div>

        <footer className="absolute inset-x-0 bottom-0 z-30 px-3 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6 sm:pb-6">
          <div className="mx-auto flex min-h-20 w-fit max-w-full items-center justify-center gap-3 rounded-[1.75rem] border border-white/10 bg-slate-950/65 px-4 py-3 shadow-2xl backdrop-blur-xl sm:gap-5 sm:px-6">
          {isIncoming ? (
            <>
              <div className="flex flex-col items-center gap-1">
                <button onClick={() => void finishCall('declined').finally(onClose)} className="flex h-14 w-14 items-center justify-center rounded-full bg-rose-600 shadow-lg transition hover:bg-rose-500" aria-label="Từ chối cuộc gọi">
                  <PhoneOff className="h-6 w-6" />
                </button>
                <span className="text-[10px] font-bold text-white/65">Từ chối</span>
              </div>
              <div className="flex flex-col items-center gap-1">
                <button onClick={() => void acceptIncomingCall()} className="flex h-14 min-w-32 items-center justify-center gap-2 rounded-full bg-emerald-500 px-6 font-black shadow-lg transition hover:bg-emerald-400" aria-label="Nhận cuộc gọi">
                  {kind === 'video' ? <Video className="h-5 w-5" /> : <Phone className="h-5 w-5" />} Nhận
                </button>
                <span className="text-[10px] font-bold text-white/65">Kết nối an toàn</span>
              </div>
            </>
          ) : phase === 'ended' || phase === 'failed' ? (
            <button onClick={onClose} className="h-12 min-w-40 rounded-full bg-white px-6 font-black text-slate-900 transition hover:bg-slate-100">Đóng</button>
          ) : (
            <>
              <div className="flex flex-col items-center gap-1">
                <button onClick={toggleMute} className={`flex h-12 w-12 items-center justify-center rounded-full transition ${isMuted ? 'bg-white text-slate-950' : 'bg-white/12 hover:bg-white/20'}`} aria-label={isMuted ? 'Bật micro' : 'Tắt micro'}>
                  {isMuted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
                </button>
                <span className="text-[10px] font-bold text-white/65">{isMuted ? 'Bật mic' : 'Micro'}</span>
              </div>
              {kind === 'video' && (
                <>
                  <div className="flex flex-col items-center gap-1">
                    <button onClick={toggleCamera} className={`flex h-12 w-12 items-center justify-center rounded-full transition ${!isCameraOn ? 'bg-white text-slate-950' : 'bg-white/12 hover:bg-white/20'}`} aria-label={isCameraOn ? 'Tắt camera' : 'Bật camera'}>
                      {isCameraOn ? <Camera className="h-5 w-5" /> : <CameraOff className="h-5 w-5" />}
                    </button>
                    <span className="text-[10px] font-bold text-white/65">Camera</span>
                  </div>
                  <div className="flex flex-col items-center gap-1">
                    <button
                      onClick={() => void switchCamera()}
                      disabled={!isCameraOn || switchingCamera}
                      className="flex h-12 w-12 items-center justify-center rounded-full bg-white/12 transition hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-35"
                      aria-label="Đổi camera"
                    >
                      <SwitchCamera className={`h-5 w-5 ${switchingCamera ? 'animate-pulse' : ''}`} />
                    </button>
                    <span className="text-[10px] font-bold text-white/65">Đổi camera</span>
                  </div>
                </>
              )}
              <div className="flex flex-col items-center gap-1">
                <button onClick={dismiss} className="flex h-14 w-14 items-center justify-center rounded-full bg-rose-600 shadow-lg transition hover:bg-rose-500" aria-label="Kết thúc cuộc gọi">
                  <PhoneOff className="h-6 w-6" />
                </button>
                <span className="text-[10px] font-bold text-white/65">Kết thúc</span>
              </div>
            </>
          )}
          </div>
          <div className="mx-auto mt-2 flex w-fit items-center gap-1.5 text-[10px] font-medium text-white/45">
            <Clock3 className="h-3 w-3" /> Âm thanh rõ · Hình ảnh tự thích ứng · Không giới hạn thời gian
          </div>
        </footer>
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
