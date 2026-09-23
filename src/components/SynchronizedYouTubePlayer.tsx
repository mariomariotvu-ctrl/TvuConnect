import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ExternalLink, Loader2, Play, Radio, TriangleAlert } from 'lucide-react';
import { setStudyRoomYouTubePlayback } from '../services/studyRoomService';
import { getYouTubeEmbedUrl, getYouTubeWatchUrl } from '../utils/meetingMedia';

interface YouTubePlayerInstance {
  destroy: () => void;
  getCurrentTime: () => number;
  getPlayerState: () => number;
  pauseVideo: () => void;
  playVideo: () => void;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
}

interface YouTubePlayerEvent {
  data: number;
  target: YouTubePlayerInstance;
}

interface YouTubePlayerOptions {
  events: {
    onAutoplayBlocked?: () => void;
    onError?: (event: YouTubePlayerEvent) => void;
    onReady?: (event: YouTubePlayerEvent) => void;
    onStateChange?: (event: YouTubePlayerEvent) => void;
  };
}

interface YouTubeApi {
  Player: new (element: HTMLElement, options: YouTubePlayerOptions) => YouTubePlayerInstance;
}

declare global {
  interface Window {
    YT?: YouTubeApi;
    onYouTubeIframeAPIReady?: () => void;
  }
}

interface SynchronizedYouTubePlayerProps {
  roomId: string;
  videoId: string;
  isController: boolean;
  playbackState: 'playing' | 'paused';
  playbackTime: number;
  playbackUpdatedAt?: unknown;
}

let youtubeApiPromise: Promise<YouTubeApi> | null = null;

const loadYouTubeApi = (): Promise<YouTubeApi> => {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (youtubeApiPromise) return youtubeApiPromise;

  youtubeApiPromise = new Promise((resolve, reject) => {
    const previousReady = window.onYouTubeIframeAPIReady;
    const timeout = window.setTimeout(() => reject(new Error('YouTube API timed out.')), 15_000);
    window.onYouTubeIframeAPIReady = () => {
      previousReady?.();
      window.clearTimeout(timeout);
      if (window.YT?.Player) resolve(window.YT);
      else reject(new Error('YouTube API unavailable.'));
    };

    if (!document.querySelector('script[data-tvu-youtube-api]')) {
      const script = document.createElement('script');
      script.src = 'https://www.youtube.com/iframe_api';
      script.async = true;
      script.dataset.tvuYoutubeApi = 'true';
      script.onerror = () => {
        window.clearTimeout(timeout);
        reject(new Error('Could not load YouTube API.'));
      };
      document.head.appendChild(script);
    }
  });
  return youtubeApiPromise;
};

const timestampToMillis = (value: unknown): number | null => {
  if (!value) return null;
  if (typeof value === 'object' && value !== null && 'toMillis' in value) {
    const toMillis = (value as { toMillis?: () => number }).toMillis;
    if (typeof toMillis === 'function') return toMillis.call(value);
  }
  if (typeof value === 'object' && value !== null && 'seconds' in value) {
    const seconds = Number((value as { seconds?: unknown }).seconds);
    if (Number.isFinite(seconds)) return seconds * 1_000;
  }
  return null;
};

const synchronizedTargetTime = (
  state: 'playing' | 'paused',
  baseTime: number,
  updatedAt: unknown,
) => {
  const updatedAtMillis = timestampToMillis(updatedAt);
  if (state !== 'playing' || !updatedAtMillis) return Math.max(0, baseTime);
  return Math.max(0, baseTime + Math.max(0, Date.now() - updatedAtMillis) / 1_000);
};

export const SynchronizedYouTubePlayer: React.FC<SynchronizedYouTubePlayerProps> = ({
  roomId,
  videoId,
  isController,
  playbackState,
  playbackTime,
  playbackUpdatedAt,
}) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const playerRef = useRef<YouTubePlayerInstance | null>(null);
  const readyRef = useRef(false);
  const publishingRef = useRef(false);
  const lastPublishedRef = useRef({ state: 'paused' as 'playing' | 'paused', time: -1, at: 0 });
  const playbackRef = useRef({ playbackState, playbackTime, playbackUpdatedAt });
  const [loading, setLoading] = useState(true);
  const [playerError, setPlayerError] = useState<string | null>(null);
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);

  playbackRef.current = { playbackState, playbackTime, playbackUpdatedAt };

  const embedUrl = useMemo(() => {
    const url = new URL(getYouTubeEmbedUrl(videoId));
    url.searchParams.set('enablejsapi', '1');
    url.searchParams.set('controls', isController ? '1' : '0');
    if (!isController) url.searchParams.set('disablekb', '1');
    return url.toString();
  }, [isController, videoId]);

  const publishPlayback = async (state: 'playing' | 'paused', force = false) => {
    const player = playerRef.current;
    if (!isController || !player || publishingRef.current) return;
    const time = Math.max(0, player.getCurrentTime() || 0);
    const previous = lastPublishedRef.current;
    if (!force && previous.state === state && Math.abs(previous.time - time) < 1 && Date.now() - previous.at < 2_000) return;

    publishingRef.current = true;
    try {
      await setStudyRoomYouTubePlayback(roomId, state, time);
      lastPublishedRef.current = { state, time, at: Date.now() };
    } catch (error) {
      console.warn('Could not synchronize YouTube playback:', error);
    } finally {
      publishingRef.current = false;
    }
  };

  const applySharedPlayback = (allowAutoplay = true) => {
    const player = playerRef.current;
    if (!player || !readyRef.current || isController) return;
    const latest = playbackRef.current;
    const target = synchronizedTargetTime(
      latest.playbackState,
      latest.playbackTime,
      latest.playbackUpdatedAt,
    );
    const current = Math.max(0, player.getCurrentTime() || 0);
    if (Math.abs(current - target) > 1.5) player.seekTo(target, true);
    if (latest.playbackState === 'playing' && allowAutoplay) player.playVideo();
    if (latest.playbackState === 'paused') player.pauseVideo();
  };

  useEffect(() => {
    let cancelled = false;
    let player: YouTubePlayerInstance | null = null;
    readyRef.current = false;
    setLoading(true);
    setPlayerError(null);
    setAutoplayBlocked(false);

    void loadYouTubeApi().then((api) => {
      if (cancelled || !iframeRef.current) return;
      player = new api.Player(iframeRef.current, {
        events: {
          onReady: (event) => {
            if (cancelled) return;
            playerRef.current = event.target;
            readyRef.current = true;
            setLoading(false);
            if (!isController) applySharedPlayback(true);
          },
          onStateChange: (event) => {
            if (!isController || cancelled) return;
            if (event.data === 1) void publishPlayback('playing', true);
            if (event.data === 2 || event.data === 0) void publishPlayback('paused', true);
          },
          onAutoplayBlocked: () => {
            if (!isController && !cancelled) setAutoplayBlocked(true);
          },
          onError: (event) => {
            if (cancelled) return;
            const blocked = event.data === 101 || event.data === 150;
            setPlayerError(blocked
              ? 'Chủ video không cho phép phát trong ứng dụng.'
              : 'YouTube chưa thể phát video này trong ứng dụng.');
            setLoading(false);
          },
        },
      });
      playerRef.current = player;
    }).catch((error) => {
      console.warn('Could not initialize YouTube player:', error);
      if (!cancelled) {
        setPlayerError('Không tải được trình phát YouTube.');
        setLoading(false);
      }
    });

    return () => {
      cancelled = true;
      readyRef.current = false;
      playerRef.current = null;
      player?.destroy();
    };
  // A changed video or controller role needs a new player instance.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [embedUrl, isController, roomId, videoId]);

  useEffect(() => {
    if (!isController) applySharedPlayback(true);
  // Firestore updates are the shared clock for viewers.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isController, playbackState, playbackTime, playbackUpdatedAt]);

  useEffect(() => {
    if (!isController) return undefined;
    const interval = window.setInterval(() => {
      if (playerRef.current?.getPlayerState() === 1) void publishPlayback('playing', true);
    }, 5_000);
    return () => window.clearInterval(interval);
  // The interval reads the current player through refs.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isController, roomId]);

  const unlockPlayback = () => {
    setAutoplayBlocked(false);
    applySharedPlayback(true);
  };

  return (
    <div className="relative h-full w-full bg-black">
      <iframe
        ref={iframeRef}
        className={`h-full w-full ${playerError ? 'invisible' : ''}`}
        src={embedUrl}
        title="Video YouTube đang xem chung realtime"
        referrerPolicy="strict-origin-when-cross-origin"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowFullScreen
      />

      {!isController && !autoplayBlocked && !playerError && (
        <div className="absolute inset-0 z-10" aria-hidden="true" />
      )}

      {loading && !playerError && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-slate-950 text-white">
          <Loader2 className="h-8 w-8 animate-spin text-red-500" />
          <p className="mt-3 text-sm font-bold">Đang vào phòng chiếu realtime…</p>
        </div>
      )}

      {autoplayBlocked && !playerError && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-slate-950/90 p-5 text-center text-white">
          <Play className="h-10 w-10 fill-current text-red-500" />
          <p className="mt-3 font-black">Chạm một lần để bật xem chung</p>
          <p className="mt-1 max-w-md text-xs text-slate-300">Trình duyệt cần thao tác này để cho phép âm thanh. Sau đó video sẽ tự đồng bộ với chủ phòng.</p>
          <button onClick={unlockPlayback} className="mt-4 rounded-full bg-red-600 px-5 py-2.5 text-sm font-black">Bật video realtime</button>
        </div>
      )}

      {playerError && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-slate-950 p-5 text-center text-white">
          <TriangleAlert className="h-9 w-9 text-amber-400" />
          <p className="mt-3 font-black">{playerError}</p>
          <a href={getYouTubeWatchUrl(videoId)} target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex items-center gap-2 rounded-full bg-white/10 px-5 py-2.5 text-sm font-black hover:bg-white/20">
            <ExternalLink className="h-4 w-4" /> Mở trên YouTube
          </a>
        </div>
      )}

      {!isController && !loading && !playerError && (
        <div className="pointer-events-none absolute left-3 top-3 z-20 inline-flex items-center gap-1.5 rounded-full bg-black/65 px-3 py-1.5 text-[11px] font-black text-white backdrop-blur">
          <Radio className="h-3.5 w-3.5 text-red-500" /> Đang theo chủ phòng
        </div>
      )}
    </div>
  );
};
