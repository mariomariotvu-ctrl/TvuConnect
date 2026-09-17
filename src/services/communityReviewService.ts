import {
  collection,
  deleteDoc,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  where,
} from 'firebase/firestore';
import { db } from '../firebase';
import { CommunityReview, CommunityReviewTarget } from '../types';

export function subscribeToCommunityReviews(
  targetKind: CommunityReviewTarget,
  targetId: string,
  onChange: (reviews: CommunityReview[]) => void,
  onError?: (error: Error) => void,
) {
  const reviewsQuery = query(
    collection(db, 'communityReviews'),
    where('targetKind', '==', targetKind),
    where('targetId', '==', targetId),
    orderBy('updatedAt', 'desc'),
    limit(100),
  );

  return onSnapshot(reviewsQuery, (snapshot) => {
    onChange(snapshot.docs.map((review) => ({
      id: review.id,
      ...review.data(),
    } as CommunityReview)));
  }, (error) => onError?.(error));
}

interface SaveReviewInput {
  targetKind: CommunityReviewTarget;
  targetId: string;
  userId: string;
  userName: string;
  userAvatar?: string;
  rating: number;
  content: string;
}

export async function saveCommunityReview(input: SaveReviewInput) {
  const reviewId = `${input.targetKind}_${input.targetId}_${input.userId}`;
  const reviewRef = doc(db, 'communityReviews', reviewId);

  await runTransaction(db, async (transaction) => {
    const existing = await transaction.get(reviewRef);
    const reviewData = {
      targetKind: input.targetKind,
      targetId: input.targetId,
      userId: input.userId,
      userName: input.userName,
      ...(input.userAvatar ? { userAvatar: input.userAvatar } : {}),
      rating: Math.min(5, Math.max(1, Math.round(input.rating))),
      content: input.content.trim().slice(0, 1000),
      updatedAt: serverTimestamp(),
    };

    transaction.set(reviewRef, existing.exists()
      ? reviewData
      : { ...reviewData, createdAt: serverTimestamp() }, { merge: true });
  });
}

export async function deleteCommunityReview(
  targetKind: CommunityReviewTarget,
  targetId: string,
  userId: string,
) {
  await deleteDoc(doc(db, 'communityReviews', `${targetKind}_${targetId}_${userId}`));
}
