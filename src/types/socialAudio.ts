export type VoiceMatchPurpose = 'casual' | 'study';

export interface VoiceQueueState {
  userUid: string;
  purpose: VoiceMatchPurpose;
  status: 'waiting' | 'matched';
  peerUid?: string;
  sessionId?: string;
  initiatorUid?: string;
  joinedAt?: unknown;
  expiresAt?: unknown;
}

export interface StudyRoom {
  id: string;
  ownerUid: string;
  title: string;
  subject: string;
  status: 'open' | 'closed';
  maxParticipants: number;
  participantCount: number;
  createdAt?: unknown;
  ownerLastSeenAt?: unknown;
}

export interface StudyRoomParticipant {
  uid: string;
  displayName: string;
  photoURL?: string;
  joinedAt?: unknown;
  updatedAt?: unknown;
}

export type StudySignalType = 'offer' | 'answer' | 'candidate';

export interface StudySignal {
  id: string;
  fromUid: string;
  toUid: string;
  type: StudySignalType;
  description?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
  createdAt?: unknown;
}
