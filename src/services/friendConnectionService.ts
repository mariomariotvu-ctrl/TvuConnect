import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../firebase';
import type { FriendConnectionState, FriendRequest, Friendship } from '../types';

export type FriendAction = 'send' | 'accept' | 'decline' | 'cancel' | 'remove';

export async function manageFriendConnection(friendUid: string, action: FriendAction) {
  const callable = httpsCallable<
    { friendUid: string; action: FriendAction },
    { status: 'none' | 'pending' | 'accepted' }
  >(functions, 'manageFriendConnection', { timeout: 20_000 });
  const response = await callable({ friendUid, action });
  return response.data;
}

export function subscribeFriendConnections(
  uid: string,
  onChange: (friendships: Friendship[]) => void,
  onError?: (error: Error) => void,
) {
  const request = query(
    collection(db, 'friendships'),
    where('participantUids', 'array-contains', uid),
    limit(250),
  );
  return onSnapshot(request, (snapshot) => {
    onChange(snapshot.docs.map((friendship) => ({
      id: friendship.id,
      ...friendship.data(),
    } as Friendship)));
  }, (error) => onError?.(error));
}

export function subscribeIncomingFriendRequests(
  uid: string,
  onChange: (requests: FriendRequest[]) => void,
  onError?: (error: Error) => void,
) {
  const request = query(
    collection(db, 'friendRequests'),
    where('toUid', '==', uid),
    where('status', '==', 'pending'),
    orderBy('createdAt', 'desc'),
    limit(50),
  );
  return onSnapshot(request, (snapshot) => {
    onChange(snapshot.docs.map((friendRequest) => ({
      id: friendRequest.id,
      ...friendRequest.data(),
    } as FriendRequest)));
  }, (error) => onError?.(error));
}

export function subscribeOutgoingFriendRequests(
  uid: string,
  onChange: (requests: FriendRequest[]) => void,
  onError?: (error: Error) => void,
) {
  const request = query(
    collection(db, 'friendRequests'),
    where('fromUid', '==', uid),
    where('status', '==', 'pending'),
    orderBy('createdAt', 'desc'),
    limit(50),
  );
  return onSnapshot(request, (snapshot) => {
    onChange(snapshot.docs.map((friendRequest) => ({
      id: friendRequest.id,
      ...friendRequest.data(),
    } as FriendRequest)));
  }, (error) => onError?.(error));
}

export function connectionStateFor(
  friendUid: string,
  currentUid: string,
  friendships: Friendship[],
  incoming: FriendRequest[],
  outgoing: FriendRequest[],
): FriendConnectionState {
  if (friendships.some((friendship) => friendship.participantUids.includes(friendUid))) return 'accepted';
  if (incoming.some((request) => request.fromUid === friendUid && request.toUid === currentUid)) return 'incoming';
  if (outgoing.some((request) => request.fromUid === currentUid && request.toUid === friendUid)) return 'pending';
  return 'none';
}
