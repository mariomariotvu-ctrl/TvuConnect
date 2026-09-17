import { deleteDoc, doc, onSnapshot } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../firebase';
import { VoiceMatchPurpose, VoiceQueueState } from '../types/socialAudio';

interface MatchVoiceResponse {
  status: 'waiting' | 'matched';
  peerUid?: string;
  sessionId?: string;
  initiatorUid?: string;
}

export async function joinVoiceMatchQueue(purpose: VoiceMatchPurpose): Promise<MatchVoiceResponse> {
  const callable = httpsCallable<{ purpose: VoiceMatchPurpose }, MatchVoiceResponse>(
    functions,
    'matchVoicePartner',
    { timeout: 20_000 },
  );
  const response = await callable({ purpose });
  return response.data;
}

export function subscribeToVoiceQueue(
  uid: string,
  onChange: (state: VoiceQueueState | null) => void,
  onError?: (error: Error) => void,
) {
  return onSnapshot(
    doc(db, 'voiceMatchQueue', uid),
    (snapshot) => onChange(snapshot.exists() ? snapshot.data() as VoiceQueueState : null),
    (error) => onError?.(error),
  );
}

export async function leaveVoiceMatchQueue(uid: string) {
  await deleteDoc(doc(db, 'voiceMatchQueue', uid));
}
