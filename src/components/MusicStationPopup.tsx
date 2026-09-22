import React, { useState, useRef } from 'react';
import { MusicStation } from '../types';
import { Play, Pause, Music } from 'lucide-react';

interface MusicStationPopupProps {
  station: MusicStation;
}

export const MusicStationPopup: React.FC<MusicStationPopupProps> = ({ station }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const togglePlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const handleEnded = () => {
    setIsPlaying(false);
  };

  return (
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
};
