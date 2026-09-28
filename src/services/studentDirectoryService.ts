import {
  collection,
  deleteField,
  getDocs,
  limit,
  query,
  serverTimestamp,
  setDoc,
  doc,
  documentId,
  orderBy,
  startAfter,
  type QueryConstraint,
  type QueryDocumentSnapshot,
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

const PAGE_SIZE = 24;

export interface StudentPageCursor {
  document: QueryDocumentSnapshot;
  legacyFallback: boolean;
}

export const joinedAtMillis = (profile: StudentProfile): number => {
  const value = profile.createdAt?.toMillis?.() ?? 0;
  return Number.isFinite(value) ? value : 0;
};

export const isNewStudent = (profile: StudentProfile, now = Date.now()) => {
  const joined = joinedAtMillis(profile);
  return joined > 0 && joined <= now && now - joined < 7 * 24 * 60 * 60 * 1000;
};

export const profileMatches = (profile: StudentProfile, filters: StudentSearchFilters) => {
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

export async function searchStudentPage(
  currentUid: string,
  filters: StudentSearchFilters,
  currentLocation?: Coordinates,
  cursor?: StudentPageCursor,
): Promise<{ students: DiscoveredStudent[]; nextCursor?: StudentPageCursor }> {
  if (filters.nearbyOnly && !currentLocation) return { students: [] };
  const profilesRef = collection(db, 'profiles');
  const searchToken = getStudentSearchQueryToken(filters.keyword || filters.major);
  const normalizedMajor = normalizeVietnameseText(filters.major);
  const academicYear = filters.academicYear.trim();

  // Keep location discovery as a separate query: Firestore does not allow an
  // arbitrary mix of disjunctive (`in`) and array filters. Other searches use
  // a prefix token so they do not silently inspect only the first profiles.
  const constraints: QueryConstraint[] = [];
  if (filters.nearbyOnly && currentLocation) constraints.push(where('nearbyCell', 'in', nearbyCells(currentLocation)));
  else if (!cursor?.legacyFallback) {
    if (searchToken) constraints.push(where('searchTokens', 'array-contains', searchToken));
    else if (normalizedMajor) constraints.push(where('majorNormalized', '==', normalizedMajor));
    else if (academicYear) constraints.push(where('academicYear', '==', academicYear));
  }
  const pageConstraints = [orderBy('createdAt', 'desc'), ...(cursor ? [startAfter(cursor.document)] : []), limit(PAGE_SIZE)];
  let snapshot = await getDocs(query(profilesRef, ...constraints, ...pageConstraints));
  let legacyFallback = cursor?.legacyFallback === true;

  // Profiles created before the search-token field was introduced remain
  // discoverable while each student gradually updates their profile.
  if (snapshot.empty && searchToken && !cursor && !filters.nearbyOnly) {
    snapshot = await getDocs(query(profilesRef, ...pageConstraints));
    legacyFallback = true;
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

  return {
    students: sortDiscoveredStudents(results, filters.nearbyOnly),
    nextCursor: snapshot.size === PAGE_SIZE
      ? { document: snapshot.docs[snapshot.docs.length - 1], legacyFallback }
      : undefined,
  };
}

export function sortDiscoveredStudents(students: DiscoveredStudent[], nearbyOnly = false) {
  return [...students].sort((left, right) => {
    if (nearbyOnly && left.distanceKm !== undefined && right.distanceKm !== undefined) {
      return left.distanceKm - right.distanceKm;
    }
    return joinedAtMillis(right.profile) - joinedAtMillis(left.profile)
      || left.profile.fullName.localeCompare(right.profile.fullName, 'vi');
  });
}

/** Load actual connections, not a filtered subset of the discovery page. */
export async function getStudentProfilesByIds(uids: string[]): Promise<StudentProfile[]> {
  const unique = [...new Set(uids)].filter(Boolean);
  const profiles: StudentProfile[] = [];
  for (let index = 0; index < unique.length; index += 30) {
    const snapshot = await getDocs(query(collection(db, 'profiles'), where(documentId(), 'in', unique.slice(index, index + 30))));
    profiles.push(...snapshot.docs.map(profile => ({ ...profile.data(), uid: profile.id }) as StudentProfile));
  }
  return profiles.filter(profile => Boolean(profile.fullName));
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
