import { describe, expect, it } from 'vitest';
import { extractYouTubeVideoId, getYouTubeEmbedUrl, getYouTubeWatchUrl } from './meetingMedia';

describe('meetingMedia', () => {
  it.each([
    ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://youtu.be/dQw4w9WgXcQ?t=42', 'dQw4w9WgXcQ'],
    ['https://youtube.com/shorts/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://www.youtube.com/embed/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
  ])('extracts a safe video id from %s', (input, expected) => {
    expect(extractYouTubeVideoId(input)).toBe(expected);
  });

  it('rejects non-YouTube and malformed links', () => {
    expect(extractYouTubeVideoId('https://example.com/watch?v=dQw4w9WgXcQ')).toBeNull();
    expect(extractYouTubeVideoId('javascript:alert(1)')).toBeNull();
    expect(extractYouTubeVideoId('too-short')).toBeNull();
  });

  it('uses the privacy-enhanced YouTube embed host', () => {
    expect(getYouTubeEmbedUrl('dQw4w9WgXcQ', 'https://tvuconnect.vercel.app')).toBe(
      'https://www.youtube.com/embed/dQw4w9WgXcQ?playsinline=1&rel=0&origin=https%3A%2F%2Ftvuconnect.vercel.app',
    );
    expect(getYouTubeWatchUrl('dQw4w9WgXcQ')).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  });
});
