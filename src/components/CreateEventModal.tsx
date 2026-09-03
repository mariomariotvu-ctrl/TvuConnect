import React, { useState } from 'react';
import { User } from 'firebase/auth';
import { Place, PlaceEvent } from '../types';
import { db, collection, addDoc, serverTimestamp } from '../firebase';
import { X, MapPin, Calendar, Users, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { useTheme } from '../contexts/ThemeContext';
import { safeWrite } from '../utils/quotaManager';

interface CreateEventModalProps {
  places: Place[];
  currentUser: User;
  onClose: () => void;
}

export const CreateEventModal: React.FC<CreateEventModalProps> = ({
  places,
  currentUser,
  onClose
}) => {
  const { theme } = useTheme();
  const [selectedPlace, setSelectedPlace] = useState<Place | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [startDate, setStartDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [maxParticipants, setMaxParticipants] = useState('');
  const [category, setCategory] = useState('social');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!selectedPlace || !title || !startDate || !startTime || !endTime) {
      toast.error('Vui lòng điền đầy đủ thông tin');
      return;
    }

    if (isSubmitting) return;

    setIsSubmitting(true);
    try {
      const startDateTime = new Date(`${startDate}T${startTime}`);
      const endDateTime = new Date(`${startDate}T${endTime}`);

      if (endDateTime <= startDateTime) {
        toast.error('Thời gian kết thúc phải sau thời gian bắt đầu');
        setIsSubmitting(false);
        return;
      }

      const eventData: Omit<PlaceEvent, 'id'> = {
        placeId: selectedPlace.id!,
        placeName: selectedPlace.name,
        placeLocation: selectedPlace.location,
        title: title.trim(),
        description: description.trim(),
        hostId: currentUser.uid,
        hostName: currentUser.displayName || 'Người dùng',
        hostAvatar: currentUser.photoURL || '',
        startTime: startDateTime as any,
        endTime: endDateTime as any,
        maxParticipants: maxParticipants ? parseInt(maxParticipants) : undefined,
        participants: [currentUser.uid],
        category,
        isPublic: true,
        createdAt: serverTimestamp() as any,
        updatedAt: serverTimestamp() as any
      };

      await safeWrite(
        () => addDoc(collection(db, 'events'), eventData),
        'createEvent'
      );

      toast.success('Đã tạo sự kiện thành công!');
      onClose();
    } catch (error) {
      console.error('Error creating event:', error);
      toast.error('Không thể tạo sự kiện. Vui lòng thử lại.');
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
            Tạo sự kiện
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
          {/* Place Selection */}
          <div>
            <label className="block text-sm font-bold mb-2" style={{
              color: theme === 'dark' ? '#ffffff' : '#000000'
            }}>
              Địa điểm <span className="text-red-500">*</span>
            </label>
            <select
              value={selectedPlace?.id || ''}
              onChange={(e) => {
                const place = places.find(p => p.id === e.target.value);
                setSelectedPlace(place || null);
              }}
              className="w-full px-4 py-3 rounded-xl border focus:outline-none focus:ring-2 focus:ring-indigo-500"
              style={{
                backgroundColor: theme === 'dark' ? 'rgba(55, 65, 81, 0.5)' : '#f9fafb',
                borderColor: theme === 'dark' ? '#374151' : '#e5e7eb',
                color: theme === 'dark' ? '#ffffff' : '#000000'
              }}
            >
              <option value="">Chọn địa điểm...</option>
              {places.map(place => (
                <option key={place.id} value={place.id}>
                  {place.name} - {place.location?.address || 'Chưa có địa chỉ'}
                </option>
              ))}
            </select>
          </div>

          {/* Title */}
          <div>
            <label className="block text-sm font-bold mb-2" style={{
              color: theme === 'dark' ? '#ffffff' : '#000000'
            }}>
              Tên sự kiện <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="VD: Code cùng nhau - React"
              maxLength={100}
              className="w-full px-4 py-3 rounded-xl border focus:outline-none focus:ring-2 focus:ring-indigo-500"
              style={{
                backgroundColor: theme === 'dark' ? 'rgba(55, 65, 81, 0.5)' : '#f9fafb',
                borderColor: theme === 'dark' ? '#374151' : '#e5e7eb',
                color: theme === 'dark' ? '#ffffff' : '#000000'
              }}
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-bold mb-2" style={{
              color: theme === 'dark' ? '#ffffff' : '#000000'
            }}>
              Mô tả
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Mô tả chi tiết về sự kiện..."
              rows={3}
              maxLength={500}
              className="w-full px-4 py-3 rounded-xl border focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
              style={{
                backgroundColor: theme === 'dark' ? 'rgba(55, 65, 81, 0.5)' : '#f9fafb',
                borderColor: theme === 'dark' ? '#374151' : '#e5e7eb',
                color: theme === 'dark' ? '#ffffff' : '#000000'
              }}
            />
          </div>

          {/* Date & Time */}
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block text-sm font-bold mb-2" style={{
                color: theme === 'dark' ? '#ffffff' : '#000000'
              }}>
                Ngày <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                min={new Date().toISOString().split('T')[0]}
                className="w-full px-4 py-3 rounded-xl border focus:outline-none focus:ring-2 focus:ring-indigo-500"
                style={{
                  backgroundColor: theme === 'dark' ? 'rgba(55, 65, 81, 0.5)' : '#f9fafb',
                  borderColor: theme === 'dark' ? '#374151' : '#e5e7eb',
                  color: theme === 'dark' ? '#ffffff' : '#000000'
                }}
              />
            </div>

            <div>
              <label className="block text-sm font-bold mb-2" style={{
                color: theme === 'dark' ? '#ffffff' : '#000000'
              }}>
                Bắt đầu <span className="text-red-500">*</span>
              </label>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border focus:outline-none focus:ring-2 focus:ring-indigo-500"
                style={{
                  backgroundColor: theme === 'dark' ? 'rgba(55, 65, 81, 0.5)' : '#f9fafb',
                  borderColor: theme === 'dark' ? '#374151' : '#e5e7eb',
                  color: theme === 'dark' ? '#ffffff' : '#000000'
                }}
              />
            </div>

            <div>
              <label className="block text-sm font-bold mb-2" style={{
                color: theme === 'dark' ? '#ffffff' : '#000000'
              }}>
                Kết thúc <span className="text-red-500">*</span>
              </label>
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border focus:outline-none focus:ring-2 focus:ring-indigo-500"
                style={{
                  backgroundColor: theme === 'dark' ? 'rgba(55, 65, 81, 0.5)' : '#f9fafb',
                  borderColor: theme === 'dark' ? '#374151' : '#e5e7eb',
                  color: theme === 'dark' ? '#ffffff' : '#000000'
                }}
              />
            </div>
          </div>

          {/* Max Participants */}
          <div>
            <label className="block text-sm font-bold mb-2" style={{
              color: theme === 'dark' ? '#ffffff' : '#000000'
            }}>
              Số người tối đa (tùy chọn)
            </label>
            <input
              type="number"
              value={maxParticipants}
              onChange={(e) => setMaxParticipants(e.target.value)}
              placeholder="Không giới hạn"
              min="2"
              max="100"
              className="w-full px-4 py-3 rounded-xl border focus:outline-none focus:ring-2 focus:ring-indigo-500"
              style={{
                backgroundColor: theme === 'dark' ? 'rgba(55, 65, 81, 0.5)' : '#f9fafb',
                borderColor: theme === 'dark' ? '#374151' : '#e5e7eb',
                color: theme === 'dark' ? '#ffffff' : '#000000'
              }}
            />
          </div>

          {/* Category */}
          <div>
            <label className="block text-sm font-bold mb-2" style={{
              color: theme === 'dark' ? '#ffffff' : '#000000'
            }}>
              Loại sự kiện
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border focus:outline-none focus:ring-2 focus:ring-indigo-500"
              style={{
                backgroundColor: theme === 'dark' ? 'rgba(55, 65, 81, 0.5)' : '#f9fafb',
                borderColor: theme === 'dark' ? '#374151' : '#e5e7eb',
                color: theme === 'dark' ? '#ffffff' : '#000000'
              }}
            >
              <option value="study">📚 Học tập</option>
              <option value="sports">⚽ Thể thao</option>
              <option value="social">🎉 Giao lưu</option>
              <option value="food">🍜 Ăn uống</option>
              <option value="other">📍 Khác</option>
            </select>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t flex gap-3" style={{
          borderColor: theme === 'dark' ? '#374151' : '#e5e7eb'
        }}>
          <button
            onClick={onClose}
            className="flex-1 py-3 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 font-bold rounded-xl hover:bg-gray-200 dark:hover:bg-gray-600"
          >
            Hủy
          </button>
          <button
            onClick={handleSubmit}
            disabled={isSubmitting || !selectedPlace || !title || !startDate || !startTime || !endTime}
            className="flex-1 py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? 'Đang tạo...' : 'Tạo sự kiện'}
          </button>
        </div>
      </div>
    </div>
  );
};
