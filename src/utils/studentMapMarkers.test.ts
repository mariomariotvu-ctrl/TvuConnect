import { describe, expect, it } from 'vitest';
import {
  buildVisibleStudentMapPoints,
  safeStudentMarkerPhotoURL,
  studentMarkerInitials,
} from './studentMapMarkers';

describe('student map markers', () => {
  it('builds friendly initials when a profile has no photo', () => {
    expect(studentMarkerInitials('Nguyễn Văn An')).toBe('NA');
    expect(studentMarkerInitials('Levi')).toBe('L');
    expect(studentMarkerInitials('')).toBe('SV');
  });

  it('allows profile image sources but rejects unsafe marker URLs', () => {
    expect(safeStudentMarkerPhotoURL('https://cdn.example.com/avatar.png')).toBe('https://cdn.example.com/avatar.png');
    expect(safeStudentMarkerPhotoURL('data:image/png;base64,YWJjZA==')).toBe('data:image/png;base64,YWJjZA==');
    expect(safeStudentMarkerPhotoURL('javascript:alert(1)')).toBeNull();
    expect(safeStudentMarkerPhotoURL('http://example.com/avatar.png')).toBeNull();
  });

  it('returns every distinct visible person so the map can fit them automatically', () => {
    expect(buildVisibleStudentMapPoints(
      [9.93, 106.34],
      [
        { uid: 'me', latitude: 9.9, longitude: 106.3, isOwn: true },
        { uid: 'friend-1', latitude: 9.95, longitude: 106.36, isOwn: false },
        { uid: 'friend-2', latitude: 10.1, longitude: 106.5, isOwn: false },
      ],
      { lat: 9.93, lng: 106.34 },
    )).toEqual([
      [9.93, 106.34],
      [9.95, 106.36],
      [10.1, 106.5],
    ]);
  });
});
