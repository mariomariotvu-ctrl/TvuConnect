import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../firebase';
import { StudentProfile } from '../types';
import {
  StudyReaction,
  StudyRoom,
  StudyRoomParticipant,
  StudySignal,
  StudySignalType,
} from '../types/socialAudio';

const MAX_ROOM_PARTICIPANTS = 8;

const mapRoom = (id: string, data: Record<string, unknown>): StudyRoom => ({
  id,
  ownerUid: data.ownerUid as string,
  title: data.title as string,
  subject: data.subject as string,
  status: data.status as StudyRoom['status'],
  maxParticipants: Number(data.maxParticipants || MAX_ROOM_PARTICIPANTS),
  participantCount: Number(data.participantCount || 0),
  youtubeVideoId: typeof data.youtubeVideoId === 'string' ? data.youtubeVideoId : '',
  youtubeUpdatedAt: data.youtubeUpdatedAt,
  youtubePlaybackState: data.youtubePlaybackState === 'playing' ? 'playing' : 'paused',
  youtubePlaybackTime: Math.max(0, Number(data.youtubePlaybackTime || 0)),
  youtubePlaybackUpdatedAt: data.youtubePlaybackUpdatedAt,
  roomLocked: data.roomLocked === true,
  audioLocked: data.audioLocked === true,
  videoLocked: data.videoLocked === true,
  screenShareLocked: data.screenShareLocked === true,
  createdAt: data.createdAt,
  ownerLastSeenAt: data.ownerLastSeenAt,
});

export async function getStudyRoom(roomId: string): Promise<StudyRoom | null> {
  const snapshot = await getDoc(doc(db, 'studyRooms', roomId));
  return snapshot.exists() ? mapRoom(snapshot.id, snapshot.data()) : null;
}

export function subscribeToStudyRooms(
  onChange: (rooms: StudyRoom[]) => void,
  onError?: (error: Error) => void,
) {
  const roomsQuery = query(
    collection(db, 'studyRooms'),
    where('status', '==', 'open'),
    orderBy('createdAt', 'desc'),
    limit(20),
  );
  return onSnapshot(roomsQuery, (snapshot) => {
    onChange(snapshot.docs.map((room) => mapRoom(room.id, room.data())));
  }, (error) => onError?.(error));
}

export function subscribeToStudyRoom(
  roomId: string,
  onChange: (room: StudyRoom | null) => void,
  onError?: (error: Error) => void,
) {
  return onSnapshot(doc(db, 'studyRooms', roomId), (snapshot) => {
    onChange(snapshot.exists() ? mapRoom(snapshot.id, snapshot.data()) : null);
  }, (error) => onError?.(error));
}

export async function createStudyRoom(
  owner: StudentProfile,
  title: string,
  subject: string,
): Promise<StudyRoom> {
  const roomRef = await addDoc(collection(db, 'studyRooms'), {
    ownerUid: owner.uid,
    title: title.trim().slice(0, 80),
    subject: subject.trim().slice(0, 80),
    status: 'open',
    maxParticipants: MAX_ROOM_PARTICIPANTS,
    participantCount: 0,
    youtubeVideoId: '',
    youtubePlaybackState: 'paused',
    youtubePlaybackTime: 0,
    roomLocked: false,
    audioLocked: false,
    videoLocked: false,
    screenShareLocked: false,
    createdAt: serverTimestamp(),
    ownerLastSeenAt: serverTimestamp(),
  });

  try {
    await joinStudyRoom(roomRef.id);
  } catch (error) {
    await updateDoc(roomRef, {
      status: 'closed',
      closedAt: serverTimestamp(),
    }).catch(() => undefined);
    throw error;
  }
  return {
    id: roomRef.id,
    ownerUid: owner.uid,
    title: title.trim(),
    subject: subject.trim(),
    status: 'open',
    maxParticipants: MAX_ROOM_PARTICIPANTS,
    participantCount: 1,
    youtubeVideoId: '',
    youtubePlaybackState: 'paused',
    youtubePlaybackTime: 0,
    roomLocked: false,
    audioLocked: false,
    videoLocked: false,
    screenShareLocked: false,
  };
}

export async function setStudyRoomYouTube(roomId: string, videoId: string) {
  await updateDoc(doc(db, 'studyRooms', roomId), {
    youtubeVideoId: videoId,
    youtubeUpdatedAt: serverTimestamp(),
    youtubePlaybackState: 'paused',
    youtubePlaybackTime: 0,
    youtubePlaybackUpdatedAt: serverTimestamp(),
  });
}

export async function setStudyRoomYouTubePlayback(
  roomId: string,
  state: 'playing' | 'paused',
  timeSeconds: number,
) {
  await updateDoc(doc(db, 'studyRooms', roomId), {
    youtubePlaybackState: state,
    youtubePlaybackTime: Math.max(0, Math.min(864_000, timeSeconds)),
    youtubePlaybackUpdatedAt: serverTimestamp(),
  });
}

export type StudyRoomControl = 'roomLocked' | 'audioLocked' | 'videoLocked' | 'screenShareLocked';

export async function setStudyRoomControl(
  roomId: string,
  control: StudyRoomControl,
  enabled: boolean,
) {
  await updateDoc(doc(db, 'studyRooms', roomId), {
    [control]: enabled,
    controlsUpdatedAt: serverTimestamp(),
  });
}

export async function setStudyParticipantState(
  roomId: string,
  uid: string,
  state: Partial<Pick<StudyRoomParticipant, 'handRaised' | 'muted' | 'cameraOn' | 'sharingScreen'>>,
) {
  const update: Record<string, unknown> = { ...state, updatedAt: serverTimestamp() };
  if ('handRaised' in state) {
    update.handRaisedAt = state.handRaised ? serverTimestamp() : null;
  }
  await updateDoc(doc(db, 'studyRooms', roomId, 'participants', uid), update);
}

export async function removeStudyRoomParticipant(roomId: string, participantUid: string) {
  const callable = httpsCallable<
    { roomId: string; participantUid: string },
    { participantCount: number }
  >(functions, 'removeStudyRoomParticipant', { timeout: 20_000 });
  return (await callable({ roomId, participantUid })).data;
}

export async function sendStudyReaction(
  roomId: string,
  fromUid: string,
  displayName: string,
  emoji: string,
) {
  const reactionRef = await addDoc(collection(db, 'studyRooms', roomId, 'reactions'), {
    fromUid,
    displayName: displayName.slice(0, 80),
    emoji,
    clientCreatedAt: Date.now(),
    createdAt: serverTimestamp(),
  });
  window.setTimeout(() => {
    void deleteDoc(reactionRef).catch(() => undefined);
  }, 15_000);
}

export function subscribeToStudyReactions(
  roomId: string,
  onReaction: (reaction: StudyReaction) => void,
  onError?: (error: Error) => void,
) {
  const reactionsQuery = query(
    collection(db, 'studyRooms', roomId, 'reactions'),
    orderBy('createdAt', 'desc'),
    limit(30),
  );
  return onSnapshot(reactionsQuery, (snapshot) => {
    snapshot.docChanges().forEach((change) => {
      if (change.type !== 'added') return;
      const reaction = { id: change.doc.id, ...change.doc.data() } as StudyReaction;
      if (Date.now() - Number(reaction.clientCreatedAt || 0) <= 12_000) onReaction(reaction);
    });
  }, (error) => onError?.(error));
}

export async function joinStudyRoom(roomId: string) {
  const callable = httpsCallable<{ roomId: string }, {
    participantCount: number;
    maxParticipants: number;
    alreadyJoined: boolean;
    roomLocked: boolean;
    audioLocked: boolean;
    videoLocked: boolean;
    screenShareLocked: boolean;
  }>(
    functions,
    'joinStudyRoom',
    { timeout: 20_000 },
  );
  return (await callable({ roomId })).data;
}

export async function touchStudyRoom(room: StudyRoom, uid: string) {
  await updateDoc(doc(db, 'studyRooms', room.id, 'participants', uid), {
    updatedAt: serverTimestamp(),
  });
  if (room.ownerUid === uid) {
    await updateDoc(doc(db, 'studyRooms', room.id), { ownerLastSeenAt: serverTimestamp() });
  }
}

export async function leaveStudyRoom(room: StudyRoom) {
  const callable = httpsCallable<{ roomId: string }, { participantCount: number; closed: boolean }>(
    functions,
    'leaveStudyRoom',
    { timeout: 20_000 },
  );
  return (await callable({ roomId: room.id })).data;
}

export function subscribeToStudyRoomParticipants(
  roomId: string,
  onChange: (participants: StudyRoomParticipant[]) => void,
  onError?: (error: Error) => void,
) {
  return onSnapshot(collection(db, 'studyRooms', roomId, 'participants'), (snapshot) => {
    onChange(snapshot.docs.map((participant) => participant.data() as StudyRoomParticipant));
  }, (error) => onError?.(error));
}

export async function sendStudySignal(
  roomId: string,
  fromUid: string,
  toUid: string,
  type: StudySignalType,
  payload: { description?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit } = {},
) {
  await addDoc(collection(db, 'studyRooms', roomId, 'signals'), {
    fromUid,
    toUid,
    type,
    ...payload,
    createdAt: serverTimestamp(),
  });
}

export function subscribeToStudySignals(
  roomId: string,
  uid: string,
  onSignal: (signal: StudySignal) => void,
  onError?: (error: Error) => void,
) {
  const signalsQuery = query(
    collection(db, 'studyRooms', roomId, 'signals'),
    where('toUid', '==', uid),
  );
  return onSnapshot(signalsQuery, (snapshot) => {
    snapshot.docChanges().forEach((change) => {
      if (change.type !== 'added') return;
      onSignal({ id: change.doc.id, ...change.doc.data() } as StudySignal);
    });
  }, (error) => onError?.(error));
}

export async function removeStudySignal(roomId: string, signalId: string) {
  await deleteDoc(doc(db, 'studyRooms', roomId, 'signals', signalId));
}
