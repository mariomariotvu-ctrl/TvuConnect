import { describe, expect, it } from 'vitest';
import {
  canonicalAppPath,
  migrateLegacyHash,
  pathForChat,
  pathForExplore,
  pathForMatching,
  pathForView,
  resolveAppRoute,
} from './appRoutes';

describe('appRoutes', () => {
  it('maps primary views to stable paths', () => {
    expect(pathForView('students')).toBe('/friends');
    expect(pathForView('documents')).toBe('/library');
    expect(pathForChat('student/01')).toBe('/messages/student%2F01');
  });

  it('resolves dynamic chat, matching, and explore paths', () => {
    expect(resolveAppRoute('/messages/student-1')).toEqual({ view: 'chat', chatUid: 'student-1' });
    expect(resolveAppRoute(pathForMatching('study'))).toEqual({ view: 'matching', matchingMode: 'study' });
    expect(resolveAppRoute(pathForExplore('rental'))).toEqual({ view: 'explore', exploreTab: 'rental' });
    expect(resolveAppRoute(pathForExplore('people'))).toEqual({ view: 'explore', exploreTab: 'people' });
  });

  it('uses safe defaults for unsupported nested values and paths', () => {
    expect(resolveAppRoute('/connect/unsupported')).toEqual({ view: 'matching', matchingMode: 'quick' });
    expect(resolveAppRoute('/explore/unsupported')).toEqual({ view: 'explore', exploreTab: 'list' });
    expect(resolveAppRoute('/not-found')).toEqual({ view: 'home' });
  });

  it('canonicalizes unsupported and non-normalized URLs', () => {
    expect(canonicalAppPath('/not-found')).toBe('/');
    expect(canonicalAppPath('/explore/unsupported')).toBe('/explore/list');
    expect(canonicalAppPath('/connect/unsupported')).toBe('/connect/quick');
    expect(canonicalAppPath('/messages/student%2F01/extra')).toBe('/messages/student%2F01');
    expect(canonicalAppPath('/library/')).toBe('/library');
  });

  it('migrates legacy hash links', () => {
    expect(migrateLegacyHash('#chat?with=student%2F01')).toBe('/messages/student%2F01');
    expect(migrateLegacyHash('#documents')).toBe('/library');
    expect(migrateLegacyHash('#unknown')).toBeNull();
  });
});
