import React, { useState, useRef } from 'react';
import { MusicStation } from '../types';
import { Clock3, Music, Pause, Play } from 'lucide-react';

interface MusicStationPopupProps {
  station: MusicStation;
  variant?: 'compact' | 'card';
}

const stationCreatedAt = (value: MusicStation['createdAt']) => {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value?.toDate === 'function') return value.toDate();
  if (typeof value?.seconds === 'number') return new Date(value.seconds * 1_000);
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const formatStationTime = (value: MusicStation['createdAt']) => {
  const date = stationCreatedAt(value);
  if (!date) return 'Vừa đăng';
  return new Intl.DateTimeFormat('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
};

export const MusicStationPopup: React.FC<MusicStationPopupProps> = ({ station, variant = 'card' }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const togglePlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        void audioRef.current.play().catch(() => setIsPlaying(false));
      }
      setIsPlaying(!isPlaying);
    }
  };

  const handleEnded = () => {
    setIsPlaying(false);
  };

  if (variant === 'compact') return (
    <div 
      className="flex items-center gap-2.5 rounded-full bg-white/95 p-1.5 pr-4 shadow-[0_4px_16px_rgba(0,0,0,0.12)] border border-slate-200 dark:bg-slate-900/95 dark:border-slate-800 pointer-events-auto transition-transform hover:scale-105 cursor-pointer max-w-[240px]"
      onClick={station.song?.previewUrl ? togglePlay : undefined}
    >
      {/* Avatar + Nút Play */}
      <div className="relative shrink-0 flex items-center justify-center h-8 w-8 rounded-full overflow-hidden bg-slate-100 dark:bg-slate-800 ring-2 ring-indigo-50 dark:ring-indigo-900/50">
        <img 
          src={station.userAvatar || 'https://via.placeholder.com/40'} 
          alt={station.userName} 
          className="absolute inset-0 w-full h-full object-cover" 
        />
        {station.song?.previewUrl ? (
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center backdrop-blur-[1px]">
            {isPlaying ? <Pause className="h-4 w-4 text-white fill-current" /> : <Play className="h-4 w-4 text-white fill-current ml-0.5" />}
          </div>
        ) : (
          <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
            <Music className="h-3.5 w-3.5 text-white" />
          </div>
        )}
      </div>

      {/* Nội dung */}
      <div className="flex flex-col min-w-0 flex-1 py-0.5">
        {station.song && (
          <span className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 truncate leading-tight">
            {station.song.title}
          </span>
        )}
        <span className="text-[11px] text-slate-700 dark:text-slate-200 truncate leading-tight" title={`${station.userName}: ${station.content}`}>
          <strong className="font-semibold text-slate-900 dark:text-white mr-1">{station.userName}</strong>
          {station.content ? <span className="opacity-90">{station.content}</span> : null}
        </span>
      </div>

      {/* Trình phát nhạc ẩn */}
      {station.song?.previewUrl && (
        <audio 
          ref={audioRef} 
          src={station.song.previewUrl} 
          onEnded={handleEnded} 
          className="hidden" 
        />
      )}
    </div>
  );

  const heroImage = station.imageUrl || station.song?.coverUrl || '';

  return (
    <article className="w-[min(78vw,280px)] overflow-hidden rounded-3xl bg-white text-slate-900 shadow-2xl dark:bg-slate-900 dark:text-white">
      {heroImage ? (
        <div className="relative aspect-[16/10] overflow-hidden bg-slate-100 dark:bg-slate-800">
          <img src={heroImage} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
          {station.song?.previewUrl && (
            <button
              type="button"
              onClick={togglePlay}
              className="absolute inset-0 m-auto flex h-12 w-12 items-center justify-center rounded-full bg-black/55 text-white shadow-lg backdrop-blur-sm transition hover:scale-105"
              aria-label={isPlaying ? 'Tạm dừng nhạc' : 'Phát nhạc'}
            >
              {isPlaying ? <Pause className="h-5 w-5 fill-current" /> : <Play className="ml-0.5 h-5 w-5 fill-current" />}
            </button>
          )}
        </div>
      ) : (
        <div className="flex h-24 items-center justify-center bg-gradient-to-br from-fuchsia-500 to-indigo-600 text-white">
          <Music className="h-9 w-9" />
        </div>
      )}

      <div className="p-4">
        <div className="flex items-center gap-2.5 border-b border-slate-100 pb-3 dark:border-slate-800">
          {station.userAvatar ? (
            <img src={station.userAvatar} alt="" className="h-9 w-9 rounded-full object-cover" referrerPolicy="no-referrer" />
          ) : (
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-100 text-xs font-black text-indigo-700 dark:bg-indigo-950 dark:text-indigo-200">
              {station.userName.trim().slice(0, 1).toUpperCase() || 'T'}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-sm font-black">{station.userName}</h3>
            {station.song && <p className="truncate text-[11px] font-semibold text-indigo-600 dark:text-indigo-300">{station.song.title} · {station.song.artist}</p>}
          </div>
        </div>

        {station.content && <p className="mt-3 whitespace-pre-wrap text-sm font-semibold italic leading-relaxed text-slate-700 dark:text-slate-200">“{station.content}”</p>}
        <p className="mt-3 flex items-center justify-end gap-1 text-[10px] font-medium text-slate-400">
          <Clock3 className="h-3 w-3" />{formatStationTime(station.createdAt)}
        </p>
      </div>

      {station.song?.previewUrl && (
        <audio ref={audioRef} src={station.song.previewUrl} onEnded={handleEnded} className="hidden" />
      )}
    </article>
  );
};
