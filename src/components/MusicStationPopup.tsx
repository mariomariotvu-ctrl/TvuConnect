import React, { useState, useRef } from 'react';
import { MusicStation } from '../types';
import { Play, Pause } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { format } from 'date-fns';

interface MusicStationPopupProps {
  station: MusicStation;
}

export const MusicStationPopup: React.FC<MusicStationPopupProps> = ({ station }) => {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  
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

  // Lấy ảnh bìa: Nếu có ảnh tự chọn thì dùng ảnh đó, nếu không lấy ảnh bài hát, nếu không có nữa thì bỏ qua
  const displayImage = station.imageUrl || station.song?.coverUrl;

  const dateStr = station.createdAt 
    ? format(station.createdAt.toDate ? station.createdAt.toDate() : new Date(station.createdAt), 'HH:mm dd/MM/yyyy') 
    : '';

  return (
    <div 
      className="rounded-2xl overflow-hidden font-sans shadow-[0_8px_30px_rgb(0,0,0,0.12)] w-64 border"
      style={{
        background: isDark ? '#1e293b' : '#ffffff',
        borderColor: isDark ? '#334155' : '#e2e8f0',
        color: isDark ? '#f8fafc' : '#0f172a'
      }}
    >
      {/* Ảnh bìa */}
      {displayImage && (
        <div className="relative w-full aspect-video bg-gray-100 dark:bg-slate-800">
          <img 
            src={displayImage} 
            alt="Cover" 
            className="w-full h-full object-cover"
          />
          
          {/* Nút Play/Pause nổi trên ảnh nếu có bài hát */}
          {station.song?.previewUrl && (
            <button
              onClick={togglePlay}
              className="absolute inset-0 flex items-center justify-center bg-black/20 hover:bg-black/40 transition-colors group"
            >
              <div className="w-12 h-12 rounded-full bg-white/90 shadow-lg flex items-center justify-center text-purple-600 transform scale-90 group-hover:scale-100 transition-transform">
                {isPlaying ? <Pause className="w-6 h-6 fill-current" /> : <Play className="w-6 h-6 fill-current ml-1" />}
              </div>
            </button>
          )}
        </div>
      )}

      {/* Thông tin bài hát đang phát */}
      {station.song && isPlaying && (
        <div className="px-4 py-2 bg-purple-50 dark:bg-purple-900/20 border-b border-purple-100 dark:border-purple-800/30 flex items-center gap-2">
          <div className="w-1 h-3 bg-purple-500 rounded-full animate-pulse" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-purple-700 dark:text-purple-300 truncate">
              {station.song.title}
            </p>
            <p className="text-[10px] text-purple-600/70 dark:text-purple-400/70 truncate">
              {station.song.artist}
            </p>
          </div>
        </div>
      )}

      {/* Nội dung status */}
      <div className="p-4">
        <h3 className="font-serif font-black text-lg tracking-wide uppercase mb-3 text-slate-800 dark:text-slate-100" style={{ fontFamily: 'Georgia, serif' }}>
          {station.userName}
        </h3>
        
        <p className="text-sm font-medium italic text-slate-600 dark:text-slate-300 leading-relaxed mb-4">
          "{station.content}"
        </p>
        
        <p className="text-[11px] font-medium text-right text-slate-400 dark:text-slate-500">
          {dateStr}
        </p>
      </div>

      {/* Thẻ audio ẩn */}
      {station.song?.previewUrl && (
        <audio 
          ref={audioRef}
          src={station.song.previewUrl}
          onEnded={handleEnded}
          preload="none"
        />
      )}
    </div>
  );
};
