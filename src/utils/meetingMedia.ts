const YOUTUBE_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

export function extractYouTubeVideoId(input: string): string | null {
  const value = input.trim();
  if (!value) return null;
  if (YOUTUBE_ID_PATTERN.test(value)) return value;

  try {
    const url = new URL(value);
    const host = url.hostname.replace(/^www\./, '').toLowerCase();
    let candidate = '';

    if (host === 'youtu.be') {
      candidate = url.pathname.split('/').filter(Boolean)[0] || '';
    } else if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com') {
      if (url.pathname === '/watch') candidate = url.searchParams.get('v') || '';
      else if (url.pathname.startsWith('/shorts/') || url.pathname.startsWith('/embed/') || url.pathname.startsWith('/live/')) {
        candidate = url.pathname.split('/').filter(Boolean)[1] || '';
      }
    }

    return YOUTUBE_ID_PATTERN.test(candidate) ? candidate : null;
  } catch {
    return null;
  }
}

export function getYouTubeEmbedUrl(videoId: string, pageOrigin?: string): string {
  const origin = pageOrigin || (
    typeof window !== 'undefined' && /^https?:$/.test(window.location.protocol)
      ? window.location.origin
      : ''
  );
  const parameters = new URLSearchParams({ playsinline: '1', rel: '0' });
  if (origin) parameters.set('origin', origin);
  return `https://www.youtube.com/embed/${videoId}?${parameters.toString()}`;
}

export function getYouTubeWatchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

export function supportsDisplayCapture(): boolean {
  return typeof navigator !== 'undefined'
    && typeof navigator.mediaDevices?.getDisplayMedia === 'function';
}
