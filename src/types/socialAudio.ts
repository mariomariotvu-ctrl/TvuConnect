export type VoiceMatchPurpose = 'casual' | 'study';
export type VoiceMatchChannel = 'voice' | 'text';

export interface VoiceQueueState {
  userUid: string;
  purpose: VoiceMatchPurpose;
  channel: VoiceMatchChannel;
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
  youtubeVideoId?: string;
  youtubeUpdatedAt?: unknown;
  youtubePlaybackState?: 'playing' | 'paused';
  youtubePlaybackTime?: number;
  youtubePlaybackUpdatedAt?: unknown;
  roomLocked?: boolean;
  audioLocked?: boolean;
  videoLocked?: boolean;
  screenShareLocked?: boolean;
  createdAt?: unknown;
  ownerLastSeenAt?: unknown;
}

export interface StudyRoomParticipant {
  uid: string;
  displayName: string;
  photoURL?: string;
  handRaised?: boolean;
  handRaisedAt?: unknown;
  muted?: boolean;
  cameraOn?: boolean;
  sharingScreen?: boolean;
  joinedAt?: unknown;
  updatedAt?: unknown;
}

export type StudySignalType = 'offer' | 'answer' | 'candidate' | 'host-mute';

export interface StudySignal {
  id: string;
  fromUid: string;
  toUid: string;
  type: StudySignalType;
  description?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
  createdAt?: unknown;
}

export interface StudyReaction {
  id: string;
  fromUid: string;
  displayName: string;
  emoji: string;
  clientCreatedAt: number;
  createdAt?: unknown;
}
