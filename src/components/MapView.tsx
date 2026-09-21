import React, { useState, useEffect, useMemo, useCallback, Suspense, useRef } from 'react';
import { User } from 'firebase/auth';
import { AttributionControl, Circle, MapContainer, Marker, Polyline, Popup, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import { divIcon, Icon, latLngBounds, LatLngBounds, point } from 'leaflet';
import MarkerClusterGroup from 'react-leaflet-cluster';
import { Place, CheckIn, PlaceEvent, StudentProfile } from '../types';
import { db, collection, query, where, onSnapshot, orderBy, limit } from '../firebase';
import { Bike, Bot, Calendar, Car, Footprints, Home, Loader2, LocateFixed, MapPin, Navigation, Phone, Route as RouteIcon, Star, Utensils, Users, X } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { PlaceList } from './PlaceList';
import { RentalList } from './RentalList';
import { FoodNearby } from './FoodNearby';
import { CommunityReviews } from './CommunityReviews';
import { InlineLocationMap } from './InlineLocationMap';
import { getMapTileUrl, MAP_TILE_ATTRIBUTION } from '../utils/mapTiles';
import { StudentMap } from './StudentMap';
import { LazyAIAssistant } from '../routes/lazyRoutes';
import { CheckInModal } from './CheckInModal';
import { CreateEventModal } from './CreateEventModal';
import { 
  getCategoryLabel,
  Coordinates,
  calculateDistance,
  formatDistance,
  sortByDistance
} from '../utils/locationUtils';
import { geolocationSample, isRecentRouteOrigin, requestFreshGeolocation, shouldAcceptGeolocationSample, watchResponsiveGeolocation, type PreciseGeolocation } from '../utils/geolocation';
import { getMapRoute, type MapRoute, type StudentRouteMode } from '../services/liveLocationService';
import { formatRouteDuration } from '../utils/studentLocationPresentation';
import { FirestoreQueryOptimizer } from '../utils/firestoreQueryOptimizer';
import { FirestoreCacheManager } from '../utils/firestoreCacheManager';
import { listenerRegistry } from '../utils/listenerRegistry';
import { QUERY_LIMITS, getQueryLimit } from '../config/queryLimits';
import { queryPlacesInBounds } from '../utils/mapUtils';
import { toast } from 'sonner';
import 'leaflet/dist/leaflet.css';
import 'react-leaflet-cluster/dist/assets/MarkerCluster.css';
import 'react-leaflet-cluster/dist/assets/MarkerCluster.Default.css';

// Fix Leaflet default icon issue
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';
import iconRetina from 'leaflet/dist/images/marker-icon-2x.png';
import { logger } from '@/utils/logger';
import { useNavigate } from 'react-router';
import { pathForExplore } from '../routes/appRoutes';

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
  currentProfile?: StudentProfile | null;
  onProfileClick?: (uid: string) => void;
  initialTab?: ExploreTab;
}

export type ExploreTab = 'map' | 'people' | 'list' | 'food' | 'ai' | 'rental';

// TVU Campus coordinates
const TVU_CENTER: [number, number] = [9.9345, 106.3461];
const ROUTE_REFRESH_MS = 20_000;
const ROUTE_REFRESH_DISTANCE_METERS = 25;

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

const MapViewportController: React.FC<{
  currentPosition: Coordinates | null;
  focusPosition: Coordinates | null;
  routePath?: MapRoute['path'];
  followUser: boolean;
  onFollowChange: (following: boolean) => void;
  recenterToken: number;
}> = ({ currentPosition, focusPosition, routePath, followUser, onFollowChange, recenterToken }) => {
  const map = useMap();

  useMapEvents({
    dragstart: () => onFollowChange(false),
  });

  useEffect(() => {
    if (routePath && routePath.length > 1) {
      const bounds = latLngBounds(routePath.map((item) => [item.latitude, item.longitude]));
      if (currentPosition) bounds.extend([currentPosition.lat, currentPosition.lng]);
      const narrow = map.getSize().x < 640;
      map.fitBounds(bounds, {
        paddingTopLeft: narrow ? [24, 170] : [410, 32],
        paddingBottomRight: [24, 80],
        maxZoom: 17,
        animate: true,
      });
      return;
    }
    if (focusPosition && currentPosition) {
      map.fitBounds(latLngBounds([
        [currentPosition.lat, currentPosition.lng],
        [focusPosition.lat, focusPosition.lng],
      ]), { padding: [54, 54], maxZoom: 17, animate: true });
      return;
    }
    if (focusPosition) map.flyTo([focusPosition.lat, focusPosition.lng], 17, { duration: 0.5 });
  }, [focusPosition, map, routePath]);

  useEffect(() => {
    if (!currentPosition || !followUser) return;
    if (routePath?.length) {
      // Keep the moving user inside the visible route, without re-fitting on every GPS fix.
      const comfortableBounds = map.getBounds().pad(-0.22);
      if (!comfortableBounds.contains([currentPosition.lat, currentPosition.lng])) {
        map.panTo([currentPosition.lat, currentPosition.lng], { animate: true, duration: 0.3 });
      }
      return;
    }
    const nextZoom = Math.max(map.getZoom(), 16);
    if (map.getZoom() < 16) map.setView([currentPosition.lat, currentPosition.lng], nextZoom, { animate: false });
    else map.panTo([currentPosition.lat, currentPosition.lng], { animate: true, duration: 0.3 });
  }, [currentPosition?.lat, currentPosition?.lng, followUser, map, routePath?.length]);

  useEffect(() => {
    if (!recenterToken || !currentPosition) return;
    if (routePath && routePath.length > 1) {
      map.fitBounds(latLngBounds([
        ...routePath.map((item) => [item.latitude, item.longitude] as [number, number]),
        [currentPosition.lat, currentPosition.lng],
      ]), { padding: [40, 60], maxZoom: 17 });
    } else {
      map.flyTo([currentPosition.lat, currentPosition.lng], Math.max(map.getZoom(), 16), { duration: 0.45 });
    }
  }, [map, recenterToken]);

  return null;
};

const currentLocationIcon = divIcon({
  className: 'tvu-current-location-marker',
  html: '<span style="display:block;width:20px;height:20px;border-radius:9999px;background:#2563eb;border:4px solid white;box-shadow:0 0 0 5px rgba(37,99,235,.2),0 5px 14px rgba(15,23,42,.32)"></span>',
  iconSize: [28, 28],
  iconAnchor: [14, 14],
});

const ROUTE_MODES: Array<{ value: StudentRouteMode; label: string; Icon: typeof Footprints }> = [
  { value: 'walking', label: 'Đi bộ', Icon: Footprints },
  { value: 'cycling', label: 'Xe đạp', Icon: Bike },
  { value: 'driving', label: 'Xe máy / ô tô', Icon: Car },
];

// Task 7.1 — PlaceInfoBottomSheet component
// Bug_Condition: activeTab = 'map' AND isMobile = true AND selectedPlace != null AND panel overlaps map
// Expected_Behavior: Place info trong bottom sheet riêng, bản đồ vẫn tương tác được phía sau
const PlaceInfoBottomSheet: React.FC<{
  place: Place & { distance?: number };
  currentUser: User;
  onClose: () => void;
  onOpenMap: () => void;
  onRoute: () => void;
}> = ({ place, currentUser, onClose, onOpenMap, onRoute }) => {
  const { theme } = useTheme();
  const isGooglePlace = place.dataSource === 'google_places';

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-end sm:items-center justify-center bg-slate-950/65 p-0 sm:p-4"
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <div
      className="w-full sm:max-w-2xl max-h-[92dvh] overflow-y-auto rounded-t-[2rem] sm:rounded-[2rem] transition-all duration-300 ease-out"
      style={{
        backgroundColor: theme === 'dark' ? '#1f2937' : '#ffffff',
        boxShadow: '0 -4px 20px rgba(0,0,0,0.15)',
      }}
    >
        {place.images?.[0] && <img src={place.images[0]} alt={`Ảnh ${place.name}`} className="w-full h-52 object-cover" />}
        <div className="p-5 sm:p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
          <div className="flex items-start justify-between gap-4">
            <div><h3 className="text-2xl font-black text-gray-900 dark:text-white">{place.name}</h3><p className="mt-2 text-sm text-gray-500 dark:text-gray-400 inline-flex items-start gap-1.5"><MapPin className="w-4 h-4 mt-0.5" /> {place.location?.address || 'Chưa có địa chỉ'}</p></div>
            <button onClick={onClose} className="p-2 rounded-xl bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300" aria-label="Đóng"><X className="w-5 h-5" /></button>
          </div>
          <div className="mt-4 flex flex-wrap gap-2 text-xs font-bold">
            {place.distance !== undefined && <span className="px-3 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300"><LocateFixed className="w-3.5 h-3.5 inline mr-1" />{place.distance < 1 ? `${Math.round(place.distance * 1000)}m` : `${place.distance.toFixed(1)}km`}</span>}
            {place.rating > 0 && <span className="px-3 py-1.5 rounded-lg bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300"><Star className="w-3.5 h-3.5 inline fill-current mr-1" />{Number(place.rating).toFixed(1)}</span>}
            {place.priceRange && <span className="px-3 py-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300">Mức giá: {place.priceRange}</span>}
            {place.openHours && <span className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-200">Mở cửa: {place.openHours}</span>}
          </div>
          {isGooglePlace && (
            <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-900 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-100">
              Dữ liệu địa điểm cung cấp bởi <span translate="no" style={{ fontFamily: 'Roboto, sans-serif' }} className="whitespace-nowrap font-normal">Google Maps</span>. TVU Connect không lưu bản sao dữ liệu này vào Firestore.
            </div>
          )}
          {place.description && <p className="mt-4 text-sm leading-relaxed text-slate-600 dark:text-slate-300">{place.description}</p>}
          {place.phone && <div className="mt-4 rounded-xl bg-slate-50 dark:bg-slate-800 p-3 text-sm text-slate-700 dark:text-slate-200"><Phone className="w-4 h-4 inline mr-2" />{place.phone}</div>}
          {isGooglePlace ? (
            <p className="mt-4 rounded-xl bg-slate-50 p-3 text-xs leading-relaxed text-slate-500 dark:bg-slate-800 dark:text-slate-400">Địa chỉ và thông tin quán đến từ Google Maps. Tuyến đường được TVU Connect tính bằng dữ liệu đường OpenStreetMap.</p>
          ) : (
            <>
              <InlineLocationMap
                latitude={place.location.lat}
                longitude={place.location.lng}
                title={place.name}
                address={place.location.address}
              />
              <button
                type="button"
                onClick={onOpenMap}
                className="mt-3 w-full min-h-11 rounded-xl bg-indigo-600 px-4 text-sm font-bold text-white hover:bg-indigo-700"
              >
                Mở bản đồ lớn tại vị trí này
              </button>
            </>
          )}
          <button
            type="button"
            onClick={onRoute}
            className="mt-3 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 text-sm font-black text-white hover:bg-indigo-700"
          >
            <RouteIcon className="h-4 w-4" /> Chỉ đường ngắn nhất đến đây
          </button>
          {place.id && <CommunityReviews targetKind={isGooglePlace ? 'google_place' : 'place'} targetId={place.id} currentUser={currentUser} />}
        </div>
      </div>
    </div>
  );
};

export const MapView: React.FC<MapViewProps> = ({ currentUser, currentProfile = null, onProfileClick, initialTab = 'list' }) => {
  const { theme } = useTheme();
  const navigate = useNavigate();
  const activeTab = initialTab;
  const [places, setPlaces] = useState<Place[]>([]);
  const [shouldLoadMap, setShouldLoadMap] = useState(false); // Lazy load map
  const [isMapReady, setIsMapReady] = useState(false); // Track map ready state
  const [aiKey, setAiKey] = useState(0); // Key để force re-mount AI
  const [listKey, setListKey] = useState(0); // Key để reset scroll PlaceList
  const [visibleMarkers, setVisibleMarkers] = useState(20); // First batch for progressive rendering
  const [mapBounds, setMapBounds] = useState<LatLngBounds | null>(null);
  const [mapFocus, setMapFocus] = useState<Coordinates | null>(null);
  const [followUser, setFollowUser] = useState(true);
  const [userAccuracy, setUserAccuracy] = useState<number | null>(null);
  const [routeMode, setRouteMode] = useState<StudentRouteMode>('walking');
  const [placeRoute, setPlaceRoute] = useState<MapRoute | null>(null);
  const [routeDestination, setRouteDestination] = useState<(Place & { distance?: number }) | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [recenterToken, setRecenterToken] = useState(0);
  const lastMapPositionRef = useRef<PreciseGeolocation | null>(null);
  const routeRequestRef = useRef(0);
  const locationErrorShownRef = useRef(false);
  const autoLocationAttemptedRef = useRef(false);
  
  // Firestore optimization - Task 8
  const [cacheManager] = useState(() => new FirestoreCacheManager({
    maxSize: 100,
    defaultTTL: 300000, // 5 minutes for places
  }));
  const [queryOptimizer] = useState(() => new FirestoreQueryOptimizer(cacheManager));
  
  // Location states
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [userLocation, setUserLocation] = useState<Coordinates | null>(null);
  const [locating, setLocating] = useState(false);
  
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
  const [selectedPlace, setSelectedPlace] = useState<(Place & { distance?: number }) | null>(null);
  const [panelOpen, setPanelOpen] = useState(false); // Task 7.2: Bottom sheet state
  const [showCheckInModal, setShowCheckInModal] = useState(false);
  const [showEventModal, setShowEventModal] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const requestCurrentLocation = useCallback(async () => {
    setLocating(true);
    try {
      const sample = await requestFreshGeolocation();
      lastMapPositionRef.current = sample;
      const coordinates = { lat: sample.lat, lng: sample.lng };
      setUserLocation(coordinates);
      setUserAccuracy(sample.accuracy);
      setMapFocus(coordinates);
      setFollowUser(true);
      toast.success('Đã cập nhật vị trí hiện tại. Vị trí chỉ được giữ trong phiên này.');
      return coordinates;
    } catch (locationError) {
      toast.error(locationError instanceof Error ? locationError.message : 'Không thể lấy vị trí hiện tại.');
      return null;
    } finally {
      setLocating(false);
    }
  }, []);

  useEffect(() => {
    if (!['food', 'rental'].includes(activeTab) || userLocation || autoLocationAttemptedRef.current) return;
    autoLocationAttemptedRef.current = true;
    void requestCurrentLocation();
  }, [activeTab, requestCurrentLocation, userLocation]);

  useEffect(() => {
    if (activeTab !== 'map' || !navigator.geolocation) return;
    return watchResponsiveGeolocation(
      (position) => {
        const sample = geolocationSample(position);
        if (!shouldAcceptGeolocationSample(lastMapPositionRef.current, sample)) return;
        const isFirstPosition = !lastMapPositionRef.current;
        lastMapPositionRef.current = sample;
        setUserLocation({ lat: sample.lat, lng: sample.lng });
        setUserAccuracy(sample.accuracy);
        if (isFirstPosition) {
          setMapFocus((currentFocus) => currentFocus || { lat: sample.lat, lng: sample.lng });
          setFollowUser(true);
        }
        locationErrorShownRef.current = false;
      },
      (locationError) => {
        if (locationErrorShownRef.current) return;
        locationErrorShownRef.current = true;
        toast.error(locationError.code === locationError.PERMISSION_DENIED
          ? 'Hãy bật quyền Vị trí chính xác để bản đồ đi theo bạn.'
          : 'GPS chưa ổn định. Bản đồ sẽ tự cập nhật khi có tín hiệu tốt hơn.');
      },
    );
  }, [activeTab]);

  const scrollMainContentToTop = useCallback(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
    document.querySelector<HTMLElement>('.main-content')?.scrollTo({ top: 0, behavior: 'auto' });
  }, []);

  const handleTabChange = useCallback((tab: ExploreTab) => {
    if (activeTab === tab) return;

    if (tab === 'map' && !shouldLoadMap) {
      setShouldLoadMap(true);
      setIsMapReady(false);
    }

    if (tab === 'ai') {
      setAiKey(prev => prev + 1);
    }

    if (tab === 'list') {
      setListKey(prev => prev + 1);
    }

    navigate(pathForExplore(tab));
    window.requestAnimationFrame(scrollMainContentToTop);
  }, [activeTab, navigate, scrollMainContentToTop, shouldLoadMap]);

  const loadPlaceRoute = useCallback(async (
    place: Place & { distance?: number },
    mode: StudentRouteMode,
    quiet = false,
  ) => {
    const requestId = ++routeRequestRef.current;
    setRouteLoading(true);
    setRouteError(null);
    if (!quiet) setPlaceRoute(null);
    setRouteDestination(place);
    if (!quiet) {
      setMapFocus({ lat: place.location.lat, lng: place.location.lng });
      setFollowUser(true);
      setPanelOpen(false);
      handleTabChange('map');
    }
    try {
      const cached = lastMapPositionRef.current;
      const current = isRecentRouteOrigin(cached)
        ? cached
        : await requestFreshGeolocation();
      if (requestId !== routeRequestRef.current) return;
      setUserLocation({ lat: current.lat, lng: current.lng });
      setUserAccuracy(current.accuracy);
      const route = await getMapRoute(
        { latitude: current.lat, longitude: current.lng },
        { latitude: place.location.lat, longitude: place.location.lng },
        mode,
      );
      if (requestId !== routeRequestRef.current) return;
      setPlaceRoute(route);
    } catch (routeRequestError) {
      if (requestId !== routeRequestRef.current) return;
      const message = routeRequestError instanceof Error
        ? routeRequestError.message
        : 'Chưa thể tạo tuyến đường lúc này.';
      setRouteError(message);
      toast.error('Chưa thể tạo tuyến đường. Hãy kiểm tra quyền vị trí rồi thử lại.');
    } finally {
      if (requestId === routeRequestRef.current) setRouteLoading(false);
    }
  }, [handleTabChange]);

  const handlePlaceSelect = useCallback((place: Place & { distance?: number }) => {
    setSelectedPlace(place);
    void loadPlaceRoute(place, routeMode);
  }, [loadPlaceRoute, routeMode]);

  useEffect(() => {
    if (!placeRoute || !routeDestination || !userLocation || routeLoading) return;
    const firstPoint = placeRoute.path[0];
    if (!firstPoint) return;
    const movedFromRouteStart = calculateDistance(userLocation, {
      lat: firstPoint.latitude,
      lng: firstPoint.longitude,
    }) * 1_000;
    if (movedFromRouteStart < ROUTE_REFRESH_DISTANCE_METERS) return;

    const delay = Math.max(0, ROUTE_REFRESH_MS - (Date.now() - placeRoute.generatedAt));
    const timeout = window.setTimeout(() => {
      if (document.visibilityState === 'visible') {
        void loadPlaceRoute(routeDestination, placeRoute.mode, true);
      }
    }, delay);
    return () => window.clearTimeout(timeout);
  }, [loadPlaceRoute, placeRoute, routeDestination, routeLoading, userLocation]);

  useEffect(() => {
    scrollMainContentToTop();
  }, [activeTab, scrollMainContentToTop]);

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
            openHours: data.openHours || data.opening_hours || data['giờ mở cửa'] || data.giờ_mở_cửa,
            priceRange: data.priceRange || data['phạm vi giá'] || data.phạm_vi_giá || data.price_range,
            description: data.description || data['Sự miêu tả'] || data.Sự_miêu_tả,
            phone: data.phone || '',
            images: Array.isArray(data.images) ? data.images : [],
            amenities: Array.isArray(data.amenities) ? data.amenities : [],
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
        // Index đang build hoặc không có events - không show error, chỉ set empty
        if (error.code === 'failed-precondition' || error.message?.includes('index')) {
          setEvents([]);
          logger.log('Events index building, showing empty state');
        } else {
          setError('Không thể tải danh sách sự kiện');
        }
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

  const nearbyPlaces = useMemo(() => {
    if (!userLocation) return validPlaces;
    return sortByDistance(validPlaces.map((place) => ({
      ...place,
      distance: calculateDistance(userLocation, place.location),
    })));
  }, [userLocation, validPlaces]);

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
            <p className="mb-2 flex items-center gap-1 text-sm text-gray-600 dark:text-gray-400">
              <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
              {place.location?.address || 'Chưa có địa chỉ'}
            </p>
            
            <div className="flex items-center gap-4 text-sm mb-2">
              <span className="flex items-center gap-1">
                <Star className="h-4 w-4 fill-amber-400 text-amber-500" aria-hidden="true" />
                {getRating(place).toFixed(1)}
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
          className="flex items-center gap-1.5 rounded-2xl p-1 overflow-x-auto"
          style={{
            backgroundColor: theme === 'dark' ? 'rgba(31,41,55,0.8)' : '#ffffff',
            boxShadow: theme === 'dark'
              ? 'inset 0 1px 3px rgba(0,0,0,0.4), 0 1px 0 rgba(255,255,255,0.04)'
              : 'inset 0 1px 3px rgba(0,0,0,0.06), 0 1px 0 rgba(255,255,255,0.8)',
          }}
        >
          {[
            { tab: 'map',    icon: <MapPin className="w-4 h-4" />,      label: 'Bản đồ',   color: 'from-emerald-500 to-teal-500' },
            { tab: 'people', icon: <Users className="w-4 h-4" />,       label: 'Bạn bè',   color: 'from-indigo-500 to-violet-500' },
            { tab: 'list',   icon: <Navigation className="w-4 h-4" />,  label: 'Địa điểm', color: 'from-indigo-500 to-violet-500' },
            { tab: 'food',   icon: <Utensils className="w-4 h-4" />,    label: 'Ăn gần',    color: 'from-orange-500 to-rose-500' },
            { tab: 'ai',     icon: <Bot className="w-4 h-4" />,         label: 'AI',        color: 'from-violet-500 to-purple-600' },
            { tab: 'rental', icon: <Home className="w-4 h-4" />,        label: 'Tìm Trọ',  color: 'from-orange-400 to-rose-500' },
          ].map(({ tab, icon, label, color }) => (
            <button
              key={tab}
              onClick={() => handleTabChange(tab as ExploreTab)}
              className={`flex-none sm:flex-1 min-w-[68px] flex items-center justify-center gap-1.5 py-2 px-1 rounded-xl font-bold text-xs sm:text-sm transition-all duration-200 active:scale-95 ${
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
      {isLoading && activeTab !== 'people' && activeTab !== 'food' && (
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

      {error && !isLoading && activeTab !== 'people' && activeTab !== 'food' && (
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

      {!isLoading && !error && places.length === 0 && activeTab !== 'people' && activeTab !== 'food' && (
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
      {(activeTab === 'people' || activeTab === 'food' || (!isLoading && !error && places.length > 0)) && (
        <div className="flex-1 flex flex-col relative overflow-hidden">
          {activeTab === 'map' && (
            <div className="absolute inset-0 z-0">
              {/* Dynamic Places Counter Badge - Top Left */}
              {!placeRoute && <div
                onClick={() => {
                  // Scroll to list
                  if (activeTab === 'map') {
                    handleTabChange('list');
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
              </div>}

              {routeDestination && (
                <div className="absolute left-3 right-3 top-3 z-[900] rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-xl backdrop-blur dark:border-slate-700 dark:bg-slate-900/95 sm:left-4 sm:right-auto sm:w-[390px]">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[11px] font-bold uppercase tracking-wide text-indigo-600 dark:text-indigo-300">{routeLoading ? 'Đang tìm đường…' : 'Chỉ đường'}</p>
                      <h3 className="truncate text-sm font-black text-slate-900 dark:text-white">Đến {routeDestination.name}</h3>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        {placeRoute ? `${formatDistance(placeRoute.distanceMeters / 1_000)} · ${formatRouteDuration(placeRoute.durationSeconds)}` : routeLoading ? 'Đang lấy vị trí và tính tuyến…' : 'Chưa có tuyến đường'}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        routeRequestRef.current += 1;
                        setRouteLoading(false);
                        setPlaceRoute(null);
                        setRouteDestination(null);
                        setRouteError(null);
                        setMapFocus(userLocation);
                        setFollowUser(true);
                      }}
                      className="rounded-lg bg-slate-100 p-2 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                      aria-label="Đóng chỉ đường"
                    ><X className="h-4 w-4" /></button>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    {ROUTE_MODES.map(({ value, label, Icon }) => (
                      <button
                        key={value}
                        type="button"
                        disabled={routeLoading}
                        onClick={() => {
                          setRouteMode(value);
                          void loadPlaceRoute(routeDestination, value);
                        }}
                        className={`min-h-9 rounded-xl border px-2 text-[11px] font-bold ${routeMode === value ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-200' : 'border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300'}`}
                      >
                        <span className="inline-flex items-center gap-1"><Icon className="h-3.5 w-3.5" />{label}</span>
                      </button>
                    ))}
                  </div>
                  <button type="button" onClick={() => { setSelectedPlace(routeDestination); setPanelOpen(true); }} className="mt-2 text-xs font-bold text-indigo-700 dark:text-indigo-300">Xem thông tin địa điểm</button>
                  {routeError && <p className="mt-2 text-xs text-rose-600 dark:text-rose-300">{routeError}</p>}
                </div>
              )}

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
                    touchZoom
                    doubleClickZoom
                    scrollWheelZoom
                    dragging={true}
                    // Performance optimizations for mobile
                    zoomAnimation={!isMobile} // Disable zoom animation on mobile
                    fadeAnimation={!isMobile} // Disable fade animation on mobile
                    markerZoomAnimation={!isMobile} // Disable marker zoom animation on mobile
                    worldCopyJump
                    attributionControl={false}
                    whenReady={() => setIsMapReady(true)}
                  >
                  <AttributionControl position="bottomright" prefix={false} />
                  <BoundsTracker onBoundsChange={setMapBounds} />
                  <MapViewportController
                    currentPosition={userLocation}
                    focusPosition={mapFocus}
                    routePath={placeRoute?.path}
                    followUser={followUser}
                    onFollowChange={setFollowUser}
                    recenterToken={recenterToken}
                  />
                  <TileLayer
                    attribution={MAP_TILE_ATTRIBUTION}
                    url={getMapTileUrl()}
                    maxZoom={19}
                    minZoom={2}
                    keepBuffer={isMobile ? 1 : 2}
                    updateInterval={isMobile ? 200 : 100}
                    className={theme === 'dark' ? 'map-tiles-dark' : undefined}
                  />

                  {placeRoute && (
                    <Polyline
                      positions={placeRoute.path.map((item) => [item.latitude, item.longitude])}
                      pathOptions={{ color: '#4f46e5', weight: 6, opacity: 0.92 }}
                    />
                  )}
                  {userLocation && (
                    <>
                      {userAccuracy && (
                        <Circle
                          center={[userLocation.lat, userLocation.lng]}
                          radius={userAccuracy}
                          pathOptions={{ color: '#2563eb', fillColor: '#60a5fa', fillOpacity: 0.12, weight: 1 }}
                        />
                      )}
                      <Marker position={[userLocation.lat, userLocation.lng]} icon={currentLocationIcon}>
                        <Popup>Vị trí hiện tại của bạn{userAccuracy ? ` · sai số khoảng ${Math.round(userAccuracy)} m` : ''}</Popup>
                      </Marker>
                    </>
                  )}
                  {routeDestination && (
                    <Marker position={[routeDestination.location.lat, routeDestination.location.lng]} icon={DefaultIcon}>
                      <Popup><strong>{routeDestination.name}</strong></Popup>
                    </Marker>
                  )}

                  <MarkerClusterGroup
                    chunkedLoading
                    maxClusterRadius={isMobile ? 52 : 44}
                    showCoverageOnHover={false}
                    removeOutsideVisibleBounds
                    iconCreateFunction={(cluster) => {
                      const count = cluster.getChildCount();
                      const size = count > 99 ? 50 : count > 9 ? 46 : 42;
                      return divIcon({
                        html: `<span>${count}</span>`,
                        className: 'tvu-marker-cluster',
                        iconSize: point(size, size, true),
                      });
                    }}
                  >
                    {/* Group nearby pins so dense Trà Vinh data stays readable. */}
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
                          onMarkerClick={handlePlaceSelect}
                          onCheckInClick={(place) => {
                            setSelectedPlace(place);
                            setShowCheckInModal(true);
                          }}
                        />
                      );
                    })}
                  </MarkerClusterGroup>
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
              <div className="absolute bottom-6 right-4 flex flex-col gap-3 z-[1000] sm:right-6">
                <button
                  type="button"
                  onClick={() => {
                    if (userLocation) {
                      setMapFocus({ ...userLocation });
                      setFollowUser(true);
                      setRecenterToken((value) => value + 1);
                    } else {
                      void requestCurrentLocation();
                    }
                  }}
                  disabled={locating}
                  className={`flex h-12 w-12 items-center justify-center rounded-full border bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900 ${followUser ? 'text-blue-600 ring-4 ring-blue-500/15' : 'text-slate-600 dark:text-slate-300'}`}
                  title={placeRoute ? 'Xem toàn tuyến' : 'Về vị trí của tôi'}
                >
                  {locating ? <Loader2 className="h-5 w-5 animate-spin" /> : <LocateFixed className="h-5 w-5" />}
                </button>
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
              onPlaceSelect={handlePlaceSelect}
              onCheckIn={(place) => {
                setSelectedPlace(place);
                setShowCheckInModal(true);
              }}
              userLocation={userLocation}
              selectedCategory={selectedCategory}
              onCategoryChange={setSelectedCategory}
              resetScrollKey={listKey}
              onProfileClick={onProfileClick}
            />
          )}

          {activeTab === 'people' && (
            <StudentMap
              currentUser={currentUser}
              currentProfile={currentProfile}
              places={places}
              onProfileClick={onProfileClick}
            />
          )}

          {activeTab === 'food' && (
            <FoodNearby
              places={places}
              userLocation={userLocation}
              locating={locating}
              onRequestLocation={requestCurrentLocation}
              onSelect={handlePlaceSelect}
            />
          )}

          {activeTab === 'rental' && (
            <RentalList currentUser={currentUser} userLocation={userLocation} locating={locating} onRequestLocation={requestCurrentLocation} />
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
          currentUser={currentUser}
          onClose={() => {
            setPanelOpen(false);
            setSelectedPlace(null);
          }}
          onOpenMap={() => {
            setMapFocus({ lat: selectedPlace.location.lat, lng: selectedPlace.location.lng });
            setFollowUser(false);
            setPanelOpen(false);
            handleTabChange('map');
          }}
          onRoute={() => void loadPlaceRoute(selectedPlace, routeMode)}
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
