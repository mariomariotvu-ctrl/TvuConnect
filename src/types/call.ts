export type CallKind = 'audio' | 'video';

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
