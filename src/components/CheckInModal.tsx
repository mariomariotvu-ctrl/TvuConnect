import React, { useState } from 'react';
import { User } from 'firebase/auth';
import { Place, CheckIn } from '../types';
import { db, collection, addDoc, serverTimestamp } from '../firebase';
import { X, MapPin, Clock, Eye, EyeOff, Users } from 'lucide-react';
import { toast } from 'sonner';
import { useTheme } from '../contexts/ThemeContext';
import { safeWrite } from '../utils/quotaManager';

interface CheckInModalProps {
  place: Place;
  currentUser: User;
  onClose: () => void;
}

type CheckInStatus = 'studying' | 'working' | 'hanging_out' | 'waiting' | 'available';

const STATUS_OPTIONS: { value: CheckInStatus; label: string; emoji: string }[] = [
  { value: 'studying', label: 'Đang học bài', emoji: '📚' },
  { value: 'working', label: 'Đang làm việc', emoji: '💼' },
  { value: 'hanging_out', label: 'Đang chơi', emoji: '🎉' },
  { value: 'waiting', label: 'Đang chờ bạn', emoji: '⏰' },
  { value: 'available', label: 'Rảnh, muốn gặp người mới', emoji: '👋' }
];

export const CheckInModal: React.FC<CheckInModalProps> = ({ place, currentUser, onClose }) => {
  const { theme } = useTheme();
  const [status, setStatus] = useState<CheckInStatus>('hanging_out');
  const [statusText, setStatusText] = useState('');
  const [visibility, setVisibility] = useState<'public' | 'friends' | 'private'>('public');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleCheckIn = async () => {
    if (isSubmitting) return;

    setIsSubmitting(true);
    try {
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 4); // Expire after 4 hours

      const checkInData: Omit<CheckIn, 'id'> = {
        userId: currentUser.uid,
        userName: currentUser.displayName || 'Người dùng',
        userAvatar: currentUser.photoURL || '',
        placeId: place.id!,
        placeName: place.name,
        status,
        statusText: statusText.trim() || undefined,
        visibility,
        createdAt: serverTimestamp() as any,
        expiresAt: expiresAt as any
      };

      await safeWrite(
        () => addDoc(collection(db, 'checkIns'), checkInData),
        'checkIn'
      );

      toast.success(`Đã check-in tại ${place.name}!`);
      onClose();
    } catch (error) {
      console.error('Error checking in:', error);
      toast.error('Không thể check-in. Vui lòng thử lại.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[2000] p-4">
      <div
        className="w-full max-w-md rounded-2xl shadow-xl max-h-[90vh] overflow-y-auto"
        style={{
          backgroundColor: theme === 'dark' ? 'rgba(31, 41, 55, 0.98)' : '#ffffff'
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b" style={{
          borderColor: theme === 'dark' ? '#374151' : '#e5e7eb'
        }}>
          <h2 
            className="text-xl font-bold"
            style={{ color: theme === 'dark' ? '#ffffff' : '#000000' }}
          >
            Check-in
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {/* Place Info */}
          <div className="place-info-box p-3 bg-indigo-50 dark:bg-indigo-900/20 rounded-xl">
            <div className="flex items-center gap-2 mb-1">
              <MapPin className="w-5 h-5 text-indigo-600" />
              <h3 className="place-name font-bold text-indigo-900 dark:text-indigo-300">
                {place.name}
              </h3>
            </div>
            <p className="place-address text-sm text-indigo-700 dark:text-indigo-400">
              {place.location?.address || 'Chưa có địa chỉ'}
            </p>
          </div>

          {/* Status Selection */}
          <div>
            <label className="block text-sm font-bold mb-2" style={{
              color: theme === 'dark' ? '#ffffff' : '#000000'
            }}>
              Bạn đang làm gì?
            </label>
            <div className="grid grid-cols-1 gap-2">
              {STATUS_OPTIONS.map(option => (
                <button
                  key={option.value}
                  onClick={() => setStatus(option.value)}
                  className={`status-option p-3 rounded-xl text-left transition-all ${
                    status === option.value
                      ? 'active bg-indigo-600 text-white'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                  }`}
                >
                  <span className="text-xl mr-2">{option.emoji}</span>
                  <span className="font-bold">{option.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Custom Status Text */}
          <div>
            <label className="block text-sm font-bold mb-2" style={{
              color: theme === 'dark' ? '#ffffff' : '#000000'
            }}>
              Ghi chú (tùy chọn)
            </label>
            <input
              type="text"
              value={statusText}
              onChange={(e) => setStatusText(e.target.value)}
              placeholder="VD: Đang học nhóm môn AI..."
              maxLength={100}
              className="w-full px-4 py-3 rounded-xl border focus:outline-none focus:ring-2 focus:ring-indigo-500"
              style={{
                backgroundColor: theme === 'dark' ? 'rgba(55, 65, 81, 0.5)' : '#f9fafb',
                borderColor: theme === 'dark' ? '#374151' : '#e5e7eb',
                color: theme === 'dark' ? '#ffffff' : '#000000'
              }}
            />
            <p className="text-xs text-gray-500 mt-1">
              {statusText.length}/100 ký tự
            </p>
          </div>

          {/* Visibility */}
          <div>
            <label className="block text-sm font-bold mb-2" style={{
              color: theme === 'dark' ? '#ffffff' : '#000000'
            }}>
              Ai có thể thấy?
            </label>
            <div className="space-y-2">
              <button
                onClick={() => setVisibility('public')}
                className={`visibility-option w-full p-3 rounded-xl text-left flex items-center gap-3 transition-all ${
                  visibility === 'public'
                    ? 'active bg-indigo-600 text-white'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                }`}
              >
                <Users className="w-5 h-5" />
                <div>
                  <p className="font-bold">Công khai</p>
                  <p className="text-xs opacity-80">Mọi người đều thấy</p>
                </div>
              </button>

              <button
                onClick={() => setVisibility('friends')}
                className={`visibility-option w-full p-3 rounded-xl text-left flex items-center gap-3 transition-all ${
                  visibility === 'friends'
                    ? 'active bg-indigo-600 text-white'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                }`}
              >
                <Eye className="w-5 h-5" />
                <div>
                  <p className="font-bold">Bạn bè</p>
                  <p className="text-xs opacity-80">Chỉ bạn bè/matches thấy</p>
                </div>
              </button>

              <button
                onClick={() => setVisibility('private')}
                className={`visibility-option w-full p-3 rounded-xl text-left flex items-center gap-3 transition-all ${
                  visibility === 'private'
                    ? 'active bg-indigo-600 text-white'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                }`}
              >
                <EyeOff className="w-5 h-5" />
                <div>
                  <p className="font-bold">Riêng tư</p>
                  <p className="text-xs opacity-80">Chỉ mình bạn thấy</p>
                </div>
              </button>
            </div>
          </div>

          {/* Duration Info */}
          <div className="expiry-notice p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-xl flex items-start gap-2">
            <Clock className="w-5 h-5 text-yellow-600 dark:text-yellow-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-yellow-900 dark:text-yellow-300">
                Check-in tự động hết hạn sau 4 giờ
              </p>
              <p className="text-xs text-yellow-700 dark:text-yellow-400 mt-1">
                Bạn có thể check-in lại bất cứ lúc nào
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t flex gap-3" style={{
          borderColor: theme === 'dark' ? '#374151' : '#e5e7eb'
        }}>
          <button
            onClick={onClose}
            className="cancel-button flex-1 py-3 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 font-bold rounded-xl hover:bg-gray-200 dark:hover:bg-gray-600"
          >
            Hủy
          </button>
          <button
            onClick={handleCheckIn}
            disabled={isSubmitting}
            className="flex-1 py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? 'Đang check-in...' : 'Check-in ngay'}
          </button>
        </div>
      </div>
    </div>
  );
};
