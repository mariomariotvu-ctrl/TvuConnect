import React, { useState, useEffect } from 'react';
import { User } from 'firebase/auth';
import { db, collection, addDoc, serverTimestamp } from '../firebase';
import { X, Search, MapPin, Music, Loader2, Image as ImageIcon } from 'lucide-react';
import { toast } from 'sonner';
import { useTheme } from '../contexts/ThemeContext';
import { safeWrite } from '../utils/quotaManager';
import { requestFreshGeolocation } from '../utils/geolocation';
import { compressImage } from '../utils/imageCompression';
import type { StudentProfile } from '../types';
import { ImageSourcePicker } from './ImageSourcePicker';

interface CreateStationModalProps {
  currentUser: User;
  currentProfile: StudentProfile | null;
  onClose: () => void;
}

interface iTunesSong {
  trackId: number;
  trackName: string;
  artistName: string;
  artworkUrl100: string;
  previewUrl: string;
}

export const CreateStationModal: React.FC<CreateStationModalProps> = ({ currentUser, currentProfile, onClose }) => {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<iTunesSong[]>([]);
  
  const [selectedSong, setSelectedSong] = useState<iTunesSong | null>(null);
  const [content, setContent] = useState('');
  const [imagePreview, setImagePreview] = useState('');
  const [isProcessingImage, setIsProcessingImage] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Debounce search
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }

    const delayDebounceFn = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(searchQuery)}&entity=song&limit=10`);
        const data = await res.json();
        setSearchResults(data.results || []);
      } catch (error) {
        console.error('Error searching music:', error);
      } finally {
        setIsSearching(false);
      }
    }, 500);

    return () => clearTimeout(delayDebounceFn);
  }, [searchQuery]);

  const handleImageSelected = async (file?: File) => {
    if (!file) return;
    setIsProcessingImage(true);
    try {
      const compressed = await compressImage(file, 900, 900, 0.86, false, 280);
      setImagePreview(compressed.dataUrl);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Chưa thể xử lý ảnh này.');
    } finally {
      setIsProcessingImage(false);
    }
  };

  const handleSubmit = async () => {
    if (!content.trim() && !imagePreview && !selectedSong) {
      toast.error('Hãy viết cảm nghĩ, thêm ảnh hoặc chọn một bài nhạc');
      return;
    }

    setIsSubmitting(true);
    try {
      // Lấy vị trí
      try {
        const position = await requestFreshGeolocation();
        
        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + 24); // Tồn tại 24h

        const stationData = {
          userId: currentUser.uid,
          userName: currentProfile?.fullName || currentUser.displayName || 'Người dùng',
          userAvatar: currentProfile?.photoURL || currentUser.photoURL || '',
          content: content.trim(),
          imageUrl: imagePreview || selectedSong?.artworkUrl100?.replace('100x100bb', '600x600bb') || '',
          song: selectedSong ? {
            id: String(selectedSong.trackId),
            title: selectedSong.trackName,
            artist: selectedSong.artistName,
            coverUrl: selectedSong.artworkUrl100,
            previewUrl: selectedSong.previewUrl
          } : null,
          location: {
            lat: position.lat,
            lng: position.lng
          },
          createdAt: serverTimestamp(),
          expiresAt: expiresAt
        };

        await safeWrite(
          () => addDoc(collection(db, 'musicStations'), stationData),
          'musicStation'
        );

        toast.success('Đã thả Trạm Cảm Xúc thành công!');
        onClose();
      } catch (err: any) {
        console.error('Error submitting station:', err);
        toast.error(err.message || 'Không thể lấy vị trí của bạn. Vui lòng bật định vị.');
        setIsSubmitting(false);
      }
    } catch (error) {
      console.error('Error submitting station:', error);
      toast.error('Có lỗi xảy ra, vui lòng thử lại');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      
      <div 
        className="relative w-full max-w-md rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        style={{
          background: isDark ? '#1e293b' : '#ffffff',
          color: isDark ? '#f8fafc' : '#0f172a',
        }}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b flex justify-between items-center" style={{ borderColor: isDark ? '#334155' : '#e2e8f0' }}>
          <h2 className="font-semibold text-lg flex items-center gap-2">
            <Music className="w-5 h-5 text-purple-500" />
            Trạm Cảm Xúc
          </h2>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto flex-1 custom-scrollbar space-y-5">
          
          {/* Cảm xúc / Quote */}
          <div>
            <label className="block text-sm font-medium mb-2 opacity-80">Cảm nghĩ tại đây...</label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              maxLength={280}
              placeholder="VD: Chiều T6 ở công ty. Mai là được nghỉ cuối tuần rồi..."
              className="w-full px-4 py-3 rounded-xl border focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none transition-all resize-none h-28"
              style={{
                background: isDark ? '#0f172a' : '#f8fafc',
                borderColor: isDark ? '#334155' : '#e2e8f0',
                color: isDark ? '#f8fafc' : '#0f172a',
              }}
            />
            <p className="mt-1 text-right text-[11px] opacity-50">{content.length}/280</p>
          </div>

          {/* Ảnh tại vị trí */}
          <div>
            <div className="mb-2 flex items-center justify-between gap-3">
              <label className="text-sm font-medium opacity-80">Ảnh tại đây (tùy chọn)</label>
              {imagePreview && <button type="button" onClick={() => setImagePreview('')} className="text-xs font-semibold text-red-500">Bỏ ảnh</button>}
            </div>
            <ImageSourcePicker
              title="Ảnh cho Trạm Cảm Xúc"
              disabled={isProcessingImage}
              onFilesSelected={(files) => handleImageSelected(files[0])}
            >
              {(openPicker) => (
                <button
                  type="button"
                  disabled={isProcessingImage}
                  onClick={openPicker}
                  className="relative flex min-h-24 w-full items-center justify-center overflow-hidden rounded-xl border border-dashed transition hover:border-purple-500 disabled:opacity-60"
                  style={{ borderColor: isDark ? '#475569' : '#cbd5e1', background: isDark ? '#0f172a' : '#f8fafc' }}
                >
                  {imagePreview ? (
                    <img src={imagePreview} alt="Ảnh sẽ đăng" className="max-h-52 w-full object-cover" />
                  ) : (
                    <span className="flex flex-col items-center gap-2 py-5 text-xs font-semibold opacity-70">
                      {isProcessingImage ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImageIcon className="h-5 w-5" />}
                      {isProcessingImage ? 'Đang làm nhẹ ảnh…' : 'Chạm để chọn hoặc chụp ảnh'}
                    </span>
                  )}
                </button>
              )}
            </ImageSourcePicker>
          </div>

          {/* Tìm nhạc */}
          <div>
            <label className="block text-sm font-medium mb-2 opacity-80">Đính kèm nhạc (Tùy chọn)</label>
            
            {selectedSong ? (
              <div 
                className="flex items-center gap-3 p-3 rounded-xl border"
                style={{ borderColor: isDark ? '#334155' : '#e2e8f0', background: isDark ? '#0f172a' : '#f8fafc' }}
              >
                <img src={selectedSong.artworkUrl100} alt="Cover" className="w-12 h-12 rounded-lg object-cover" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{selectedSong.trackName}</p>
                  <p className="text-xs opacity-70 truncate">{selectedSong.artistName}</p>
                </div>
                <button 
                  onClick={() => setSelectedSong(null)}
                  className="p-1.5 rounded-full hover:bg-red-500/10 text-red-500 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 opacity-50" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Tìm tên bài hát..."
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl border focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none transition-all"
                  style={{
                    background: isDark ? '#0f172a' : '#f8fafc',
                    borderColor: isDark ? '#334155' : '#e2e8f0',
                    color: isDark ? '#f8fafc' : '#0f172a',
                  }}
                />
                {isSearching && (
                  <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-purple-500" />
                )}
              </div>
            )}

            {/* Kết quả tìm kiếm */}
            {!selectedSong && searchResults.length > 0 && (
              <div 
                className="mt-2 border rounded-xl overflow-hidden max-h-48 overflow-y-auto custom-scrollbar"
                style={{ borderColor: isDark ? '#334155' : '#e2e8f0' }}
              >
                {searchResults.map((song) => (
                  <button
                    key={song.trackId}
                    onClick={() => setSelectedSong(song)}
                    className="w-full flex items-center gap-3 p-2.5 hover:bg-purple-500/10 transition-colors text-left border-b last:border-0"
                    style={{ borderColor: isDark ? '#334155' : '#e2e8f0' }}
                  >
                    <img src={song.artworkUrl100} alt="Cover" className="w-10 h-10 rounded-md object-cover" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{song.trackName}</p>
                      <p className="text-xs opacity-70 truncate">{song.artistName}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t" style={{ borderColor: isDark ? '#334155' : '#e2e8f0' }}>
          <button
            onClick={handleSubmit}
            disabled={isSubmitting || isProcessingImage || (!content.trim() && !imagePreview && !selectedSong)}
            className="w-full py-3 rounded-xl font-semibold text-white bg-gradient-to-r from-purple-600 to-indigo-600 hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <MapPin className="w-5 h-5" />}
            Ghim tại vị trí này
          </button>
        </div>
      </div>
    </div>
  );
};
