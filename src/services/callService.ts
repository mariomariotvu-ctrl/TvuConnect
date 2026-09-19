import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  Timestamp,
  where,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../firebase';
import {
  CallCandidateSide,
  CallKind,
  CallSession,
  CallStatus,
} from '../types/call';

export interface CreateCallInput {
  callerUid: string;
  calleeUid: string;
  kind: CallKind;
  offer: RTCSessionDescriptionInit;
}

const candidateCollection = (side: CallCandidateSide) =>
  side === 'caller' ? 'callerCandidates' : 'calleeCandidates';

const toCallSession = (id: string, data: Record<string, unknown>): CallSession => ({
  id,
  callerUid: data.callerUid as string,
  calleeUid: data.calleeUid as string,
  participantUids: (data.participantUids || []) as string[],
  kind: data.kind as CallKind,
  status: data.status as CallStatus,
  offer: data.offer as RTCSessionDescriptionInit | undefined,
  answer: data.answer as RTCSessionDescriptionInit | undefined,
  createdAt: data.createdAt,
  updatedAt: data.updatedAt,
  expiresAt: data.expiresAt,
  endedAt: data.endedAt,
  endedBy: data.endedBy as string | undefined,
});

export async function createCall(input: CreateCallInput): Promise<string> {
  if (!input.calleeUid || input.calleeUid === input.callerUid) {
    throw new Error('Không tìm thấy người nhận cuộc gọi hợp lệ.');
  }

  const callable = httpsCallable<
    { calleeUid: string; kind: CallKind; offer: RTCSessionDescriptionInit },
    { callId: string }
  >(functions, 'createDirectCall', { timeout: 20_000 });
  const response = await callable({
    calleeUid: input.calleeUid,
    kind: input.kind,
    offer: input.offer,
  });
  return response.data.callId;
}

export async function answerCall(callId: string, answer: RTCSessionDescriptionInit) {
  const callRef = doc(db, 'calls', callId);
  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(callRef);
    if (!snapshot.exists()) throw new Error('Cuộc gọi không còn tồn tại.');
    if (snapshot.data().status !== 'ringing') {
      throw new Error('Cuộc gọi đã được xử lý trên thiết bị khác.');
    }
    transaction.update(callRef, {
      answer,
      status: 'connecting' satisfies CallStatus,
      updatedAt: serverTimestamp(),
    });
  });
}

export async function updateCallStatus(callId: string, status: CallStatus, endedBy?: string) {
  const callRef = doc(db, 'calls', callId);
  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(callRef);
    if (!snapshot.exists()) return;

    const currentStatus = snapshot.data().status as CallStatus;
    const terminalStatuses: CallStatus[] = ['declined', 'ended', 'failed'];
    if (currentStatus === status || terminalStatuses.includes(currentStatus)) return;

    const allowedNext: Record<CallStatus, CallStatus[]> = {
      ringing: ['connecting', 'declined', 'ended', 'failed'],
      connecting: ['active', 'ended', 'failed'],
      active: ['ended', 'failed'],
      declined: [],
      ended: [],
      failed: [],
    };
    if (!allowedNext[currentStatus]?.includes(status)) return;

    const updates: Record<string, unknown> = {
      status,
      updatedAt: serverTimestamp(),
    };
    if (terminalStatuses.includes(status)) {
      updates.endedAt = serverTimestamp();
      updates.endedBy = endedBy || null;
    }
    transaction.update(callRef, updates);
  });
}

export async function addCallCandidate(
  callId: string,
  side: CallCandidateSide,
  candidate: RTCIceCandidate | RTCIceCandidateInit,
) {
  const candidateData = 'toJSON' in candidate
    ? candidate.toJSON()
    : candidate;

  if (!candidateData.candidate) return;

  await addDoc(collection(db, 'calls', callId, candidateCollection(side)), {
    candidate: candidateData.candidate,
    sdpMid: candidateData.sdpMid ?? null,
    sdpMLineIndex: candidateData.sdpMLineIndex ?? null,
    usernameFragment: candidateData.usernameFragment ?? null,
    createdAt: serverTimestamp(),
  });
}

export function subscribeToCall(
  callId: string,
  onChange: (call: CallSession | null) => void,
  onError?: (error: Error) => void,
) {
  return onSnapshot(doc(db, 'calls', callId), (snapshot) => {
    onChange(snapshot.exists() ? toCallSession(snapshot.id, snapshot.data()) : null);
  }, (error) => onError?.(error));
}

export function subscribeToIncomingCalls(
  calleeUid: string,
  onChange: (call: CallSession | null) => void,
  onError?: (error: Error) => void,
) {
  const incomingCallsQuery = query(
    collection(db, 'calls'),
    where('calleeUid', '==', calleeUid),
    where('status', '==', 'ringing'),
    where('expiresAt', '>', Timestamp.now()),
    orderBy('expiresAt', 'asc'),
  );

  return onSnapshot(incomingCallsQuery, (snapshot) => {
    const activeCall = snapshot.docs
      .map((callDoc) => toCallSession(callDoc.id, callDoc.data()))
      .filter((call) => {
        const expiresAt = call.expiresAt as { toMillis?: () => number } | undefined;
        return !expiresAt?.toMillis || expiresAt.toMillis() > Date.now();
      })
      .sort((left, right) => {
        const leftTime = (left.createdAt as { toMillis?: () => number } | undefined)?.toMillis?.() || 0;
        const rightTime = (right.createdAt as { toMillis?: () => number } | undefined)?.toMillis?.() || 0;
        return rightTime - leftTime;
      })[0] || null;

    onChange(activeCall);
  }, (error) => onError?.(error));
}

export function subscribeToCallCandidates(
  callId: string,
  remoteSide: CallCandidateSide,
  onCandidate: (candidate: RTCIceCandidateInit) => void,
  onError?: (error: Error) => void,
) {
  return onSnapshot(
    collection(db, 'calls', callId, candidateCollection(remoteSide)),
    (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type !== 'added') return;
        const candidate = change.doc.data() as RTCIceCandidateInit;
        onCandidate(candidate);
      });
    },
    (error) => onError?.(error),
  );
}

/**
 * STUN discovers direct routes. TURN remains configurable for restrictive
 * carrier/campus networks where a direct peer-to-peer route is impossible.
 */
export function getCallIceServers(): RTCIceServer[] {
  const servers: RTCIceServer[] = [
    {
      urls: [
        // Alternative public STUN endpoints use common ports, which helps on
        // Wi-Fi networks that block Google's UDP/19302 endpoint.
        'stun:stun.cloudflare.com:3478',
        'stun:stun.relay.metered.ca:80',
        'stun:stun.l.google.com:19302',
        'stun:stun1.l.google.com:19302',
        'stun:stun2.l.google.com:19302',
      ],
    },
  ];

  const turnUrls = (import.meta.env.VITE_TURN_URL || '')
    .split(',')
    .map((url) => url.trim())
    .filter((url) => url.startsWith('turn:') || url.startsWith('turns:'));
  const turnUsername = import.meta.env.VITE_TURN_USERNAME;
  const turnCredential = import.meta.env.VITE_TURN_CREDENTIAL;

  if (turnUrls.length && turnUsername && turnCredential) {
    servers.push({
      urls: turnUrls,
      username: turnUsername,
      credential: turnCredential,
    });
  }

  return servers;
}

export function hasTurnRelayServer(servers: RTCIceServer[]): boolean {
  return servers.some((server) => {
    const urls = Array.isArray(server.urls) ? server.urls : [server.urls];
    return urls.some((url) => typeof url === 'string' && /^turns?:/i.test(url));
  });
}

export function getIceCandidateType(candidate: RTCIceCandidateInit | RTCIceCandidate): string | null {
  if ('type' in candidate && typeof candidate.type === 'string') return candidate.type;
  const match = candidate.candidate?.match(/\btyp\s+(host|srflx|prflx|relay)\b/i);
  return match?.[1]?.toLowerCase() || null;
}
