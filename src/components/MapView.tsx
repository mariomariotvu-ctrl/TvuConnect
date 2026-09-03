import React, { useState, useEffect, useMemo, Suspense } from 'react';
import { User } from 'firebase/auth';
import { MapContainer, TileLayer, Marker, Popup, useMapEvents } from 'react-leaflet';
import { Icon, LatLngBounds } from 'leaflet';
import { Place, CheckIn, PlaceEvent } from '../types';
import { db, collection, query, where, onSnapshot, orderBy, limit } from '../firebase';
import { MapPin, Users, Calendar, Bot, Navigation, Home } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { PlaceList } from './PlaceList';
import { RentalList } from './RentalList';
import { LazyAIAssistant } from '../routes/lazyRoutes';
import { CheckInModal } from './CheckInModal';
import { CreateEventModal } from './CreateEventModal';
import { 
  getCategoryLabel,
  Coordinates,
  calculateDistance,
  sortByDistance
} from '../utils/locationUtils';
import { FirestoreQueryOptimizer } from '../utils/firestoreQueryOptimizer';
import { FirestoreCacheManager } from '../utils/firestoreCacheManager';
import { listenerRegistry } from '../utils/listenerRegistry';
import { QUERY_LIMITS, getQueryLimit } from '../config/queryLimits';
import { queryPlacesInBounds } from '../utils/mapUtils';
import { toast } from 'sonner';
import 'leaflet/dist/leaflet.css';

// Fix Leaflet default icon issue
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';
import iconRetina from 'leaflet/dist/images/marker-icon-2x.png';
import { logger } from '@/utils/logger';

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

type TabMode = 'map' | 'list' | 'ai' | 'rental';

// TVU Campus coordinates
const TVU_CENTER: [number, number] = [9.9345, 106.3461];

const BoundsTracker: React.FC<{ onBoundsChange: (bounds: LatLngBounds) => void }> = ({ onBoundsChange }) => {
  const map = useMapEvents({
    moveend: () => {
      onBoundsChange(map.getBounds());
    }
  });
  useEffect(() => {
    onBoundsChange(map.getBounds());
  }, [map, onBoundsChange]);
  return null;
};

// Task 7.1 — PlaceInfoBottomSheet component
// Bug_Condition: activeTab = 'map' AND isMobile = true AND selectedPlace != null AND panel overlaps map
// Expected_Behavior: Place info trong bottom sheet riêng, bản đồ vẫn tương tác được phía sau
const PlaceInfoBottomSheet: React.FC<{ place: Place; onClose: () => void }> = ({ place, onClose }) => {
  const { theme } = useTheme();
  const [panelHeight, setPanelHeight] = useState<'peek' | 'half' | 'full'>('peek');
  const heights = { peek: '15%', half: '50%', full: '90%' };

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-[1000] transition-all duration-300 ease-out"
      style={{
        height: heights[panelHeight],
        borderRadius: '1.5rem 1.5rem 0 0',
        backgroundColor: theme === 'dark' ? '#1f2937' : '#ffffff',
        boxShadow: '0 -4px 20px rgba(0,0,0,0.15)',
        transform: 'translateZ(0)', // GPU layer
      }}
    >
      {/* Drag handle — tap để chuyển giữa peek / half / full */}
      <div
        className="flex justify-center pt-2 pb-1"
        onClick={() => {
          setPanelHeight(h => h === 'peek' ? 'half' : h === 'half' ? 'full' : 'peek');
        }}
      >
        <div className="w-10 h-1 bg-gray-300 rounded-full cursor-pointer" />
      </div>

      {/* Nội dung cuộn được, tôn trọng safe-area-inset-bottom (iPhone notch) */}
      <div
        className="overflow-y-auto h-full"
        style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}
      >
        <div className="px-4 pb-4">
          {/* Tên địa điểm */}
          <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-1">
            {place.name}
          </h3>

          {/* Địa chỉ */}
          {place.location?.address && (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {place.location.address}
            </p>
          )}

          {/* Nút đóng */}
          <button
            onClick={onClose}
            className="mt-3 px-4 py-2 bg-gray-100 dark:bg-gray-700 rounded-xl text-sm font-medium text-gray-600 dark:text-gray-300"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
};

export const MapView: React.FC<MapViewProps> = ({ currentUser, onProfileClick }) => {
  const { theme } = useTheme();
  const [activeTab, setActiveTab] = useState<TabMode>('list'); // Bắt đầu với 'list' thay vì 'map'
  const [places, setPlaces] = useState<Place[]>([]);
  const [shouldLoadMap, setShouldLoadMap] = useState(false); // Lazy load map
  const [isMapReady, setIsMapReady] = useState(false); // Track map ready state
  const [aiKey, setAiKey] = useState(0); // Key để force re-mount AI
  const [listKey, setListKey] = useState(0); // Key để reset scroll PlaceList
  const [visibleMarkers, setVisibleMarkers] = useState(20); // First batch for progressive rendering
  const [mapBounds, setMapBounds] = useState<LatLngBounds | null>(null);
  
  // Firestore optimization - Task 8
  const [cacheManager] = useState(() => new FirestoreCacheManager({
    maxSize: 100,
    defaultTTL: 300000, // 5 minutes for places
  }));
  const [queryOptimizer] = useState(() => new FirestoreQueryOptimizer(cacheManager));
  
  // Location states
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  
  // Detect mobile
  const [isMobile, setIsMobile] = useState(false);
  
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Load map if default tab is 'map'
  useEffect(() => {
    if (activeTab === 'map') {
      setShouldLoadMap(true);
    }
  }, [activeTab]);

  const getRating = (place: Place): number => {
    if (typeof place.rating === 'number') return place.rating;
    if (typeof place.rating === 'string') return parseFloat(place.rating) || 0;
    return 0;
  };

  const [checkIns, setCheckIns] = useState<CheckIn[]>([]);
  const [events, setEvents] = useState<PlaceEvent[]>([]);
  const [selectedPlace, setSelectedPlace] = useState<Place | null>(null);
  const [panelOpen, setPanelOpen] = useState(false); // Task 7.2: Bottom sheet state
  const [showCheckInModal, setShowCheckInModal] = useState(false);
  const [showEventModal, setShowEventModal] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const handleTabChange = (tab: TabMode) => {
    // Prevent rapid tab switching
    if (activeTab === tab) return;
    
    // Load map only when switching to map tab
    if (tab === 'map' && !shouldLoadMap) {
      setShouldLoadMap(true);
      // Map ready sau khi mount xong
      setTimeout(() => setIsMapReady(true), 500);
    } else if (tab === 'map' && shouldLoadMap) {
      // Đã load rồi, đảm bảo flag đúng
      setIsMapReady(true);
    }
    
    // Force re-mount AI component when switching to AI tab
    if (tab === 'ai') {
      setAiKey(prev => prev + 1);
    }
    
    // Reset PlaceList scroll when switching to list tab
    if (tab === 'list') {
      setListKey(prev => prev + 1);
    }
    
    // Immediate tab change
    setActiveTab(tab);
    
    // AGGRESSIVE scroll reset - multiple attempts with instant behavior
    const scrollToTop = () => {
      window.scrollTo({ top: 0, behavior: 'instant' });
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
      
      // Reset all possible scroll containers
      const mainContent = document.querySelector('.main-content');
      if (mainContent) {
        mainContent.scrollTop = 0;
      }
      
      // Reset any overflow containers
      const containers = document.querySelectorAll('.overflow-y-auto, .overflow-auto');
      containers.forEach(container => {
        (container as HTMLElement).scrollTop = 0;
      });
    };
    
    // Attempt 1: Immediate
    scrollToTop();
    
    // Attempt 2: After DOM update
    requestAnimationFrame(() => {
      scrollToTop();
    });
    
    // Attempt 3: Delayed (for slow renders)
    setTimeout(scrollToTop, 50);
    
    // Attempt 4: Extra delayed for AI tab (heavy component)
    if (tab === 'ai') {
      setTimeout(scrollToTop, 100);
      setTimeout(scrollToTop, 200);
    }
  };

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [activeTab]);

  // Load places with optimized query - Task 2.4: Use QUERY_LIMITS constants
  useEffect(() => {
    // Task 2.4: Use centralized query limits configuration
    const placesLimit = getQueryLimit(
      QUERY_LIMITS.PLACES_MOBILE,
      QUERY_LIMITS.PLACES_DESKTOP,
      isMobile
    );
    
    const q = query(
      collection(db, 'places'),
      limit(placesLimit)
    );

    // Register listener through ListenerRegistry - Task 1.5
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
        
        logger.log(`✅ Loaded ${placesData.length} places (limit: ${placesLimit} for ${isMobile ? 'mobile' : 'desktop'})`);
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

    // Register with ListenerRegistry for memory leak prevention
    const listenerId = listenerRegistry.register({
      unsubscribe,
      collection: 'places',
      query: `limit(${placesLimit})`,
      priority: 10, // High priority for places
      componentName: 'MapView',
    });

    return () => {
      listenerRegistry.unregister(listenerId);
    };
  }, [isMobile]);

  const queryTime = useMemo(() => new Date(), []);

  // Load check-ins - Task 2.4: Use QUERY_LIMITS constants
  useEffect(() => {
    // Task 2.4: Use centralized query limits configuration
    const checkInLimit = getQueryLimit(
      QUERY_LIMITS.CHECKINS_MOBILE,
      QUERY_LIMITS.CHECKINS_DESKTOP,
      isMobile
    );
    
    const q = query(
      collection(db, 'checkIns'),
      where('expiresAt', '>', queryTime), // Task 8.2: Filter expired check-ins at database level
      orderBy('expiresAt', 'desc'),
      limit(checkInLimit)
    );

    // Register listener through ListenerRegistry - Task 1.5
    const unsubscribe = onSnapshot(q, 
      (snapshot) => {
        const checkInsData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as CheckIn[];
        
        setCheckIns(checkInsData);
        logger.log(`✅ Loaded ${checkInsData.length} active check-ins (limit: ${checkInLimit} for ${isMobile ? 'mobile' : 'desktop'})`);
      },
      (error) => {
        console.error('Error loading check-ins:', error);
        setError('Không thể tải danh sách check-in');
      }
    );

    // Register with ListenerRegistry for memory leak prevention
    const listenerId = listenerRegistry.register({
      unsubscribe,
      collection: 'checkIns',
      query: `where(expiresAt > ${queryTime.toISOString()}).orderBy(expiresAt, desc).limit(${checkInLimit})`,
      priority: 8, // Medium-high priority for check-ins
      componentName: 'MapView',
    });

    return () => {
      listenerRegistry.unregister(listenerId);
    };
  }, [isMobile, queryTime]);

  // Load events - Task 2.4: Use QUERY_LIMITS constants
  useEffect(() => {
    // Task 2.4: Use centralized query limits configuration
    const eventLimit = getQueryLimit(
      QUERY_LIMITS.EVENTS_MOBILE,
      QUERY_LIMITS.EVENTS_DESKTOP,
      isMobile
    );
    
    const q = query(
      collection(db, 'events'),
      where('startTime', '>', queryTime), // Task 8.3: Filter past events at database level
      where('isPublic', '==', true),
      orderBy('startTime', 'asc'),
      limit(eventLimit)
    );

    // Register listener through ListenerRegistry - Task 1.5
    const unsubscribe = onSnapshot(q, 
      (snapshot) => {
        const eventsData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as PlaceEvent[];
        
        setEvents(eventsData);
        logger.log(`✅ Loaded ${eventsData.length} upcoming events (limit: ${eventLimit} for ${isMobile ? 'mobile' : 'desktop'})`);
      },
      (error) => {
        console.error('Error loading events:', error);
        setError('Không thể tải danh sách sự kiện');
      }
    );

    // Register with ListenerRegistry for memory leak prevention
    const listenerId = listenerRegistry.register({
      unsubscribe,
      collection: 'events',
      query: `where(startTime > ${queryTime.toISOString()}).where(isPublic == true).orderBy(startTime, asc).limit(${eventLimit})`,
      priority: 6, // Medium priority for events
      componentName: 'MapView',
    });

    return () => {
      listenerRegistry.unregister(listenerId);
    };
  }, [isMobile, queryTime]);

  const validPlaces = useMemo(() => 
    places.filter(p => p.location?.lat && p.location?.lng),
    [places]
  );

  // No distance calculation - just show all places
  const nearbyPlaces = useMemo(() => {
    return validPlaces;
  }, [validPlaces]);

  // Task 5.7: useMemo for category filtering - Validates Requirements 3.3
  const filteredByCategory = useMemo(() => {
    if (selectedCategory === 'all') return nearbyPlaces;
    return nearbyPlaces.filter(p => p.category === selectedCategory);
  }, [nearbyPlaces, selectedCategory]);

  // Display places filtered by map bounds (Task 2.6)
  const displayPlaces = useMemo(() => {
    return queryPlacesInBounds(filteredByCategory, mapBounds);
  }, [filteredByCategory, mapBounds]);

  // Reset visible markers when switching tabs
  useEffect(() => {
    if (activeTab !== 'map') {
      setVisibleMarkers(isMobile ? 20 : displayPlaces.length);
    }
  }, [activeTab, isMobile, displayPlaces.length]);

  // Progressive rendering on mobile - batch 20 markers per frame to avoid freeze
  useEffect(() => {
    if (!isMobile || activeTab !== 'map' || displayPlaces.length <= 20) {
      if (!isMobile) setVisibleMarkers(displayPlaces.length);
      return;
    }
    // Mobile + map tab + >20 places → progressive rendering
    let currentBatch = 20;
    setVisibleMarkers(currentBatch);
    let rafId: number;
    const addNextBatch = () => {
      if (currentBatch >= displayPlaces.length) return;
      currentBatch = Math.min(currentBatch + 20, displayPlaces.length);
      setVisibleMarkers(currentBatch);
      if (currentBatch < displayPlaces.length) {
        rafId = requestAnimationFrame(addNextBatch);
      }
    };
    rafId = requestAnimationFrame(addNextBatch);
    return () => {
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [isMobile, activeTab, displayPlaces.length]);

  const getPlaceVisitors = (placeId: string) => {
    return checkIns.filter(c => c.placeId === placeId);
  };



  // Cache icons để tránh tạo lại mỗi lần render
  const iconCache = useMemo(() => {
    const cache: { [key: string]: Icon } = {};
    const categories = ['cafe', 'restaurant', 'vegetarian', 'pharmacy', 'flower', 
                       'printing', 'clothing', 'shop', 'bookstore', 'library', 
                       'park', 'study', 'sport', 'entertainment', 'other'];
    
    categories.forEach(category => {
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
        entertainment: theme === 'dark' ? '#FF6B9D' : '#C2185B',  // Hồng đậm cho Vui chơi
        other: theme === 'dark' ? '#78909C' : '#455A64'
      };

      const color = iconColors[category] || iconColors.other;
      
      cache[category] = new Icon({
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
    });
    
    return cache;
  }, [theme]);

  // Custom marker icon - sử dụng cache
  const getCategoryIcon = (category: string): Icon => {
    return iconCache[category] || iconCache.other;
  };

  // Memoized Marker Component - Task 5.4: Prevent re-renders on map pan/zoom
  const MemoizedMarker = React.memo<{
    place: Place;
    icon: Icon;
    visitors: CheckIn[];
    placeEvents: PlaceEvent[];
    onMarkerClick: (place: Place) => void;
    onCheckInClick: (place: Place) => void;
  }>(({ place, icon, visitors, placeEvents, onMarkerClick, onCheckInClick }) => {
    return (
      <Marker
        position={[place.location.lat, place.location.lng]}
        icon={icon}
        eventHandlers={{
          click: () => onMarkerClick(place)
        }}
        riseOnHover={!isMobile}
      >
        <Popup
          maxWidth={isMobile ? 250 : 300}
          minWidth={isMobile ? 200 : 250}
          closeButton={!isMobile}
          autoPan={!isMobile}
        >
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
              onClick={() => onCheckInClick(place)}
              className="w-full mt-2 py-2 bg-indigo-600 text-white text-sm font-bold rounded-lg hover:bg-indigo-700"
            >
              Check-in
            </button>
          </div>
        </Popup>
      </Marker>
    );
  }, (prevProps, nextProps) => {
    // Chỉ re-render khi place.id hoặc visitors/events thay đổi
    // Không re-render khi map pan/zoom (icon object vẫn giữ nguyên reference)
    return (
      prevProps.place.id === nextProps.place.id &&
      prevProps.visitors.length === nextProps.visitors.length &&
      prevProps.placeEvents.length === nextProps.placeEvents.length &&
      prevProps.icon === nextProps.icon
    );
  });

  return (
    <div className="flex flex-col w-full overflow-hidden" style={{ height: isMobile ? 'calc(100dvh - 136px)' : 'calc(100vh - 80px)' }}>
      {/* Header Tabs - Modern pill style */}
      <div
        className="flex-shrink-0 px-3 py-2.5"
        style={{
          backgroundColor: theme === 'dark' ? 'rgba(17, 24, 39, 0.98)' : '#f8fafc',
          borderBottom: theme === 'dark' ? '1px solid rgba(55,65,81,0.6)' : '1px solid #e2e8f0',
        }}
      >
        <div
          className="flex items-center gap-1.5 rounded-2xl p-1"
          style={{
            backgroundColor: theme === 'dark' ? 'rgba(31,41,55,0.8)' : '#ffffff',
            boxShadow: theme === 'dark'
              ? 'inset 0 1px 3px rgba(0,0,0,0.4), 0 1px 0 rgba(255,255,255,0.04)'
              : 'inset 0 1px 3px rgba(0,0,0,0.06), 0 1px 0 rgba(255,255,255,0.8)',
          }}
        >
          {[
            { tab: 'map',    icon: <MapPin className="w-4 h-4" />,      label: 'Bản đồ',   color: 'from-emerald-500 to-teal-500' },
            { tab: 'list',   icon: <Navigation className="w-4 h-4" />,  label: 'Địa điểm', color: 'from-indigo-500 to-violet-500' },
            { tab: 'ai',     icon: <Bot className="w-4 h-4" />,         label: 'AI',        color: 'from-violet-500 to-purple-600' },
            { tab: 'rental', icon: <Home className="w-4 h-4" />,        label: 'Tìm Trọ',  color: 'from-orange-400 to-rose-500' },
          ].map(({ tab, icon, label, color }) => (
            <button
              key={tab}
              onClick={() => handleTabChange(tab as TabMode)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-1 rounded-xl font-bold text-xs sm:text-sm transition-all duration-200 active:scale-95 ${
                activeTab === tab
                  ? `bg-gradient-to-r ${color} text-white shadow-md`
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700/50'
              }`}
            >
              <span className={`flex-shrink-0 ${activeTab === tab ? 'drop-shadow-sm' : ''}`}>{icon}</span>
              <span className="leading-none whitespace-nowrap">{label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Loading/Error/Empty States */}
      {isLoading && (
        <div className="flex-1 overflow-y-auto p-4">
          <div className="space-y-4 max-w-2xl mx-auto">
            {/* Search/Filter Skeleton */}
            <div className="flex gap-2 mb-6">
              <div className="h-10 flex-1 bg-gray-200 dark:bg-gray-700 rounded-lg animate-pulse"></div>
              <div className="h-10 w-24 bg-gray-200 dark:bg-gray-700 rounded-lg animate-pulse"></div>
              <div className="h-10 w-24 bg-gray-200 dark:bg-gray-700 rounded-lg animate-pulse hidden sm:block"></div>
            </div>
            
            {/* Place Card Skeletons */}
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-100 dark:border-gray-700 shadow-sm flex flex-col gap-3">
                <div className="flex justify-between items-start">
                  <div className="space-y-2 flex-1 pr-4">
                    <div className="h-5 w-2/3 bg-gray-200 dark:bg-gray-700 rounded animate-pulse"></div>
                    <div className="h-4 w-1/2 bg-gray-200 dark:bg-gray-700 rounded animate-pulse"></div>
                  </div>
                  <div className="h-8 w-8 bg-gray-200 dark:bg-gray-700 rounded-full animate-pulse flex-shrink-0"></div>
                </div>
                <div className="flex gap-2">
                  <div className="h-6 w-16 bg-gray-100 dark:bg-gray-700 rounded animate-pulse"></div>
                  <div className="h-6 w-20 bg-gray-100 dark:bg-gray-700 rounded animate-pulse"></div>
                  <div className="h-6 w-24 bg-gray-100 dark:bg-gray-700 rounded animate-pulse"></div>
                </div>
                <div className="h-16 w-full bg-gray-50 dark:bg-gray-900/50 rounded animate-pulse mt-2"></div>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  <div className="h-10 bg-gray-200 dark:bg-gray-700 rounded-lg animate-pulse"></div>
                  <div className="h-10 bg-gray-200 dark:bg-gray-700 rounded-lg animate-pulse"></div>
                </div>
              </div>
            ))}
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
        <div className="flex-1 flex flex-col relative overflow-hidden">
          {activeTab === 'map' && (
            <div className="absolute inset-0 z-0">
              {/* Dynamic Places Counter Badge - Top Left */}
              <div 
                onClick={() => {
                  // Scroll to list
                  if (activeTab === 'map') {
                    setActiveTab('list');
                  }
                }}
                className="absolute top-4 left-4 z-[900] px-4 py-2.5 rounded-full shadow-lg backdrop-blur-md cursor-pointer hover:scale-105 transition-all duration-300"
                style={{
                  background: theme === 'dark' 
                    ? 'linear-gradient(135deg, rgba(139, 92, 246, 0.9) 0%, rgba(59, 130, 246, 0.9) 50%, rgba(6, 182, 212, 0.9) 100%)' 
                    : 'linear-gradient(135deg, rgba(147, 51, 234, 0.95) 0%, rgba(59, 130, 246, 0.95) 50%, rgba(14, 165, 233, 0.95) 100%)',
                  border: theme === 'dark' 
                    ? '2px solid rgba(196, 181, 253, 0.4)' 
                    : '2px solid rgba(224, 231, 255, 0.6)',
                  boxShadow: theme === 'dark'
                    ? '0 8px 32px rgba(139, 92, 246, 0.4), 0 0 20px rgba(6, 182, 212, 0.2)'
                    : '0 8px 32px rgba(147, 51, 234, 0.3), 0 0 20px rgba(14, 165, 233, 0.2)'
                }}
              >
                <div className="flex items-center gap-2">
                  <MapPin className="w-5 h-5 text-white drop-shadow-lg" />
                  <div className="flex flex-col">
                    <span className="text-white font-bold text-base leading-tight drop-shadow-md">
                      {nearbyPlaces.length}
                    </span>
                    <span className="text-white/95 text-xs font-medium leading-tight drop-shadow-sm">
                      {selectedCategory === 'all' 
                        ? 'địa điểm'
                        : getCategoryLabel(selectedCategory)
                      }
                    </span>
                  </div>
                </div>
              </div>

              {shouldLoadMap ? (
                <>
                  {/* Beautiful Loading Skeleton */}
                  {!isMapReady && (
                    <div 
                      className="absolute inset-0 z-[999] flex items-center justify-center"
                      style={{
                        background: theme === 'dark' 
                          ? 'linear-gradient(135deg, rgba(17, 24, 39, 0.95) 0%, rgba(31, 41, 55, 0.95) 100%)'
                          : 'linear-gradient(135deg, rgba(249, 250, 251, 0.95) 0%, rgba(243, 244, 246, 0.95) 100%)',
                        backdropFilter: 'blur(10px)'
                      }}
                    >
                      <div className="text-center">
                        {/* Animated Map Icon */}
                        <div 
                          className="w-20 h-20 mx-auto mb-4 rounded-2xl flex items-center justify-center animate-pulse"
                          style={{
                            background: theme === 'dark'
                              ? 'linear-gradient(135deg, rgba(99, 102, 241, 0.2), rgba(139, 92, 246, 0.2))'
                              : 'linear-gradient(135deg, rgba(99, 102, 241, 0.15), rgba(139, 92, 246, 0.15))',
                            boxShadow: theme === 'dark'
                              ? '0 8px 32px rgba(99, 102, 241, 0.2)'
                              : '0 8px 32px rgba(99, 102, 241, 0.15)'
                          }}
                        >
                          <MapPin 
                            className="w-10 h-10"
                            style={{ color: theme === 'dark' ? '#A5B4FC' : '#6366F1' }}
                          />
                        </div>
                        
                        {/* Loading Text */}
                        <h3 
                          className="text-lg font-bold mb-2"
                          style={{ color: theme === 'dark' ? '#E5E7EB' : '#1F2937' }}
                        >
                          Đang tải bản đồ...
                        </h3>
                        <p 
                          className="text-sm"
                          style={{ color: theme === 'dark' ? '#9CA3AF' : '#6B7280' }}
                        >
                          Chuẩn bị {nearbyPlaces.length} địa điểm cho bạn
                        </p>
                        
                        {/* Loading Bar */}
                        <div 
                          className="w-48 h-1.5 mx-auto mt-4 rounded-full overflow-hidden"
                          style={{
                            backgroundColor: theme === 'dark' ? 'rgba(55, 65, 81, 0.5)' : 'rgba(229, 231, 235, 0.8)'
                          }}
                        >
                          <div 
                            className="h-full rounded-full animate-pulse"
                            style={{
                              width: '60%',
                              background: 'linear-gradient(90deg, #6366F1, #8B5CF6, #A855F7)',
                              animation: 'loading-bar 1.5s ease-in-out infinite'
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  )}
                  
                  <MapContainer
                    center={TVU_CENTER}
                    zoom={isMobile ? 14 : 15}
                    style={{ height: '100%', width: '100%' }}
                    zoomControl={!isMobile}
                    preferCanvas={true} // CRITICAL: Use Canvas for better performance
                    touchZoom={isMobile}
                    doubleClickZoom={!isMobile}
                    scrollWheelZoom={!isMobile}
                    dragging={true}
                    // Performance optimizations for mobile
                    zoomAnimation={!isMobile} // Disable zoom animation on mobile
                    fadeAnimation={!isMobile} // Disable fade animation on mobile
                    markerZoomAnimation={!isMobile} // Disable marker zoom animation on mobile
                    worldCopyJump={false} // Disable world copy jump
                    maxBoundsViscosity={1.0} // Prevent map from going outside bounds
                    whenReady={() => {
                      // Map is ready, hide loading
                      setTimeout(() => setIsMapReady(true), 100);
                    }}
                  >
                  <BoundsTracker onBoundsChange={setMapBounds} />
                  <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                    url={theme === 'dark' 
                      ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
                      : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
                    }
                    maxZoom={19}
                    minZoom={isMobile ? 12 : 13}
                    keepBuffer={isMobile ? 1 : 2} // Mobile: giảm buffer để tăng performance
                    updateInterval={isMobile ? 200 : 100} // Mobile: tăng interval
                  />

                  {/* Memoized markers - Task 5.4: Prevent re-renders on map pan/zoom */}
                  {displayPlaces.slice(0, visibleMarkers).map(place => {
                    const visitors = getPlaceVisitors(place.id!);
                    const placeEvents = events.filter(e => e.placeId === place.id);
                    const icon = getCategoryIcon(place.category);

                    return (
                      <MemoizedMarker
                        key={place.id}
                        place={place}
                        icon={icon}
                        visitors={visitors}
                        placeEvents={placeEvents}
                        onMarkerClick={(place) => {
                          setSelectedPlace(place);
                          setPanelOpen(true);
                        }}
                        onCheckInClick={(place) => {
                          setSelectedPlace(place);
                          setShowCheckInModal(true);
                        }}
                      />
                    );
                  })}
                </MapContainer>
                
                {/* Add loading bar animation CSS */}
                <style>{`
                  @keyframes loading-bar {
                    0% { transform: translateX(-100%); }
                    50% { transform: translateX(100%); }
                    100% { transform: translateX(-100%); }
                  }
                `}</style>
              </>
              ) : (
                <div className="h-full w-full flex items-center justify-center bg-gray-100 dark:bg-gray-800">
                  <div className="text-center">
                    <div className="w-16 h-16 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                    <p className="text-gray-600 dark:text-gray-400">Đang khởi tạo bản đồ...</p>
                  </div>
                </div>
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
              places={nearbyPlaces}
              checkIns={checkIns}
              events={events}
              currentUser={currentUser}
              onPlaceSelect={setSelectedPlace}
              onCheckIn={(place) => {
                setSelectedPlace(place);
                setShowCheckInModal(true);
              }}
              userLocation={null}
              selectedCategory={selectedCategory}
              onCategoryChange={setSelectedCategory}
              resetScrollKey={listKey}
              onProfileClick={onProfileClick}
            />
          )}

          {activeTab === 'rental' && (
            <RentalList currentUser={currentUser} />
          )}

          {activeTab === 'ai' && (
            <Suspense fallback={
              <div className="flex-1 flex items-center justify-center bg-gray-100 dark:bg-gray-800">
                <div className="text-center">
                  <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                  <p className="text-gray-600 dark:text-gray-400">Đang tải AI Trợ lý...</p>
                </div>
              </div>
            }>
              <LazyAIAssistant key={aiKey} />
            </Suspense>
          )}
        </div>
      )}

      {/* Task 7.2: PlaceInfoBottomSheet — thay thế absolute overlay */}
      {/* Bản đồ giữ nguyên kích thước đầy đủ, bottom sheet float bên trên */}
      {selectedPlace && panelOpen && (
        <PlaceInfoBottomSheet
          place={selectedPlace}
          onClose={() => {
            setPanelOpen(false);
            setSelectedPlace(null);
          }}
        />
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
