import React from 'react';
import { Place, CheckIn, PlaceEvent } from '../types';
import { MapPin, Star, Calendar, X } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { formatDistance, type Coordinates } from '../utils/locationUtils';

interface PlaceCardProps {
  place: Place & { distance?: number };
  visitors: CheckIn[];
  placeEvents: PlaceEvent[];
  normalizedCategory: string;
  userCheckIn: CheckIn | undefined;
  userLocation?: Coordinates | null;
  isExpanded: boolean;
  categoryLabel: string;
  onPlaceSelect: (place: Place) => void;
  onCheckIn: (place: Place) => void;
  onDeleteCheckIn: (checkInId: string, placeName: string) => void;
  onToggleDescription: (placeId: string) => void;
  onProfileClick?: (uid: string) => void;
  getRating: (place: Place) => number;
  isMobile: boolean;
}

const PlaceCardComponent: React.FC<PlaceCardProps> = ({
  place,
  visitors,
  placeEvents,
  normalizedCategory,
  userCheckIn,
  userLocation,
  isExpanded,
  categoryLabel,
  onPlaceSelect,
  onCheckIn,
  onDeleteCheckIn,
  onToggleDescription,
  onProfileClick,
  getRating,
  isMobile
}) => {
  const { theme } = useTheme();

  // Memoize card styles
  const cardStyles = React.useMemo(() => ({
    backgroundColor: theme === 'dark' ? 'rgba(31, 41, 55, 0.6)' : '#ffffff',
    borderColor: theme === 'dark' ? '#374151' : '#e5e7eb',
    boxShadow: theme === 'dark' 
      ? '0 2px 8px rgba(0, 0, 0, 0.15)'
      : '0 2px 8px rgba(0, 0, 0, 0.1)',
    borderRadius: '12px',
    padding: '15px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '12px'
  }), [theme]);

  return (
    <div
      className={`rounded-xl border cursor-pointer relative ${isMobile ? '' : 'transition-all duration-200 hover:-translate-y-1'}`}
      style={cardStyles}
      onClick={() => onPlaceSelect(place)}
    >
      {/* Distance Badge - HIDDEN */}
      {false && place.distance !== undefined && userLocation && (
        <div 
          className="absolute top-3 right-3 px-2.5 py-1 rounded-full backdrop-blur-md shadow-md"
          style={{
            background: theme === 'dark' 
              ? 'linear-gradient(135deg, rgba(139, 92, 246, 0.9) 0%, rgba(6, 182, 212, 0.9) 100%)' 
              : 'linear-gradient(135deg, rgba(147, 51, 234, 0.9) 0%, rgba(14, 165, 233, 0.9) 100%)',
            border: theme === 'dark' 
              ? '1px solid rgba(196, 181, 253, 0.4)' 
              : '1px solid rgba(224, 231, 255, 0.5)'
          }}
        >
          <span className="text-white text-xs font-bold drop-shadow-md">
            📍 {formatDistance(place.distance)}
          </span>
        </div>
      )}

      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex-1 pr-16">
          <h3 
            className="font-bold text-lg mb-1"
            style={{ color: theme === 'dark' ? '#ffffff' : '#1F2937' }}
          >
            {place.name || 'Bếp Chay Nhà Ruma'}
          </h3>
          <p 
            className="text-sm flex items-center gap-1 mt-1"
            style={{ 
              color: theme === 'dark' ? '#D1D5DB' : '#374151',
              fontWeight: 600
            }}
          >
            <MapPin className="w-3 h-3" />
            {place.location?.address || 'Chưa có địa chỉ'}
          </p>
        </div>
        <span className="text-2xl">{categoryLabel?.split(' ')[0] || '📍'}</span>
      </div>

      {/* Stats */}
      <div className="flex items-center gap-2 flex-wrap">
        {getRating(place) > 0 && (
          <div className="place-badge place-badge-rating inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
            <Star className="w-3.5 h-3.5 fill-amber-500 text-amber-500" />
            <span className="text-xs font-bold text-amber-700 dark:text-amber-400">
              {getRating(place).toFixed(1)}
            </span>
          </div>
        )}

        {(place.openHours || (place as any).opening_hours) && (
          <div 
            className="place-badge place-badge-hours inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border"
            style={{
              background: theme === 'dark'
                ? 'linear-gradient(135deg, rgba(139, 92, 246, 0.2) 0%, rgba(6, 182, 212, 0.2) 100%)'
                : 'linear-gradient(135deg, rgba(147, 51, 234, 0.1) 0%, rgba(14, 165, 233, 0.1) 100%)',
              borderColor: theme === 'dark' ? 'rgba(139, 92, 246, 0.3)' : 'rgba(147, 51, 234, 0.3)'
            }}
          >
            <span className="text-sm leading-none">🕐</span>
            <span 
              className="text-xs font-bold"
              style={{
                background: theme === 'dark'
                  ? 'linear-gradient(135deg, #A78BFA 0%, #22D3EE 100%)'
                  : 'linear-gradient(135deg, #9333EA 0%, #0EA5E9 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text'
              }}
            >
              {place.openHours || (place as any).opening_hours}
            </span>
          </div>
        )}

        {(place.priceRange || (place as any).price_range) && (
          <div className="place-badge place-badge-price inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
            <span className="text-sm leading-none">💰</span>
            <span className="text-xs font-bold text-blue-700 dark:text-blue-400">
              {place.priceRange || (place as any).price_range}
            </span>
          </div>
        )}
      </div>

      {/* Events Badge */}
      {placeEvents.length > 0 && (
        <div className="mt-2">
          <div className="place-badge place-badge-events inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800">
            <Calendar className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
            <span className="text-xs font-bold text-purple-700 dark:text-purple-400">
              {placeEvents.length} sự kiện
            </span>
          </div>
        </div>
      )}

      {/* Description */}
      {place.description && (
        <div>
          <p 
            className={`text-sm ${isExpanded ? '' : 'line-clamp-2'}`}
            style={{ 
              color: theme === 'dark' ? '#D1D5DB' : '#374151',
              lineHeight: '1.5',
              fontWeight: 600,
              display: isExpanded ? 'block' : '-webkit-box',
              WebkitLineClamp: isExpanded ? 'unset' : 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden'
            }}
          >
            {place.description}
          </p>
          {place.description.length > 100 && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggleDescription(place.id!);
              }}
              className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline mt-1"
            >
              {isExpanded ? 'Thu gọn' : 'Xem thêm'}
            </button>
          )}
        </div>
      )}

      {/* Visitors Preview */}
      {visitors.length > 0 && (
        <div className="p-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
          <p className="text-xs font-bold text-blue-700 dark:text-blue-300 mb-1">
            Đang ở đây:
          </p>
          <div className="flex flex-wrap gap-1">
            {visitors.slice(0, 5).map(visitor => (
              <button
                key={visitor.id}
                onClick={(e) => {
                  e.stopPropagation();
                  if (onProfileClick && visitor.userId) {
                    onProfileClick(visitor.userId);
                  }
                }}
                className="text-xs bg-white dark:bg-gray-700 px-2 py-0.5 rounded-full hover:opacity-80 transition-opacity"
              >
                {visitor.userName}
                {visitor.statusText && ` • ${visitor.statusText}`}
              </button>
            ))}
            {visitors.length > 5 && (
              <span className="text-xs text-gray-500">
                +{visitors.length - 5} người khác
              </span>
            )}
          </div>
        </div>
      )}

      {/* Actions */}
      <div 
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '10px',
          marginTop: 'auto'
        }}
      >
        {userCheckIn ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDeleteCheckIn(userCheckIn.id!, place.name);
            }}
            className="py-2.5 bg-red-600 text-white text-sm font-bold rounded-lg hover:bg-red-700 flex items-center justify-center gap-2 transition-colors shadow-sm"
          >
            <X className="w-4 h-4" />
            Xóa check-in
          </button>
        ) : (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onCheckIn(place);
            }}
            className="py-2.5 text-white text-sm font-bold rounded-lg transition-all hover:opacity-90 active:scale-95 shadow-sm"
            style={{
              background: theme === 'dark'
                ? 'linear-gradient(135deg, #8B5CF6 0%, #06B6D4 100%)'
                : 'linear-gradient(135deg, #9333EA 0%, #0EA5E9 100%)'
            }}
          >
            Check-in
          </button>
        )}
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (place.location?.lat && place.location?.lng) {
              let mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${place.location.lat},${place.location.lng}`;
              
              if (userLocation) {
                mapsUrl += `&origin=${userLocation.lat},${userLocation.lng}`;
              }
              
              mapsUrl += '&travelmode=driving';
              
              window.open(mapsUrl, '_blank');
            }
          }}
          disabled={!place.location?.lat || !place.location?.lng}
          className={`py-2.5 text-sm font-bold rounded-lg transition-all shadow-sm ${
            place.location?.lat && place.location?.lng
              ? 'text-white hover:opacity-90 active:scale-95'
              : 'bg-gray-200 dark:bg-gray-800 text-gray-400 cursor-not-allowed'
          }`}
          style={place.location?.lat && place.location?.lng ? {
            background: theme === 'dark'
              ? 'linear-gradient(135deg, #8B5CF6 0%, #06B6D4 100%)'
              : 'linear-gradient(135deg, #9333EA 0%, #0EA5E9 100%)'
          } : undefined}
        >
          Chỉ đường
        </button>
      </div>
    </div>
  );
};

// Custom comparison function - chỉ re-render khi các props quan trọng thay đổi
const arePropsEqual = (
  prevProps: PlaceCardProps,
  nextProps: PlaceCardProps
): boolean => {
  // So sánh các props quan trọng
  return (
    prevProps.place.id === nextProps.place.id &&
    prevProps.place.checkInCount === nextProps.place.checkInCount &&
    prevProps.place.currentVisitors === nextProps.place.currentVisitors &&
    prevProps.visitors.length === nextProps.visitors.length &&
    prevProps.placeEvents.length === nextProps.placeEvents.length &&
    prevProps.isExpanded === nextProps.isExpanded &&
    prevProps.userCheckIn?.id === nextProps.userCheckIn?.id
  );
};

// Export memoized component
export const PlaceCard = React.memo(PlaceCardComponent, arePropsEqual);
