import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../firebase';

export async function updateDatingPreferences(
  uid: string,
  preferences: {
    datingEnabled?: boolean;
    hideFaceInDating?: boolean;
    datingGenderPreference?: 'any' | 'male' | 'female';
  },
) {
  await setDoc(doc(db, 'profiles', uid), {
    ...preferences,
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

export async function recordDatingDecision(
  fromUid: string,
  toUid: string,
  action: 'like' | 'pass',
): Promise<{ matched: boolean }> {
  if (!fromUid || !toUid || fromUid === toUid) return { matched: false };
  const callable = httpsCallable<
    { toUid: string; action: 'like' | 'pass' },
    { matched: boolean }
  >(functions, 'recordDatingDecision', { timeout: 20_000 });
  const response = await callable({ toUid, action });
  return response.data;
}
