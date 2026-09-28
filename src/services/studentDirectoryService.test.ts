import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { StudentProfile } from '../types';
const mocks = vi.hoisted(() => ({ getDocs: vi.fn(), query: vi.fn((...parts) => parts), orderBy: vi.fn((...parts) => parts), startAfter: vi.fn(value => value), where: vi.fn((...parts) => parts) }));
vi.mock('../firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  ...mocks, collection: (_db: unknown, name: string) => name, doc: vi.fn(), documentId: () => '__name__',
  limit: (value: number) => value, setDoc: vi.fn(), serverTimestamp: vi.fn(), deleteField: vi.fn(),
}));
import { getStudentProfilesByIds, isNewStudent, searchStudentPage, sortDiscoveredStudents } from './studentDirectoryService';
const profile = (uid: string, ageDays: number) => ({ uid, fullName: uid, createdAt: { toMillis: () => Date.now() - ageDays * 86400000 } }) as StudentProfile;
const snapshot = (profiles: StudentProfile[]) => ({ size: profiles.length, empty: !profiles.length, docs: profiles.map(p => ({ id: p.uid, data: () => p })) });
const filters = { keyword: '', major: '', academicYear: '', nearbyOnly: false };

describe('student directory', () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.getDocs.mockResolvedValue(snapshot([])); });
  it('orders newest first, regardless of name or available location', () => {
    const result = sortDiscoveredStudents([{ profile: profile('An', 30), distanceKm: 0.1 }, { profile: profile('Zan', 0) }]);
    expect(result.map(s => s.profile.uid)).toEqual(['Zan', 'An']);
    expect(isNewStudent(profile('new', 1))).toBe(true);
    expect(isNewStudent(profile('old', 8))).toBe(false);
    expect(isNewStudent(profile('future', -1))).toBe(false);
  });
  it('orders in Firestore before limiting and passes the next-page cursor', async () => {
    mocks.getDocs.mockResolvedValueOnce(snapshot(Array.from({ length: 24 }, (_, i) => profile(`id${i}`, i))));
    const first = await searchStudentPage('me', filters);
    expect(mocks.orderBy).toHaveBeenCalledWith('createdAt', 'desc');
    expect(first.nextCursor?.document.id).toBe('id23');
    await searchStudentPage('me', filters, undefined, first.nextCursor);
    expect(mocks.startAfter).toHaveBeenCalledWith(first.nextCursor?.document);
  });
  it('loads friend profiles by id in batches, even outside the discover page', async () => {
    const uids = Array.from({ length: 61 }, (_, index) => `friend-${index}`);
    mocks.getDocs.mockResolvedValueOnce(snapshot(uids.slice(0, 30).map(id => profile(id, 90))))
      .mockResolvedValueOnce(snapshot(uids.slice(30, 60).map(id => profile(id, 90))))
      .mockResolvedValueOnce(snapshot(uids.slice(60).map(id => profile(id, 90))));
    expect(await getStudentProfilesByIds([...uids, uids[0]])).toHaveLength(61);
    expect(mocks.getDocs).toHaveBeenCalledTimes(3);
  });
  it('does not request nearby people without a location', async () => {
    expect(await searchStudentPage('me', { ...filters, nearbyOnly: true })).toEqual({ students: [] });
    expect(mocks.getDocs).not.toHaveBeenCalled();
  });
});
