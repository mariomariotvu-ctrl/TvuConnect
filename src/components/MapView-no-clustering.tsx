import React, { useState, useEffect, useMemo } from 'react';
import { User } from 'firebase/auth';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import { Icon } from 'leaflet';
import { Place, CheckIn, PlaceEvent } from '../types';
import { db, collection, query, where, onSnapshot, orderBy, limit } from '../firebase';
import { MapPin, Users, Calendar, Bot } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { PlaceList } from './PlaceList';
import { AIAssistant } from './AIAssistant';
import { CheckInModal } from './CheckInModal';
import { CreateEventModal } from './CreateEventModal';
import 'leaflet/dist/leaflet.css';

// Fix Leaflet default icon issue
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';
import iconRetina from 'leaflet/dist/images/marker-icon-2x.png';

const DefaultIcon = new Icon({
  iconUrl: icon,
  iconRetinaUrl: iconRetina,
  shadowUrl: iconShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

Icon.Default.mergeOptions({
  iconUrl: icon,
  iconRetinaUrl: iconRetina,
  shadowUrl: iconShadow,
});

interface MapViewProps {
  currentUser: User;
  onProfileClick?: (uid: string) => void;
}

type TabMode = 'map' | 'list' | 'ai';

// TVU Campus coordinates
const TVU_CENTER: [number, number] = [9.9345, 106.3461];

/**
 * MapView - PHIÊN BẢN KHÔNG CLUSTERING
 * 
 * Dùng file này nếu không muốn cài react-leaflet-cluster
 * Đổi tên thành MapView.tsx để sử dụng
 */
export const MapView: React.FC<MapViewProps> = ({ currentUser, onProfileClick }) => {
  const { theme } = useTheme();
  const [activeTab, setActiveTab] = useState<TabMode>('map');
  const [places, setPlaces] = useState<Place[]>([]);
  const [shouldLoadMap, setShouldLoadMap] = useState(false);

  const getRating = (place: Place): number => {
    if (typeof place.rating === 'number') return place.rating;
    if (typeof place.rating === 'string') return parseFloat(place.rating) || 0;
    return 0;
  };

  const [checkIns, setCheckIns] = useState<CheckIn[]>([]);
  const [events, setEvents] = useState<PlaceEvent[]>([]);
  const [selectedPlace, setSelectedPlace] = useState<Place | null>(null);
  const [showCheckInModal, setShowCheckInModal] = useState(false);
  const [showEventModal, setShowEventModal] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const handleTabChange = (tab: TabMode) => {
    setActiveTab(tab);
    
    if (tab === 'map' && !shouldLoadMap) {
      setTimeout(() => setShouldLoadMap(true), 100);
    }
    
    setTimeout(() => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      const mainContent = document.querySelector('.main-content');
      if (mainContent) {
        mainContent.scrollTop = 0;
      }
    }, 0);
  };

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [activeTab]);

  // Load places
  useEffect(() => {
    const q = query(
      collection(db, 'places'),
      limit(200)
    );

    const unsubscribe = onSnapshot(q, 
      (snapshot) => {
        const placesData = snapshot.docs.map(doc => {
          const data = doc.data();
          
          const normalized: any = {
            id: doc.id,
            name: data.name || data.tên || data['tên'] || 'Chưa có tên',
            category: data.category || data.loại || data['loại'] || 'other',
            rating: data.rating || data['xếp hạng'] || data.xếp_hạng || 0,
            opening_hours: data.opening_hours || data['giờ mở cửa'] || data.giờ_mở_cửa,
            priceRange: data.priceRange || data['phạm vi giá'] || data.phạm_vi_giá || data.price_range,
            description: data.description || data['Sự miêu tả'] || data.Sự_miêu_tả,
            reviewCount: data.reviewCount || 0,
            checkInCount: data.checkInCount || 0,
            currentVisitors: data.currentVisitors || 0,
            createdBy: data.createdBy || '',
            createdAt: data.createdAt,
            updatedAt: data.updatedAt
          };
          
          let locationData: any = null;
          
          if (data.location && typeof data.location === 'object') {
            const lat = data.location.lat || data.location['vĩ độ'] || data.location.vĩ_độ;
            const lng = data.location.lng;
            const address = data.location.address || data.location['Địa chỉ'] || data.location.Địa_chỉ || data['Địa chỉ'] || '';
            
            if (typeof lat === 'number' && typeof lng === 'number') {
              locationData = { lat, lng, address };
            }
          }
          
          if (!locationData) {
            const lat = data['vĩ độ'] || data.vĩ_độ || data.lat;
            const lng = data.lng;
            const address = data['Địa chỉ'] || data.Địa_chỉ || data.address || '';
            
            if (typeof lat === 'number' && typeof lng === 'number') {
              locationData = { lat, lng, address };
            }
          }
          
          normalized.location = locationData;
          
          return normalized;
        }) as Place[];
        
        setPlaces(placesData);
        setIsLoading(false);
        setError(null);
      },
      (error) => {
        console.error('Error loading places:', error);
        let errorMessage = 'Không thể tải danh sách địa điểm';
        if (error.code === 'permission-denied') {
          errorMessage = 'Lỗi quyền truy cập. Vui lòng deploy Firestore rules.';
        } else if (error.code === 'unavailable') {
          errorMessage = 'Không thể kết nối đến Firestore. Kiểm tra internet.';
        }
        
        setError(errorMessage);
        setIsLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  // Load check-ins
  useEffect(() => {
    const now = new Date();
    const q = query(
      collection(db, 'checkIns'),
      where('expiresAt', '>', now),
      orderBy('expiresAt', 'desc'),
      limit(100)
    );

    const unsubscribe = onSnapshot(q, 
      (snapshot) => {
        const checkInsData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as CheckIn[];
        
        setCheckIns(checkInsData);
      },
      (error) => {
        console.error('Error loading check-ins:', error);
      }
    );

    return () => unsubscribe();
  }, []);

  // Load events
  useEffect(() => {
    const now = new Date();
    const q = query(
      collection(db, 'events'),
      where('startTime', '>', now),
      where('isPublic', '==', true),
      orderBy('startTime', 'asc'),
      limit(20)
    );

    const unsubscribe = onSnapshot(q, 
      (snapshot) => {
        const eventsData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as PlaceEvent[];
        
        setEvents(eventsData);
      },
      (error) => {
        console.error('Error loading events:', error);
      }
    );

    return () => unsubscribe();
  }, []);

  const validPlaces = useMemo(() => 
    places.filter(p => p.location?.lat && p.location?.lng),
    [places]
  );

  const getPlaceVisitors = (placeId: string) => {
    return checkIns.filter(c => c.placeId === placeId);
  };

  // Custom marker icon
  const getCategoryIcon = (category: string): Icon => {
    const iconColors: { [key: string]: string } = {
      cafe: theme === 'dark' ? '#FFA726' : '#D84315',
      restaurant: theme === 'dark' ? '#EF5350' : '#C62828', 
      vegetarian: theme === 'dark' ? '#66BB6A' : '#2E7D32',
      pharmacy: theme === 'dark' ? '#EF5350' : '#C62828',
      flower: theme === 'dark' ? '#EC407A' : '#AD1457',
      printing: theme === 'dark' ? '#42A5F5' : '#1565C0',
      clothing: theme === 'dark' ? '#AB47BC' : '#6A1B9A',
      shop: theme === 'dark' ? '#FFA726' : '#E65100',
      bookstore: theme === 'dark' ? '#42A5F5' : '#0D47A1',
      library: theme === 'dark' ? '#26C6DA' : '#00838F',
      park: theme === 'dark' ? '#66BB6A' : '#1B5E20',
      study: theme === 'dark' ? '#7E57C2' : '#4527A0',
      sport: theme === 'dark' ? '#FF7043' : '#BF360C',
      other: theme === 'dark' ? '#78909C' : '#455A64'
    };

    const color = iconColors[category] || iconColors.other;
    
    return new Icon({
      iconUrl: `data:image/svg+xml;base64,${btoa(`
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32">
          <defs>
            <filter id="shadow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur in="SourceAlpha" stdDeviation="1.5"/>
              <feOffset dx="0" dy="1" result="offsetblur"/>
              <feComponentTransfer>
                <feFuncA type="linear" slope="0.3"/>
              </feComponentTransfer>
              <feMerge>
                <feMergeNode/>
                <feMergeNode in="SourceGraphic"/>
              </feMerge>
            </filter>
            <radialGradient id="grad" cx="50%" cy="40%">
              <stop offset="0%" style="stop-color:${color};stop-opacity:1" />
              <stop offset="100%" style="stop-color:${color};stop-opacity:0.85" />
            </radialGradient>
          </defs>
          <g filter="url(#shadow)">
            <path d="M16 4 C10 4 6 8 6 13 C6 20 16 28 16 28 S26 20 26 13 C26 8 22 4 16 4 Z" 
                  fill="url(#grad)" stroke="white" stroke-width="1.5"/>
            <circle cx="16" cy="13" r="4" fill="white" opacity="0.9"/>
          </g>
        </svg>
      `)}`,
      iconSize: [32, 32],
      iconAnchor: [16, 32],
      popupAnchor: [0, -32],
      className: 'custom-marker-icon'
    });
  };

  return (
    <div className="h-[calc(100vh-160px)] md:h-screen flex flex-col">
      {/* Header Tabs */}
      <div 
        className="flex items-center justify-around border-b"
        style={{
          backgroundColor: theme === 'dark' ? 'rgba(31, 41, 55, 0.95)' : '#ffffff',
          borderColor: theme === 'dark' ? '#374151' : '#e5e7eb'
        }}
      >
        <button
          onClick={() => handleTabChange('map')}
          className={`top-tab-item flex-1 flex items-center justify-center gap-2 py-4 font-bold transition-colors text-base ${
            activeTab === 'map'
              ? 'text-indigo-700 dark:text-indigo-400 border-b-2 border-indigo-700 dark:border-indigo-400'
              : 'text-gray-800 dark:text-gray-200 hover:text-gray-900 dark:hover:text-gray-100'
          }`}
        >
          <MapPin className="w-5 h-5" />
          <span>Bản đồ</span>
        </button>

        <button
          onClick={() => handleTabChange('list')}
          className={`top-tab-item flex-1 flex items-center justify-center gap-2 py-4 font-bold transition-colors text-base ${
            activeTab === 'list'
              ? 'text-indigo-700 dark:text-indigo-400 border-b-2 border-indigo-700 dark:border-indigo-400'
              : 'text-gray-800 dark:text-gray-200 hover:text-gray-900 dark:hover:text-gray-100'
          }`}
        >
          <Users className="w-5 h-5" />
          <span>Địa điểm</span>
        </button>

        <button
          onClick={() => handleTabChange('ai')}
          className={`top-tab-item flex-1 flex items-center justify-center gap-2 py-4 font-bold transition-colors text-base ${
            activeTab === 'ai'
              ? 'text-indigo-700 dark:text-indigo-400 border-b-2 border-indigo-700 dark:border-indigo-400'
              : 'text-gray-800 dark:text-gray-200 hover:text-gray-900 dark:hover:text-gray-100'
          }`}
        >
          <Bot className="w-5 h-5" />
          <span>AI Trợ lý</span>
        </button>
      </div>

      {/* Loading/Error/Empty States */}
      {isLoading && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-gray-600 dark:text-gray-400">Đang tải địa điểm...</p>
          </div>
        </div>
      )}

      {error && !isLoading && (
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="text-center max-w-md">
            <div className="w-16 h-16 bg-red-100 dark:bg-red-900/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <MapPin className="w-8 h-8 text-red-600 dark:text-red-400" />
            </div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">
              Không thể tải dữ liệu
            </h3>
            <p className="text-gray-600 dark:text-gray-400 mb-4">{error}</p>
          </div>
        </div>
      )}

      {!isLoading && !error && places.length === 0 && (
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="text-center max-w-md">
            <div className="w-16 h-16 bg-indigo-100 dark:bg-indigo-900/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <MapPin className="w-8 h-8 text-indigo-600 dark:text-indigo-400" />
            </div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">
              Chưa có địa điểm nào
            </h3>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              Hãy thêm một số địa điểm mẫu để bắt đầu khám phá!
            </p>
          </div>
        </div>
      )}

      {/* Content */}
      {!isLoading && !error && (
        <div className="flex-1 overflow-hidden">
          {activeTab === 'map' && (
            <div className="h-full relative">
              {!shouldLoadMap && (
                <div className="h-full w-full flex items-center justify-center bg-gray-100 dark:bg-gray-800">
                  <div className="text-center">
                    <div className="w-16 h-16 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                    <p className="text-gray-600 dark:text-gray-400">Đang tải bản đồ...</p>
                  </div>
                </div>
              )}

              {shouldLoadMap && (
                <MapContainer
                  center={TVU_CENTER}
                  zoom={15}
                  className="h-full w-full"
                  zoomControl={true}
                  preferCanvas={true}
                >
                  <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                    url={theme === 'dark' 
                      ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
                      : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
                    }
                    maxZoom={19}
                    minZoom={13}
                    keepBuffer={2}
                  />

                  {/* NO CLUSTERING - Direct markers */}
                  {validPlaces.map(place => {
                    const visitors = getPlaceVisitors(place.id!);
                    const placeEvents = events.filter(e => e.placeId === place.id);

                    return (
                      <Marker
                        key={place.id}
                        position={[place.location.lat, place.location.lng]}
                        icon={getCategoryIcon(place.category)}
                        eventHandlers={{
                          click: () => setSelectedPlace(place)
                        }}
                      >
                        <Popup>
                          <div className="p-2 min-w-[200px]">
                            <h3 className="font-bold text-lg mb-1">{place.name}</h3>
                            <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                              📍 {place.location?.address || 'Chưa có địa chỉ'}
                            </p>
                            
                            <div className="flex items-center gap-4 text-sm mb-2">
                              <span className="flex items-center gap-1">
                                ⭐ {getRating(place).toFixed(1)}
                              </span>
                              <span className="flex items-center gap-1">
                                <Users className="w-4 h-4" />
                                {visitors.length}
                              </span>
                              {placeEvents.length > 0 && (
                                <span className="flex items-center gap-1">
                                  <Calendar className="w-4 h-4" />
                                  {placeEvents.length}
                                </span>
                              )}
                            </div>

                            <button
                              onClick={() => {
                                setSelectedPlace(place);
                                setShowCheckInModal(true);
                              }}
                              className="w-full mt-2 py-2 bg-indigo-600 text-white text-sm font-bold rounded-lg hover:bg-indigo-700"
                            >
                              Check-in
                            </button>
                          </div>
                        </Popup>
                      </Marker>
                    );
                  })}
                </MapContainer>
              )}

              {/* Floating Action Button */}
              <div className="absolute bottom-6 right-6 flex flex-col gap-3 z-[1000]">
                <button
                  onClick={() => setShowEventModal(true)}
                  className="w-14 h-14 bg-indigo-600 text-white rounded-full shadow-lg hover:bg-indigo-700 flex items-center justify-center"
                  title="Tạo sự kiện"
                >
                  <Calendar className="w-6 h-6" />
                </button>
              </div>
            </div>
          )}

          {activeTab === 'list' && (
            <PlaceList
              places={places}
              checkIns={checkIns}
              events={events}
              currentUser={currentUser}
              onPlaceSelect={setSelectedPlace}
              onCheckIn={(place) => {
                setSelectedPlace(place);
                setShowCheckInModal(true);
              }}
            />
          )}

          {activeTab === 'ai' && (
            <AIAssistant />
          )}
        </div>
      )}

      {/* Modals */}
      {showCheckInModal && selectedPlace && (
        <CheckInModal
          place={selectedPlace}
          currentUser={currentUser}
          onClose={() => {
            setShowCheckInModal(false);
            setSelectedPlace(null);
          }}
        />
      )}

      {showEventModal && (
        <CreateEventModal
          places={places}
          currentUser={currentUser}
          onClose={() => setShowEventModal(false)}
        />
      )}
    </div>
  );
};
