import { collection, query, where, limit, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { StudentProfile } from '../types';
import { MatchingFilters } from '../hooks/useMatchingFilters';
import { applyFilters } from '../utils/matchingHelpers';

/**
 * Get fallback profiles (previously viewed) from match history
 */
export const getFallbackProfiles = async (
  userUid: string,
  filters: MatchingFilters,
  blockedSet: Set<string>,
  mode: 'lover' | 'study' | 'quick' | 'hobby',
  currentProfile: StudentProfile | null
): Promise<StudentProfile[]> => {
  try {
    const matchesRef = collection(db, 'matches');
    const matchesQuery = query(
      matchesRef,
      where('userUid', '==', userUid),
      limit(30)
    );

    const matchesSnapshot = await getDocs(matchesQuery);
    const viewedProfiles: StudentProfile[] = [];
    const seenUids = new Set<string>();

    for (const doc of matchesSnapshot.docs) {
      const match = doc.data();
      if (
        match.matchedProfile &&
        !seenUids.has(match.matchedProfile.uid) &&
        !blockedSet.has(match.matchedProfile.uid)
      ) {
        viewedProfiles.push(match.matchedProfile);
        seenUids.add(match.matchedProfile.uid);
      }
    }

    // Apply filters to fallback profiles
    return applyFilters(viewedProfiles, filters, mode, currentProfile);
  } catch (err) {
    console.error('Error getting fallback profiles:', err);
    return [];
  }
};
