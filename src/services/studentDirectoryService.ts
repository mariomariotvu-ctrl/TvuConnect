import {
  collection,
  deleteField,
  getDocs,
  limit,
  query,
  serverTimestamp,
  setDoc,
  doc,
  where,
} from 'firebase/firestore';
import { db } from '../firebase';
import { StudentProfile } from '../types';
import { calculateDistance, Coordinates } from '../utils/locationUtils';
import { majorContains, normalizeVietnameseText } from '../utils/matchingUtils';
import { approximateLocation, nearbyCells } from '../utils/proximity';
import { getStudentSearchQueryToken } from '../utils/studentSearch';

export interface StudentSearchFilters {
  keyword: string;
  major: string;
  academicYear: string;
  nearbyOnly: boolean;
}

export interface DiscoveredStudent {
  profile: StudentProfile;
  distanceKm?: number;
}

const DEFAULT_LIMIT = 80;

const profileMatches = (profile: StudentProfile, filters: StudentSearchFilters) => {
  const keyword = normalizeVietnameseText(filters.keyword);
  const academicYear = normalizeVietnameseText(filters.academicYear);

  const searchable = normalizeVietnameseText([
    profile.fullName,
    profile.nickname,
    profile.major,
    profile.className,
    profile.university,
    profile.campus,
  ].filter(Boolean).join(' '));

  return (
    (!keyword || searchable.includes(keyword)) &&
    (!filters.major || majorContains(profile.major, filters.major)) &&
    (!academicYear || normalizeVietnameseText(profile.academicYear || '').includes(academicYear))
  );
};

export async function searchStudents(
  currentUid: string,
  filters: StudentSearchFilters,
  currentLocation?: Coordinates,
): Promise<DiscoveredStudent[]> {
  const profilesRef = collection(db, 'profiles');
  const searchToken = getStudentSearchQueryToken(filters.keyword || filters.major);
  const normalizedMajor = normalizeVietnameseText(filters.major);
  const academicYear = filters.academicYear.trim();

  // Keep location discovery as a separate query: Firestore does not allow an
  // arbitrary mix of disjunctive (`in`) and array filters. Other searches use
  // a prefix token so they do not silently inspect only the first profiles.
  const profilesQuery = filters.nearbyOnly && currentLocation
    ? query(profilesRef, where('nearbyCell', 'in', nearbyCells(currentLocation)), limit(DEFAULT_LIMIT))
    : searchToken
      ? query(profilesRef, where('searchTokens', 'array-contains', searchToken), limit(DEFAULT_LIMIT))
    : normalizedMajor
      ? query(profilesRef, where('majorNormalized', '==', normalizedMajor), limit(DEFAULT_LIMIT))
        : academicYear
          ? query(profilesRef, where('academicYear', '==', academicYear), limit(DEFAULT_LIMIT))
          : query(profilesRef, limit(DEFAULT_LIMIT));

  let snapshot = await getDocs(profilesQuery);

  // Profiles created before the search-token field was introduced remain
  // discoverable while each student gradually updates their profile.
  if (snapshot.empty && searchToken) {
    snapshot = await getDocs(query(profilesRef, limit(DEFAULT_LIMIT)));
  }
  const results = snapshot.docs
    .map((profileDoc) => ({
      ...profileDoc.data(),
      uid: profileDoc.id,
    }) as StudentProfile)
    .filter((profile) => profile.uid !== currentUid)
    .filter((profile) => Boolean(profile.fullName))
    .filter((profile) => !filters.nearbyOnly || profile.nearbyOptIn === true)
    .filter((profile) => profileMatches(profile, filters))
    .map((profile) => {
      const hasApproximateLocation = currentLocation
        && typeof profile.nearbyLatitude === 'number'
        && typeof profile.nearbyLongitude === 'number';

      return {
        profile,
        distanceKm: hasApproximateLocation
          ? calculateDistance(currentLocation, {
              lat: profile.nearbyLatitude!,
              lng: profile.nearbyLongitude!,
            })
          : undefined,
      };
    });

  return results.sort((left, right) => {
    if (left.distanceKm !== undefined && right.distanceKm !== undefined) {
      return left.distanceKm - right.distanceKm;
    }
    if (left.distanceKm !== undefined) return -1;
    if (right.distanceKm !== undefined) return 1;
    return left.profile.fullName.localeCompare(right.profile.fullName, 'vi');
  });
}

/** Save only a coarse cell so nearby search cannot reveal an exact address. */
export async function enableNearbyDiscovery(userUid: string, coordinates: Coordinates) {
  const location = approximateLocation(coordinates);

  await setDoc(doc(db, 'profiles', userUid), {
    nearbyOptIn: true,
    nearbyCell: location.cell,
    nearbyLatitude: location.latitude,
    nearbyLongitude: location.longitude,
    nearbyUpdatedAt: serverTimestamp(),
  }, { merge: true });
}

export async function disableNearbyDiscovery(userUid: string) {
  await setDoc(doc(db, 'profiles', userUid), {
    nearbyOptIn: false,
    nearbyCell: deleteField(),
    nearbyLatitude: deleteField(),
    nearbyLongitude: deleteField(),
    nearbyUpdatedAt: serverTimestamp(),
  }, { merge: true });
}
