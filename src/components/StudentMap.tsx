import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import { divIcon, latLngBounds } from 'leaflet';
import {
  AttributionControl,
  Circle,
  MapContainer,
  Marker,
  Polyline,
  TileLayer,
  Tooltip,
  Popup,
  useMap,
  useMapEvents,
} from 'react-leaflet';
import { getMapTileUrl, MAP_TILE_ATTRIBUTION } from '../utils/mapTiles';
import {
  BellRing,
  Bike,
  Car,
  Clock3,
  Footprints,
  GraduationCap,
  LocateFixed,
  MapPin,
  MessageCircle,
  Navigation,
  RefreshCw,
  Route as RouteIcon,
  ShieldCheck,
  UserRound,
  Users,
  Music,
} from 'lucide-react';
import { db, collection, query, where, onSnapshot } from '../firebase';
import { CreateStationModal } from './CreateStationModal';
import { MusicStationPopup } from './MusicStationPopup';
import { toast } from 'sonner';
import type {
  LocationPreferences,
  LocationVisibility,
  Place,
  StudentProfile,
  VisibleStudentLocation,
  MusicStation,
} from '../types';
import {
  getStudentRoute,
  getVisibleStudentLocations,
  requestPreciseLocation,
  stopLiveLocation,
  subscribeLocationPreferences,
  updateLiveLocation,
  type StudentRoute,
  type StudentRouteMode,
} from '../services/liveLocationService';
import { calculateDistance, calculateDistanceMeters, formatDistance } from '../utils/locationUtils';
import { isMajorMatch } from '../utils/matchingUtils';
import { useTheme } from '../contexts/ThemeContext';
import {
  formatRouteDuration,
  presentStudentDistance,
  routeInstruction,
  type StudentLocationPrecision,
} from '../utils/studentLocationPresentation';
import {
  geolocationSample,
  isRecentRouteOrigin,
  requestFreshGeolocation,
  shouldAcceptGeolocationSample,
  watchResponsiveGeolocation,
  type PreciseGeolocation,
} from '../utils/geolocation';
import {
  buildVisibleStudentMapPoints,
  escapeMarkerAttribute,
  safeStudentMarkerPhotoURL,
  studentMarkerInitials,
} from '../utils/studentMapMarkers';

interface StudentMapProps {
  currentUser: User;
  currentProfile: StudentProfile | null;
  places: Place[];
  onProfileClick?: (uid: string) => void;
}

const DEFAULT_MAP_CENTER: [number, number] = [9.9345, 106.3461];
const LOCATION_REFRESH_MS = 15_000;
const FOCUSED_LOCATION_REFRESH_MS = 4_000;
const ROUTE_REFRESH_MS = 20_000;
const ROUTE_REFRESH_DISTANCE_METERS = 25;

const ROUTE_MODES: Array<{
  value: StudentRouteMode;
  label: string;
  Icon: typeof Footprints;
}> = [
  { value: 'walking', label: 'Đi bộ', Icon: Footprints },
  { value: 'cycling', label: 'Xe đạp', Icon: Bike },
  { value: 'driving', label: 'Xe máy / ô tô', Icon: Car },
];

const VISIBILITY_OPTIONS: Array<{
  value: Exclude<LocationVisibility, 'off'>;
  title: string;
  description: string;
  precision: string;
}> = [
  {
    value: 'friends',
    title: 'Chỉ bạn bè',
    description: 'Chỉ những người đã kết bạn hai chiều.',
    precision: 'Làm tròn khoảng 10 m',
  },
  {
    value: 'major',
    title: 'Bạn bè và cùng ngành',
    description: 'Sinh viên cùng ngành thấy khu vực gần đúng.',
    precision: 'Người cùng ngành: khoảng 100 m',
  },
  {
    value: 'tvu',
    title: 'Sinh viên TVU',
    description: 'Mọi sinh viên đã đăng nhập chỉ thấy khu vực rộng.',
    precision: 'Toàn TVU: khoảng 1 km',
  },
];

const markerIconCache = new Map<string, ReturnType<typeof divIcon>>();
const markerIcon = (
  kind: 'own' | 'friend' | 'major' | 'tvu',
  isMoving = false,
  photoURL?: string | null,
  fullName?: string,
) => {
  const safePhotoURL = safeStudentMarkerPhotoURL(photoURL);
  const initials = studentMarkerInitials(fullName);
  const cacheKey = `${kind}:${isMoving}:${safePhotoURL || ''}:${initials}`;
  const cached = markerIconCache.get(cacheKey);
  if (cached) return cached;
  const colors = {
    own: ['#4f46e5', '#c7d2fe'],
    friend: ['#059669', '#a7f3d0'],
    major: ['#7c3aed', '#ddd6fe'],
    tvu: ['#475569', '#cbd5e1'],
  } as const;
  const [background, ring] = colors[kind];
  const size = 44;
  const icon = divIcon({
    className: `student-map-marker${isMoving ? ' student-map-marker--moving' : ''}`,
    html: safePhotoURL
      ? `<span style="display:block;width:44px;height:44px;overflow:hidden;border-radius:9999px;background:${background};border:3px solid white;box-shadow:0 0 0 4px ${ring},0 6px 16px rgba(15,23,42,.28)"><img src="${escapeMarkerAttribute(safePhotoURL)}" alt="" referrerpolicy="no-referrer" style="width:100%;height:100%;object-fit:cover" /></span>`
      : `<span aria-hidden="true" style="display:flex;width:44px;height:44px;align-items:center;justify-content:center;border-radius:9999px;background:${background};color:white;border:3px solid white;box-shadow:0 0 0 4px ${ring},0 6px 16px rgba(15,23,42,.28);font:800 13px/1 system-ui,sans-serif;letter-spacing:.02em">${initials}</span>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
  if (markerIconCache.size > 500) markerIconCache.clear();
  markerIconCache.set(cacheKey, icon);
  return icon;
};

const formatLastShared = (timestamp: number) => {
  const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60_000));
  if (minutes < 1) return 'Vừa cập nhật';
  if (minutes < 60) return `${minutes} phút trước`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `${hours} giờ trước` : `${Math.floor(hours / 24)} ngày trước`;
};

const StudentMapViewport: React.FC<{
  center: [number, number];
  visiblePoints: Array<[number, number]>;
  focus?: [number, number] | null;
  routePath?: StudentRoute['path'];
  followUser: boolean;
  onFollowChange: (following: boolean) => void;
  recenterToken: number;
}> = ({ center, visiblePoints, focus, routePath, followUser, onFollowChange, recenterToken }) => {
  const map = useMap();
  const visiblePointsSignature = visiblePoints
    .map(([latitude, longitude]) => `${latitude.toFixed(6)},${longitude.toFixed(6)}`)
    .join('|');

  useMapEvents({ dragstart: () => onFollowChange(false) });

  useEffect(() => {
    if (routePath && routePath.length > 1) {
      const bounds = latLngBounds(routePath.map((point) => [point.latitude, point.longitude]));
      bounds.extend(center);
      const narrow = map.getSize().x < 640;
      map.fitBounds(bounds, {
        paddingTopLeft: narrow ? [24, 150] : [310, 30],
        paddingBottomRight: [24, 60],
        maxZoom: 17,
      });
    }
  }, [map, routePath]);

  useEffect(() => {
    if (routePath && routePath.length > 1) return;
    if (focus) {
      if (focus[0] === center[0] && focus[1] === center[1]) {
        map.flyTo(focus, Math.max(map.getZoom(), 16), { duration: 0.35 });
      } else {
        map.fitBounds(latLngBounds([center, focus]), {
          paddingTopLeft: map.getSize().x < 640 ? [24, 150] : [310, 30],
          paddingBottomRight: [24, 60],
          maxZoom: 17,
          animate: true,
        });
      }
    }
  }, [center[0], center[1], focus?.[0], focus?.[1], map, routePath?.length]);

  useEffect(() => {
    if (!followUser || focus) return;
    if (routePath?.length) {
      if (!map.getBounds().pad(-0.22).contains(center)) map.panTo(center, { animate: true, duration: 0.3 });
      return;
    }
    if (visiblePoints.length > 1) {
      map.fitBounds(latLngBounds(visiblePoints), {
        paddingTopLeft: map.getSize().x < 640 ? [28, 84] : [56, 48],
        paddingBottomRight: [28, 72],
        maxZoom: 17,
        animate: true,
        duration: 0.35,
      });
      return;
    }
    map.flyTo(visiblePoints[0] || center, Math.max(map.getZoom(), 16), { duration: 0.35 });
  }, [center[0], center[1], focus?.[0], focus?.[1], followUser, map, routePath?.length, visiblePointsSignature]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!recenterToken) return;
    if (routePath && routePath.length > 1) {
      map.fitBounds(latLngBounds([
        ...routePath.map((point) => [point.latitude, point.longitude] as [number, number]),
        center,
      ]), { padding: [36, 36], maxZoom: 17 });
    } else map.flyTo(center, Math.max(map.getZoom(), 15), { duration: 0.45 });
  }, [map, recenterToken]);

  return null;
};

export const StudentMap: React.FC<StudentMapProps> = ({
  currentUser,
  currentProfile,
  places,
  onProfileClick,
}) => {
  const { theme } = useTheme();
  const [preferences, setPreferences] = useState<LocationPreferences>({
    uid: currentUser.uid,
    visibility: 'off',
    encounterAlertsEnabled: false,
  });
  const [draftVisibility, setDraftVisibility] = useState<Exclude<LocationVisibility, 'off'>>('friends');
  const [draftEncounters, setDraftEncounters] = useState(false);
  const [locations, setLocations] = useState<VisibleStudentLocation[]>([]);
  const [selectedLocation, setSelectedLocation] = useState<VisibleStudentLocation | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastLoadedAt, setLastLoadedAt] = useState(0);
  const [routeMode, setRouteMode] = useState<StudentRouteMode>('walking');
  const [studentRoute, setStudentRoute] = useState<StudentRoute | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [localPosition, setLocalPosition] = useState<PreciseGeolocation | null>(null);
  const [followUser, setFollowUser] = useState(true);
  const [recenterToken, setRecenterToken] = useState(0);

  // --- Music Station States ---
  const [musicStations, setMusicStations] = useState<MusicStation[]>([]);
  const [isCreateStationModalOpen, setIsCreateStationModalOpen] = useState(false);

  const loadingLocationsRef = useRef(false);
  const loadingFocusedLocationRef = useRef(false);
  const routeRequestRef = useRef(0);
  const localPositionRef = useRef<PreciseGeolocation | null>(null);

  const sharingActive = preferences.visibility !== 'off';

  useEffect(() => subscribeLocationPreferences(currentUser.uid, (next) => {
    setPreferences(next);
    if (next.visibility !== 'off') setDraftVisibility(next.visibility);
    setDraftEncounters(next.encounterAlertsEnabled);
  }, (preferenceError) => {
    console.warn('Could not load location preferences:', preferenceError);
    setError('Chưa thể đọc cài đặt chia sẻ vị trí.');
  }), [currentUser.uid]);

  // --- MUSIC STATION EFFECTS ---
  useEffect(() => {
    const stationsRef = collection(db, 'musicStations');
    const now = new Date();
    const q = query(
      stationsRef,
      where('expiresAt', '>', now)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const stations: MusicStation[] = [];
      snapshot.forEach((doc) => {
        stations.push({ id: doc.id, ...doc.data() } as MusicStation);
      });
      setMusicStations(stations);
    }, (error) => {
      console.error('Error fetching music stations:', error);
    });

    return () => unsubscribe();
  }, []);

  const loadLocations = useCallback(async () => {
    if (!sharingActive) {
      setLocations([]);
      return;
    }
    if (loadingLocationsRef.current) return;
    loadingLocationsRef.current = true;
    setLoading(true);
    try {
      const nextLocations = await getVisibleStudentLocations();
      const activeLocations = nextLocations.filter((location) => location.expiresAt > Date.now());
      setLocations(activeLocations);
      setSelectedLocation((selected) => (
        selected
          ? activeLocations.find((location) => location.uid === selected.uid) || null
          : null
      ));
      setLastLoadedAt(Date.now());
      setError(null);
    } catch (locationError) {
      console.error('Could not load student map:', locationError);
      setError('Chưa thể tải vị trí bạn bè. Hãy thử lại sau.');
    } finally {
      loadingLocationsRef.current = false;
      setLoading(false);
    }
  }, [sharingActive]);

  useEffect(() => {
    void loadLocations();
    if (!sharingActive) return;
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') void loadLocations();
    }, LOCATION_REFRESH_MS);
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') void loadLocations();
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [loadLocations, sharingActive]);

  useEffect(() => {
    if (!sharingActive || !navigator.geolocation) return;
    return watchResponsiveGeolocation((position) => {
      const sample = geolocationSample(position);
      if (!shouldAcceptGeolocationSample(localPositionRef.current, sample)) return;
      localPositionRef.current = sample;
      setLocalPosition(sample);
    });
  }, [sharingActive]);

  const selectedUid = selectedLocation?.isOwn ? null : selectedLocation?.uid || null;

  const loadFocusedLocation = useCallback(async (focusUid: string) => {
    if (!sharingActive || loadingFocusedLocationRef.current) return;
    loadingFocusedLocationRef.current = true;
    try {
      const focusedLocations = await getVisibleStudentLocations(focusUid);
      const activeLocations = focusedLocations.filter((location) => location.expiresAt > Date.now());
      const focusedStudent = activeLocations.find((location) => location.uid === focusUid) || null;
      setLocations((current) => {
        const merged = new Map(current
          .filter((location) => location.uid !== focusUid)
          .map((location) => [location.uid, location]));
        activeLocations.forEach((location) => merged.set(location.uid, location));
        return [...merged.values()];
      });
      setSelectedLocation(focusedStudent);
    } catch (focusedLocationError) {
      console.warn('Could not refresh focused student location:', focusedLocationError);
    } finally {
      loadingFocusedLocationRef.current = false;
    }
  }, [sharingActive]);

  useEffect(() => {
    if (!selectedUid) return;
    void loadFocusedLocation(selectedUid);
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') void loadFocusedLocation(selectedUid);
    }, FOCUSED_LOCATION_REFRESH_MS);
    return () => window.clearInterval(interval);
  }, [loadFocusedLocation, selectedUid]);

  const saveSharing = async () => {
    setSaving(true);
    try {
      const position = await requestPreciseLocation();
      const local = {
        lat: position.latitude,
        lng: position.longitude,
        accuracy: position.accuracy,
        observedAt: Date.now(),
        speed: position.speed,
        heading: position.heading,
      };
      localPositionRef.current = local;
      setLocalPosition(local);
      await updateLiveLocation({
        ...position,
        visibility: draftVisibility,
        encounterAlertsEnabled: draftEncounters,
      });
      setPreferences({
        uid: currentUser.uid,
        visibility: draftVisibility,
        encounterAlertsEnabled: draftEncounters,
      });
      toast.success(sharingActive ? 'Đã cập nhật phạm vi chia sẻ.' : 'Đã bắt đầu chia sẻ vị trí an toàn.');
      await loadLocations();
    } catch (sharingError) {
      toast.error(sharingError instanceof Error ? sharingError.message : 'Chưa thể bật chia sẻ vị trí.');
    } finally {
      setSaving(false);
    }
  };

  const stopSharing = async () => {
    setSaving(true);
    try {
      await stopLiveLocation();
      setPreferences({ uid: currentUser.uid, visibility: 'off', encounterAlertsEnabled: false });
      setLocations([]);
      setSelectedLocation(null);
      setStudentRoute(null);
      toast.success('Đã dừng chia sẻ và xóa vị trí sống khỏi bản đồ.');
    } catch (sharingError) {
      console.error('Could not stop live location:', sharingError);
      toast.error('Chưa thể dừng chia sẻ. Vui lòng thử lại.');
    } finally {
      setSaving(false);
    }
  };

  const ownLocation = locations.find((location) => location.isOwn);
  const center = localPosition
    ? [localPosition.lat, localPosition.lng] as [number, number]
    : ownLocation
    ? [ownLocation.latitude, ownLocation.longitude] as [number, number]
    : DEFAULT_MAP_CENTER;
  const visibleMapPoints = useMemo(() => (
    buildVisibleStudentMapPoints(center, locations, localPosition)
  ), [center[0], center[1], localPosition?.lat, localPosition?.lng, locations]);

  const nearestPlace = useMemo(() => {
    if (!selectedLocation) return null;
    const nearby = places
      .filter((place) => Number.isFinite(place.location?.lat) && Number.isFinite(place.location?.lng))
      .map((place) => ({
        place,
        distance: calculateDistance(
          { lat: selectedLocation.latitude, lng: selectedLocation.longitude },
          { lat: place.location.lat, lng: place.location.lng },
        ),
      }))
      .sort((left, right) => left.distance - right.distance)[0];
    return nearby && nearby.distance <= 1 ? nearby : null;
  }, [places, selectedLocation]);

  const relationFor = (location: VisibleStudentLocation) => {
    if (location.isOwn) return { label: 'Bạn', kind: 'own' as const };
    if (location.isFriend) return { label: 'Bạn bè', kind: 'friend' as const };
    if (currentProfile && isMajorMatch(currentProfile.major, location.major)) {
      return { label: 'Cùng ngành', kind: 'major' as const };
    }
    return { label: 'Sinh viên TVU', kind: 'tvu' as const };
  };

  const distanceFor = (location: VisibleStudentLocation) => {
    if ((!ownLocation && !localPosition) || location.isOwn) return null;
    const distanceMeters = calculateDistanceMeters(
      localPosition || { lat: ownLocation!.latitude, lng: ownLocation!.longitude },
      { lat: location.latitude, lng: location.longitude },
    );
    const relation = relationFor(location);
    const precision: StudentLocationPrecision = relation.kind === 'friend'
      ? 'friend'
      : relation.kind === 'major'
        ? 'major'
        : 'tvu';
    return presentStudentDistance(distanceMeters, precision);
  };

  const selectedDistance = selectedLocation ? distanceFor(selectedLocation) : null;

  const loadStudentRoute = useCallback(async (
    target: VisibleStudentLocation,
    mode: StudentRouteMode,
    quiet = false,
  ) => {
    if (!target.isFriend || target.isOwn) return;
    const requestId = ++routeRequestRef.current;
    setRouteLoading(true);
    if (!quiet) setRouteError(null);
    try {
      const position = isRecentRouteOrigin(localPositionRef.current)
        ? localPositionRef.current
        : await requestFreshGeolocation();
      if (requestId !== routeRequestRef.current) return;
      const local = position;
      localPositionRef.current = local;
      setLocalPosition(local);
      const nextRoute = await getStudentRoute(target.uid, mode, {
        latitude: position.lat,
        longitude: position.lng,
        accuracy: position.accuracy,
      });
      if (requestId !== routeRequestRef.current) return;
      setStudentRoute(nextRoute);
      setRouteError(null);
    } catch (routeRequestError) {
      if (requestId !== routeRequestRef.current) return;
      console.error('Could not load student route:', routeRequestError);
      setRouteError('Chưa thể tạo tuyến đường lúc này. Vị trí trên bản đồ vẫn tiếp tục cập nhật.');
      if (!quiet) toast.error('Chưa thể tạo tuyến đường. Hãy thử lại sau.');
    } finally {
      if (requestId === routeRequestRef.current) setRouteLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedLocation) return;
    routeRequestRef.current += 1;
    setRouteLoading(false);
    setStudentRoute(null);
    setRouteError(null);
  }, [selectedLocation?.uid]);

  const selectStudent = (location: VisibleStudentLocation) => {
    routeRequestRef.current += 1;
    setSelectedLocation(location);
    setRouteLoading(false);
    setStudentRoute(null);
    setRouteError(null);
    // Keep the selected student in view. Route fitting takes over as soon as
    // the route arrives; GPS must not immediately drag the map back to us.
    setFollowUser(false);
    if (location.isFriend && !location.isOwn) void loadStudentRoute(location, routeMode);
  };

  useEffect(() => {
    if (
      !studentRoute
      || !selectedLocation
      || studentRoute.targetUid !== selectedLocation.uid
    ) return;

    const routeStart = studentRoute.path[0];
    const movedFromRouteStart = localPosition && routeStart
      ? calculateDistanceMeters(localPosition, {
        lat: routeStart.latitude,
        lng: routeStart.longitude,
      })
      : 0;
    const targetMoved = selectedLocation.updatedAt > studentRoute.targetUpdatedAt;
    if (!targetMoved && movedFromRouteStart < ROUTE_REFRESH_DISTANCE_METERS) return;

    const delay = Math.max(0, ROUTE_REFRESH_MS - (Date.now() - studentRoute.generatedAt));
    const timeout = window.setTimeout(() => {
      if (document.visibilityState === 'visible') {
        void loadStudentRoute(selectedLocation, studentRoute.mode, true);
      }
    }, delay);
    return () => window.clearTimeout(timeout);
  }, [loadStudentRoute, localPosition, selectedLocation, studentRoute]);

  return (
    <div className="flex-1 overflow-y-auto bg-slate-50 p-3 pb-24 dark:bg-slate-950 sm:p-5">
      <div className="mx-auto max-w-6xl space-y-4">
        <section className={`rounded-3xl border border-indigo-200 bg-white shadow-sm dark:border-indigo-900 dark:bg-slate-900 ${sharingActive ? 'p-3 sm:p-4' : 'p-5'}`}>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-2xl">
              <div className="flex items-center gap-2 text-sm font-bold text-indigo-600 dark:text-indigo-300">
                <ShieldCheck className="h-5 w-5" /> Bản đồ sinh viên có kiểm soát
              </div>
              <h1 className={`${sharingActive ? 'mt-1 text-lg' : 'mt-2 text-2xl'} font-black text-slate-950 dark:text-white`}>Bạn bè đang chia sẻ vị trí</h1>
              {!sharingActive && <p className="mt-1 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                Bản đồ hoạt động ở mọi nơi. Bạn quyết định ai được thấy mình; tọa độ gốc không được gửi cho trình duyệt của người khác và tự hết hạn nếu ứng dụng ngừng cập nhật.
              </p>}
            </div>
            <div className={`rounded-2xl px-4 py-3 text-sm font-bold ${sharingActive ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}>
              <span className="inline-flex items-center gap-2"><LocateFixed className="h-4 w-4" />{sharingActive ? 'Đang chia sẻ' : 'Đang ẩn vị trí'}</span>
            </div>
          </div>

          <details key={sharingActive ? 'sharing' : 'hidden'} open={!sharingActive} className={`${sharingActive ? 'mt-2' : 'mt-4'} group`}>
            <summary className="cursor-pointer text-sm font-bold text-indigo-700 dark:text-indigo-300">{sharingActive ? 'Đổi phạm vi hoặc dừng chia sẻ vị trí' : 'Thiết lập chia sẻ vị trí'}</summary>
          <div className="mt-5 grid gap-3 md:grid-cols-3">
            {VISIBILITY_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setDraftVisibility(option.value)}
                className={`rounded-2xl border p-4 text-left transition ${draftVisibility === option.value ? 'border-indigo-500 bg-indigo-50 ring-2 ring-indigo-500/15 dark:bg-indigo-950/30' : 'border-slate-200 hover:border-indigo-300 dark:border-slate-700 dark:hover:border-indigo-700'}`}
              >
                <strong className="block text-sm text-slate-900 dark:text-white">{option.title}</strong>
                <span className="mt-1 block text-xs leading-relaxed text-slate-500 dark:text-slate-400">{option.description}</span>
                <span className="mt-2 block text-[11px] font-bold text-indigo-600 dark:text-indigo-300">{option.precision}</span>
              </button>
            ))}
          </div>

          <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-2xl bg-slate-50 p-4 dark:bg-slate-800/70">
            <input
              type="checkbox"
              checked={draftEncounters}
              onChange={(event) => setDraftEncounters(event.target.checked)}
              className="mt-1"
            />
            <span>
              <strong className="flex items-center gap-2 text-sm text-slate-900 dark:text-white"><BellRing className="h-4 w-4 text-violet-600" /> Báo khi vừa chạm mặt</strong>
              <span className="mt-1 block text-xs leading-relaxed text-slate-500 dark:text-slate-400">Chỉ báo khi cả hai cùng bật, đều cho phép nhau xuất hiện và ở gần khoảng 35 m. Thiết bị hỗ trợ sẽ rung khi web đang hoạt động.</span>
            </span>
          </label>

          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              disabled={saving}
              onClick={() => void saveSharing()}
              className="min-h-12 flex-1 rounded-xl bg-indigo-600 px-5 text-sm font-black text-white hover:bg-indigo-700 disabled:opacity-60"
            >
              {saving ? 'Đang cập nhật…' : sharingActive ? 'Lưu cài đặt chia sẻ' : 'Bắt đầu chia sẻ'}
            </button>
            {sharingActive && (
              <button
                type="button"
                disabled={saving}
                onClick={() => void stopSharing()}
                className="min-h-12 rounded-xl border border-rose-200 px-5 text-sm font-bold text-rose-600 hover:bg-rose-50 disabled:opacity-60 dark:border-rose-900 dark:hover:bg-rose-950/30"
              >
                Dừng và xóa vị trí
              </button>
            )}
          </div>
          <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">Web chỉ cập nhật khi TVU Connect đang mở. Điểm cuối tự biến mất sau khoảng 15 phút nếu không còn cập nhật.</p>
          </details>
        </section>

        {!sharingActive ? (
          <section className="rounded-3xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center dark:border-slate-700 dark:bg-slate-900">
            <Navigation className="mx-auto h-12 w-12 text-slate-300 dark:text-slate-600" />
            <h2 className="mt-4 text-lg font-black text-slate-900 dark:text-white">Bản đồ đang khóa để bảo vệ riêng tư</h2>
            <p className="mx-auto mt-2 max-w-lg text-sm text-slate-500 dark:text-slate-400">Bật một phạm vi chia sẻ ở trên để xem những người cũng đã tự nguyện xuất hiện. Không có chế độ xem ẩn danh vị trí của người khác.</p>
          </section>
        ) : (
          <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-700">
              <div>
                <h2 className="font-black text-slate-900 dark:text-white">Vị trí đang được chia sẻ</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {loading
                    ? 'Đang làm mới…'
                    : `${locations.length} người đang hiển thị${lastLoadedAt ? ` · ${formatLastShared(lastLoadedAt).toLowerCase()}` : ''}`}
                </p>
              </div>
              <button type="button" onClick={() => void loadLocations()} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 dark:border-slate-700 dark:text-slate-300">Làm mới</button>
            </div>
            {error && <p className="border-b border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200">{error}</p>}
            <div className="relative h-[68dvh] min-h-[420px] w-full sm:h-[62vh]">
              {selectedLocation && !selectedLocation.isOwn && (
                <div className="absolute left-3 right-3 top-3 z-[500] rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-lg backdrop-blur dark:border-slate-700 dark:bg-slate-900/95 sm:right-auto sm:w-72">
                  <p className="truncate text-sm font-black text-slate-900 dark:text-white">{selectedLocation.fullName}</p>
                  <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">{selectedDistance?.label || 'Đang cập nhật khoảng cách'} · {formatLastShared(selectedLocation.updatedAt)}</p>
                  {selectedLocation.isFriend && (
                    <>
                      <p className="mt-1 text-xs font-semibold text-indigo-700 dark:text-indigo-300">
                        {routeLoading ? 'Đang tính đường đi…' : studentRoute?.targetUid === selectedLocation.uid
                          ? `${formatDistance(studentRoute.distanceMeters / 1_000)} đường đi · ${formatRouteDuration(studentRoute.durationSeconds)}`
                          : routeError || 'Đang chờ tuyến đường'}
                      </p>
                      <div className="mt-2 flex gap-1.5">
                        {ROUTE_MODES.map(({ value, label }) => (
                          <button key={value} type="button" disabled={routeLoading} onClick={() => {
                            setRouteMode(value);
                            void loadStudentRoute(selectedLocation, value);
                          }} className={`rounded-lg px-2 py-1 text-[10px] font-bold disabled:opacity-60 ${routeMode === value ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200'}`}>{label}</button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}
              <MapContainer center={center} zoom={15} minZoom={2} worldCopyJump className="h-full w-full" scrollWheelZoom touchZoom doubleClickZoom attributionControl={false}>
                <AttributionControl position="bottomright" prefix={false} />
                <StudentMapViewport
                  center={center}
                  visiblePoints={visibleMapPoints}
                  focus={selectedLocation
                    ? [selectedLocation.latitude, selectedLocation.longitude]
                    : null}
                  routePath={studentRoute?.path}
                  followUser={followUser}
                  onFollowChange={setFollowUser}
                  recenterToken={recenterToken}
                />
                <TileLayer
                  attribution={MAP_TILE_ATTRIBUTION}
                  url={getMapTileUrl()}
                  maxZoom={19}
                  className={theme === 'dark' ? 'map-tiles-dark' : undefined}
                />
                {studentRoute && (
                  <Polyline
                    positions={studentRoute.path.map((point) => [point.latitude, point.longitude])}
                    pathOptions={{ color: '#4f46e5', weight: 6, opacity: 0.9 }}
                  />
                )}
                {selectedLocation && !selectedLocation.isOwn && selectedDistance && (
                  <Circle
                    center={[selectedLocation.latitude, selectedLocation.longitude]}
                    radius={Math.max(selectedDistance.privacyRadiusMeters, selectedLocation.accuracy || 0)}
                    pathOptions={{
                      color: selectedLocation.isFriend ? '#059669' : '#7c3aed',
                      fillColor: selectedLocation.isFriend ? '#34d399' : '#a78bfa',
                      fillOpacity: 0.08,
                      weight: 2,
                    }}
                  />
                )}
                {localPosition && (
                  <Circle
                    center={[localPosition.lat, localPosition.lng]}
                    radius={localPosition.accuracy}
                    pathOptions={{ color: '#2563eb', fillColor: '#60a5fa', fillOpacity: 0.1, weight: 1 }}
                  />
                )}
                {locations.map((location) => {
                  const relation = relationFor(location);
                  const distance = distanceFor(location);
                  const markerPosition: [number, number] = location.isOwn && localPosition
                    ? [localPosition.lat, localPosition.lng]
                    : [location.latitude, location.longitude];
                  return (
                    <Marker
                      key={location.uid}
                      position={markerPosition}
                      icon={markerIcon(
                        relation.kind,
                        location.isMoving,
                        location.photoURL || (location.isOwn ? currentProfile?.photoURL || currentUser.photoURL : null),
                        location.fullName,
                      )}
                      eventHandlers={{ click: () => selectStudent(location) }}
                    >
                      <Tooltip direction="top" offset={[0, -14]} opacity={0.95}>
                        <strong>{location.fullName}</strong>
                        {distance && <span className="block text-xs">{distance.label}</span>}
                      </Tooltip>
                    </Marker>
                  );
                })}

                {/* --- MUSIC STATIONS MARKERS --- */}
                {musicStations.map((station) => (
                  <Marker
                    key={station.id}
                    position={[station.location.lat, station.location.lng]}
                    icon={divIcon({
                      className: 'custom-station-marker',
                      html: `<div style="width:40px;height:40px;border-radius:50%;overflow:hidden;border:3px solid white;box-shadow:0 4px 6px -1px rgb(0 0 0 / 0.1);"><img src="${station.userAvatar || 'https://via.placeholder.com/40'}" style="width:100%;height:100%;object-fit:cover;" /></div><div style="position:absolute;bottom:-4px;right:-4px;background:#a855f7;border-radius:50%;padding:2px;border:2px solid white;"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle></svg></div>`,
                      iconSize: [40, 40],
                      iconAnchor: [20, 20],
                    })}
                  >
                    <Popup className="music-station-popup-container" closeButton={false} offset={[0, -10]}>
                      <MusicStationPopup station={station} />
                    </Popup>
                  </Marker>
                ))}
              </MapContainer>
              <button
                type="button"
                onClick={() => {
                  setFollowUser(true);
                  setRecenterToken((value) => value + 1);
                }}
                className={`absolute bottom-14 right-3 z-[500] flex h-11 w-11 items-center justify-center rounded-full border bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900 ${followUser ? 'text-blue-600 ring-4 ring-blue-500/15' : 'text-slate-600 dark:text-slate-300'}`}
                title={studentRoute ? 'Xem toàn tuyến' : 'Về vị trí của tôi'}
              >
                <LocateFixed className="h-5 w-5" />
              </button>
              <div className="pointer-events-none absolute bottom-3 left-3 z-[500] flex flex-wrap gap-2 rounded-xl bg-white/90 p-2 text-[11px] font-bold text-slate-600 shadow-md backdrop-blur dark:bg-slate-900/90 dark:text-slate-300">
                <span className="text-indigo-600">Bạn</span><span className="text-emerald-600">Bạn bè</span><span className="text-violet-600">Cùng ngành</span><span>Sinh viên TVU</span>
              </div>
            </div>
          </section>
        )}

        {selectedLocation && (
          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
            <div className="flex items-start gap-3">
              {selectedLocation.photoURL ? (
                <img src={selectedLocation.photoURL} alt="" className="h-14 w-14 rounded-2xl object-cover" referrerPolicy="no-referrer" />
              ) : (
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-600 dark:bg-indigo-950"><UserRound className="h-7 w-7" /></div>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-black text-slate-900 dark:text-white">{selectedLocation.fullName}</h3>
                  <span className="rounded-lg bg-indigo-50 px-2 py-1 text-[11px] font-bold text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">{relationFor(selectedLocation).label}</span>
                  {selectedLocation.isMoving && (
                    <span className="rounded-lg bg-emerald-50 px-2 py-1 text-[11px] font-bold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">Đang di chuyển</span>
                  )}
                </div>
                {selectedLocation.major && <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400"><GraduationCap className="h-4 w-4" />{selectedLocation.major}</p>}
                {selectedDistance && <p className="mt-1 flex items-center gap-1.5 text-sm font-bold text-indigo-700 dark:text-indigo-300"><Navigation className="h-4 w-4" />{selectedDistance.label}</p>}
                <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400"><Clock3 className="h-3.5 w-3.5" />Chia sẻ lần cuối: {formatLastShared(selectedLocation.updatedAt)}</p>
                <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400"><MapPin className="h-3.5 w-3.5" />{nearestPlace ? `Gần ${nearestPlace.place.name}` : 'Khu vực hiển thị trên bản đồ'} · vị trí đã làm mờ theo quyền chia sẻ</p>
              </div>
            </div>

            {!selectedLocation.isOwn && !selectedLocation.isFriend && (
              <div className="mt-4 rounded-2xl bg-violet-50 p-3 text-xs leading-relaxed text-violet-800 dark:bg-violet-950/40 dark:text-violet-200">
                Khoảng cách này được tính theo vùng công khai, không phải tọa độ chính xác. Nếu cả hai cùng bật “Báo khi vừa chạm mặt”, hệ thống vẫn có thể báo riêng khi ở trong khoảng 35 m mà không công khai điểm gốc.
              </div>
            )}

            {!selectedLocation.isOwn && selectedLocation.isFriend && (
              <div className="mt-4 rounded-2xl border border-slate-200 p-4 dark:border-slate-700">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h4 className="flex items-center gap-2 text-sm font-black text-slate-900 dark:text-white"><RouteIcon className="h-4 w-4 text-indigo-600" />Chỉ đường trong TVU Connect</h4>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Chỉ hoạt động khi hai bạn vẫn đang chia sẻ vị trí.</p>
                  </div>
                  {studentRoute?.targetUid === selectedLocation.uid && (
                    <button
                      type="button"
                      disabled={routeLoading}
                      onClick={() => void loadStudentRoute(selectedLocation, routeMode)}
                      className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-bold text-indigo-700 hover:bg-indigo-50 disabled:opacity-60 dark:text-indigo-300 dark:hover:bg-indigo-950"
                    >
                      <RefreshCw className={`h-3.5 w-3.5 ${routeLoading ? 'animate-spin' : ''}`} />Cập nhật tuyến
                    </button>
                  )}
                </div>

                <div className="mt-3 grid grid-cols-3 gap-2">
                  {ROUTE_MODES.map(({ value, label, Icon }) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => {
                        setRouteMode(value);
                        if (studentRoute?.targetUid === selectedLocation.uid) {
                          void loadStudentRoute(selectedLocation, value);
                        }
                      }}
                      className={`min-h-10 rounded-xl border px-2 text-xs font-bold transition ${routeMode === value ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-200' : 'border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300'}`}
                    >
                      <span className="inline-flex items-center justify-center gap-1.5"><Icon className="h-3.5 w-3.5" />{label}</span>
                    </button>
                  ))}
                </div>

                {studentRoute?.targetUid !== selectedLocation.uid && (
                  <button
                    type="button"
                    disabled={routeLoading}
                    onClick={() => void loadStudentRoute(selectedLocation, routeMode)}
                    className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 text-sm font-black text-white hover:bg-indigo-700 disabled:opacity-60"
                  >
                    {routeLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Navigation className="h-4 w-4" />}
                    {routeLoading ? 'Đang tìm tuyến…' : 'Tìm đường đến bạn này'}
                  </button>
                )}

                {routeError && <p className="mt-3 rounded-xl bg-rose-50 p-3 text-xs text-rose-700 dark:bg-rose-950/40 dark:text-rose-200">{routeError}</p>}

                {studentRoute?.targetUid === selectedLocation.uid && (
                  <div className="mt-3">
                    <div className="grid grid-cols-2 gap-2">
                      <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800">
                        <span className="block text-[11px] text-slate-500 dark:text-slate-400">Quãng đường</span>
                        <strong className="text-sm text-slate-900 dark:text-white">{formatDistance(studentRoute.distanceMeters / 1_000)}</strong>
                      </div>
                      <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800">
                        <span className="block text-[11px] text-slate-500 dark:text-slate-400">Thời gian dự kiến</span>
                        <strong className="text-sm text-slate-900 dark:text-white">{formatRouteDuration(studentRoute.durationSeconds)}</strong>
                      </div>
                    </div>
                    {studentRoute.steps.length > 0 && (
                      <details className="mt-3 rounded-xl bg-slate-50 p-3 dark:bg-slate-800">
                        <summary className="cursor-pointer text-xs font-bold text-slate-700 dark:text-slate-200">Xem từng chặng đường</summary>
                        <ol className="mt-3 space-y-2">
                          {studentRoute.steps.slice(0, 12).map((step, index) => (
                            <li key={`${step.type}-${index}`} className="flex gap-2 text-xs text-slate-600 dark:text-slate-300">
                              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-[10px] font-black text-indigo-700 dark:bg-indigo-950 dark:text-indigo-200">{index + 1}</span>
                              <span>{routeInstruction(step.type, step.modifier, step.roadName)} · {formatDistance(step.distanceMeters / 1_000)}</span>
                            </li>
                          ))}
                        </ol>
                      </details>
                    )}
                    <p className="mt-3 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">Tuyến dùng dữ liệu OpenStreetMap và điểm đã làm mờ khoảng 10 m; chỉ được tính khi bạn chọn bạn bè đang chia sẻ. Hãy quan sát đường thực tế khi di chuyển.</p>
                  </div>
                )}
              </div>
            )}
            {!selectedLocation.isOwn && onProfileClick && (
              <button onClick={() => onProfileClick(selectedLocation.uid)} className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 text-sm font-black text-white hover:bg-indigo-700"><MessageCircle className="h-4 w-4" />Xem hồ sơ và trò chuyện</button>
            )}
          </section>
        )}

        <section className="grid gap-3 text-xs text-slate-600 dark:text-slate-300 md:grid-cols-3">
          <div className="rounded-2xl bg-white p-4 dark:bg-slate-900"><ShieldCheck className="mb-2 h-5 w-5 text-emerald-600" /><strong className="block text-slate-900 dark:text-white">Không đọc tọa độ gốc</strong><span>Trình duyệt chỉ nhận điểm đã làm mờ và được server cho phép.</span></div>
          <div className="rounded-2xl bg-white p-4 dark:bg-slate-900"><Users className="mb-2 h-5 w-5 text-indigo-600" /><strong className="block text-slate-900 dark:text-white">Quan hệ hai chiều</strong><span>Chế độ bạn bè chỉ hoạt động sau khi lời mời được chấp nhận.</span></div>
          <div className="rounded-2xl bg-white p-4 dark:bg-slate-900"><BellRing className="mb-2 h-5 w-5 text-violet-600" /><strong className="block text-slate-900 dark:text-white">Chạm mặt có đồng thuận</strong><span>Không tạo sự kiện nếu một trong hai người tắt tính năng hoặc chặn nhau.</span></div>
        </section>
      </div>

      {/* FAB: Thêm Trạm Cảm Xúc */}
      <button
        onClick={() => setIsCreateStationModalOpen(true)}
        className="absolute bottom-16 left-4 z-[500] flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-[0_8px_16px_rgba(79,70,229,0.3)] transition-transform hover:scale-105 active:scale-95"
      >
        <Music className="h-6 w-6" />
      </button>

      {isCreateStationModalOpen && (
        <CreateStationModal
          currentUser={currentUser}
          onClose={() => setIsCreateStationModalOpen(false)}
        />
      )}
    </div>
  );
};
