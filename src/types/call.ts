export type CallKind = 'audio' | 'video';
export type CallPrivacyMode = 'standard' | 'anonymous';
export type CallSource = 'direct' | 'quick_voice' | 'dating';

export interface CallContext {
  privacyMode?: CallPrivacyMode;
  source?: CallSource;
  sourceSessionId?: string;
}

export type CallStatus =
  | 'ringing'
  | 'connecting'
  | 'active'
  | 'declined'
  | 'ended'
  | 'failed';

/**
 * Firestore representation of an in-app WebRTC call. SDP and ICE data are
 * signaling only; audio/video flows directly between participants whenever
 * their networks permit it.
 */
export interface CallSession {
  id: string;
  callerUid: string;
  calleeUid: string;
  participantUids: string[];
  kind: CallKind;
  privacyMode?: CallPrivacyMode;
  source?: CallSource;
  sourceSessionId?: string;
  status: CallStatus;
  offer?: RTCSessionDescriptionInit;
  answer?: RTCSessionDescriptionInit;
  createdAt?: unknown;
  updatedAt?: unknown;
  expiresAt?: unknown;
  endedAt?: unknown;
  endedBy?: string;
}

export type CallCandidateSide = 'caller' | 'callee';
