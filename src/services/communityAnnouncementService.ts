import { doc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { safeLocalStorage } from '../utils/browserStorage';

export const isAnnouncementId = (id: string) => /^[a-zA-Z0-9_-]{1,100}$/.test(id);

/** An atomic private receipt prevents repeats across tabs, devices and reloads. */
export async function claimCommunityAnnouncement(
  uid: string,
  announcementId: string,
  canPresent: () => boolean,
): Promise<'claimed' | 'seen' | 'deferred'> {
  if (!uid || !isAnnouncementId(announcementId)) return 'deferred';
  const key = `tvu:announcement:${uid}:${announcementId}`;
  if (safeLocalStorage.getItem(key) === 'seen') return 'seen';

  const receipt = doc(db, 'users', uid, 'announcementReceipts', announcementId);
  const result = await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(receipt);
    if (snapshot.exists()) return 'seen' as const;
    // Firebase can retry this callback. Never display UI inside a transaction.
    if (!canPresent()) return 'deferred' as const;
    transaction.set(receipt, { receivedAt: serverTimestamp() });
    return 'claimed' as const;
  });
  if (result !== 'deferred') safeLocalStorage.setItem(key, 'seen');
  return result;
}
