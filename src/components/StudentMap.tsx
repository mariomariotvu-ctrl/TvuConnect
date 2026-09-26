import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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
  X,
} from 'lucide-react';
import { db, collection, query, where, onSnapshot, limit } from '../firebase';
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
import {
  getRuntimeConfig,
  subscribeRuntimeConfig,
} from '../config/runtimeConfig';

interface StudentMapProps {
  currentUser: User;
  currentProfile: StudentProfile | null;
  places: Place[];
  onProfileClick?: (uid: string) => void;
}

const localLocationInspectorEnabled = import.meta.env.DEV
  && typeof window !== 'undefined'
  && ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname);

const DEFAULT_MAP_CENTER: [number, number] = [9.9345, 106.3461];
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
const stationIconCache = new Map<string, ReturnType<typeof divIcon>>();
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

const stationMarkerIcon = (station: MusicStation) => {
  const safePhotoURL = safeStudentMarkerPhotoURL(station.userAvatar);
  const initials = studentMarkerInitials(station.userName);
  const cacheKey = `${safePhotoURL || ''}:${initials}`;
  const cached = stationIconCache.get(cacheKey);
  if (cached) return cached;
  const face = safePhotoURL
    ? `<img src="${escapeMarkerAttribute(safePhotoURL)}" alt="" referrerpolicy="no-referrer" style="width:100%;height:100%;object-fit:cover" />`
    : `<span style="font:800 11px/1 system-ui,sans-serif;color:#5b21b6">${initials}</span>`;
  const icon = divIcon({
    className: 'music-station-marker',
    html: `<span style="position:relative;display:flex;width:40px;height:40px;align-items:center;justify-content:center;overflow:visible;border-radius:9999px;background:white;border:3px solid white;box-shadow:0 0 0 4px #e9d5ff,0 7px 18px rgba(76,29,149,.3)"><span style="display:flex;width:100%;height:100%;align-items:center;justify-content:center;overflow:hidden;border-radius:9999px;background:#f3e8ff">${face}</span><span style="position:absolute;right:-7px;bottom:-5px;display:flex;width:20px;height:20px;align-items:center;justify-content:center;border-radius:9999px;background:#7c3aed;color:white;border:2px solid white;font:800 11px/1 system-ui">♫</span></span>`,
    // Keep a 48px hit area even though the visible marker is slightly smaller.
    // This meets mobile touch-target guidance without making the map look busy.
    iconSize: [48, 48],
    iconAnchor: [24, 48],
    popupAnchor: [0, -51],
  });
  if (stationIconCache.size > 300) stationIconCache.clear();
  stationIconCache.set(cacheKey, icon);
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
  const [runtimeConfig, setRuntimeConfig] = useState(getRuntimeConfig);
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
  const [sharingSettingsOpen, setSharingSettingsOpen] = useState(false);

  // --- Music Station States ---
  const [musicStations, setMusicStations] = useState<MusicStation[]>([]);
  const [isCreateStationModalOpen, setIsCreateStationModalOpen] = useState(false);
  const [selectedStation, setSelectedStation] = useState<MusicStation | null>(null);
  const [useMobileStationSheet, setUseMobileStationSheet] = useState(() => (
    typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(max-width: 639px)').matches
  ));

  const loadingLocationsRef = useRef(false);
  const loadingFocusedLocationRef = useRef(false);
  const routeRequestRef = useRef(0);
  const localPositionRef = useRef<PreciseGeolocation | null>(null);

  const sharingActive = preferences.visibility !== 'off';

  useEffect(() => subscribeRuntimeConfig(setRuntimeConfig), []);

  useEffect(() => {
    if (!sharingSettingsOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSharingSettingsOpen(false);
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [sharingSettingsOpen]);

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
      where('expiresAt', '>', now),
      limit(60),
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

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const media = window.matchMedia('(max-width: 639px)');
    const updateMode = () => setUseMobileStationSheet(media.matches);
    updateMode();
    media.addEventListener?.('change', updateMode);
    return () => media.removeEventListener?.('change', updateMode);
  }, []);

  useEffect(() => {
    if (!selectedStation) return;
    if (!musicStations.some((station) => station.id === selectedStation.id)) setSelectedStation(null);
  }, [musicStations, selectedStation]);

  const loadLocations = useCallback(async () => {
    if (!sharingActive && !localLocationInspectorEnabled) {
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
    if (!sharingActive && !localLocationInspectorEnabled) return;
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') void loadLocations();
    }, runtimeConfig.locationRefreshMs);
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') void loadLocations();
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [loadLocations, runtimeConfig.locationRefreshMs, sharingActive]);

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
    if ((!sharingActive && !localLocationInspectorEnabled) || loadingFocusedLocationRef.current) return;
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
    }, runtimeConfig.focusedLocationRefreshMs);
    return () => window.clearInterval(interval);
  }, [loadFocusedLocation, runtimeConfig.focusedLocationRefreshMs, selectedUid]);

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
      setSharingSettingsOpen(false);
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
      setSharingSettingsOpen(false);
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
  const mapAccessEnabled = sharingActive || localLocationInspectorEnabled;

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

    const delay = Math.max(0, runtimeConfig.routeRefreshMs - (Date.now() - studentRoute.generatedAt));
    const timeout = window.setTimeout(() => {
      if (document.visibilityState === 'visible') {
        void loadStudentRoute(selectedLocation, studentRoute.mode, true);
      }
    }, delay);
    return () => window.clearTimeout(timeout);
  }, [loadStudentRoute, localPosition, runtimeConfig.routeRefreshMs, selectedLocation, studentRoute]);

  return (
    <div className="flex-1 overflow-y-auto bg-gradient-to-b from-indigo-50/70 via-slate-50 to-slate-100 p-2 pb-24 dark:from-indigo-950/20 dark:via-slate-950 dark:to-slate-950 sm:p-5">
      <div className="mx-auto max-w-6xl space-y-3 sm:space-y-4">
        <section className={`overflow-hidden rounded-[1.75rem] border border-white/80 bg-white/90 shadow-[0_16px_50px_rgba(79,70,229,0.08)] backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90 ${sharingActive ? 'p-3 sm:p-4' : 'p-5'}`}>
          <div className="flex items-center justify-between gap-3">
            <div className="max-w-2xl">
              <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-indigo-600 dark:text-indigo-300">
                <ShieldCheck className="h-4 w-4" /> TVU Live Map
              </div>
              <h1 className={`${sharingActive ? 'mt-1 text-lg' : 'mt-2 text-2xl'} font-black tracking-tight text-slate-950 dark:text-white`}>Bạn bè quanh bạn</h1>
              {!sharingActive && <p className="mt-1 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                Bản đồ hoạt động ở mọi nơi. Bạn quyết định ai được thấy mình; tọa độ gốc không được gửi cho trình duyệt của người khác và tự hết hạn nếu ứng dụng ngừng cập nhật.
              </p>}
            </div>
            <div className={`shrink-0 rounded-2xl px-3 py-2 text-xs font-black shadow-sm ${sharingActive ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-900' : localLocationInspectorEnabled ? 'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300 dark:ring-indigo-900' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}>
              <span className="inline-flex items-center gap-2">
                <span className={`relative flex h-2.5 w-2.5 ${sharingActive ? '' : 'opacity-70'}`}>
                  {sharingActive && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />}
                  <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${sharingActive ? 'bg-emerald-500' : localLocationInspectorEnabled ? 'bg-indigo-500' : 'bg-slate-400'}`} />
                </span>
                <span className="sm:hidden">{sharingActive ? 'LIVE' : localLocationInspectorEnabled ? 'DEV' : 'Ẩn'}</span>
                <span className="hidden sm:inline">{sharingActive ? 'Đang chia sẻ trực tiếp' : localLocationInspectorEnabled ? 'Dev · xem vị trí chia sẻ' : 'Đang ẩn vị trí'}</span>
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setSharingSettingsOpen(true)}
            className="mt-2 inline-flex min-h-8 items-center rounded-xl px-1 text-xs font-bold text-indigo-700 transition hover:bg-indigo-50 sm:px-3 sm:text-sm dark:text-indigo-300 dark:hover:bg-indigo-950/40"
          >
            {sharingActive ? 'Quản lý chia sẻ và quyền riêng tư' : 'Thiết lập chia sẻ vị trí'}
          </button>
        </section>

        {!mapAccessEnabled ? (
          <section className="rounded-3xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center dark:border-slate-700 dark:bg-slate-900">
            <Navigation className="mx-auto h-12 w-12 text-slate-300 dark:text-slate-600" />
            <h2 className="mt-4 text-lg font-black text-slate-900 dark:text-white">Bản đồ đang khóa để bảo vệ riêng tư</h2>
            <p className="mx-auto mt-2 max-w-lg text-sm text-slate-500 dark:text-slate-400">Bật một phạm vi chia sẻ ở trên để xem những người cũng đã tự nguyện xuất hiện. Không có chế độ xem ẩn danh vị trí của người khác.</p>
            <button type="button" onClick={() => setSharingSettingsOpen(true)} className="mt-5 min-h-12 rounded-2xl bg-gradient-to-r from-indigo-600 to-violet-600 px-6 text-sm font-black text-white shadow-lg shadow-indigo-500/20">Bắt đầu chia sẻ an toàn</button>
          </section>
        ) : (
          <section className="overflow-hidden rounded-[2rem] border border-white/80 bg-white shadow-[0_24px_70px_rgba(15,23,42,0.14)] dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 pb-2 pt-3.5 dark:border-slate-700">
              <div>
                <h2 className="flex items-center gap-2 font-black tracking-tight text-slate-900 dark:text-white"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500 shadow-[0_0_0_5px_rgba(16,185,129,0.12)]" />Đang hoạt động</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {loading
                    ? 'Đang làm mới…'
                    : `${locations.length} người đang hiển thị${lastLoadedAt ? ` · ${formatLastShared(lastLoadedAt).toLowerCase()}` : ''}`}
                </p>
              </div>
              <button type="button" onClick={() => void loadLocations()} className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:-translate-y-0.5 hover:text-indigo-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300" aria-label="Làm mới vị trí" title="Làm mới vị trí"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /></button>
            </div>
            {error && <p className="border-b border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200">{error}</p>}
            {locations.length > 0 && (
              <div className="flex snap-x gap-2 overflow-x-auto px-3 pb-3 pt-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <button
                  type="button"
                  onClick={() => { setSelectedLocation(null); setFollowUser(true); setRecenterToken((value) => value + 1); }}
                  className={`flex min-w-fit snap-start items-center gap-2 rounded-2xl border px-3 py-2 text-left transition ${!selectedLocation ? 'border-indigo-300 bg-indigo-50 text-indigo-700 shadow-sm dark:border-indigo-800 dark:bg-indigo-950/50 dark:text-indigo-200' : 'border-slate-200 bg-white text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'}`}
                >
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-white"><Users className="h-4 w-4" /></span>
                  <span><strong className="block text-xs">Tất cả</strong><span className="block text-[10px] opacity-70">{locations.length} người</span></span>
                </button>
                {locations.map((location) => {
                  const selected = selectedLocation?.uid === location.uid;
                  const distance = distanceFor(location);
                  return (
                    <button
                      key={`person-strip-${location.uid}`}
                      type="button"
                      onClick={() => selectStudent(location)}
                      className={`flex min-w-[9.5rem] snap-start items-center gap-2 rounded-2xl border px-2.5 py-2 text-left transition ${selected ? 'border-indigo-400 bg-indigo-50 shadow-md ring-2 ring-indigo-500/10 dark:border-indigo-700 dark:bg-indigo-950/50' : 'border-slate-200 bg-white hover:border-indigo-200 dark:border-slate-700 dark:bg-slate-800 dark:hover:border-indigo-800'}`}
                    >
                      {location.photoURL ? <img src={location.photoURL} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover ring-2 ring-white dark:ring-slate-700" referrerPolicy="no-referrer" /> : <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-xs font-black text-white">{studentMarkerInitials(location.fullName)}</span>}
                      <span className="min-w-0"><strong className="block truncate text-xs text-slate-900 dark:text-white">{location.isOwn ? 'Bạn' : location.fullName}</strong><span className="block truncate text-[10px] text-slate-500 dark:text-slate-400">{distance?.label || formatLastShared(location.updatedAt)}</span></span>
                    </button>
                  );
                })}
              </div>
            )}
            <div className="relative h-[65dvh] min-h-[500px] w-full border-t border-slate-100 sm:h-[64vh] lg:h-[68vh] dark:border-slate-800">
              {selectedLocation && !selectedLocation.isOwn && (
                <div className="absolute left-3 right-3 top-3 z-[500] hidden rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-lg backdrop-blur dark:border-slate-700 dark:bg-slate-900/95 sm:block sm:right-auto sm:w-72">
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
                {(() => {
                  const grouped = new Map<string, typeof locations>();
                  locations.forEach(location => {
                    const coord = location.isOwn && localPosition
                      ? [localPosition.lat, localPosition.lng]
                      : [location.latitude, location.longitude];
                    if (Number.isFinite(coord[0])) {
                      const key = `${coord[0].toFixed(5)},${coord[1].toFixed(5)}`;
                      const arr = grouped.get(key) || [];
                      arr.push(location);
                      grouped.set(key, arr);
                    }
                  });

                  return locations.map((location) => {
                    const relation = relationFor(location);
                    const distance = distanceFor(location);
                    let markerPosition: [number, number] = location.isOwn && localPosition
                      ? [localPosition.lat, localPosition.lng]
                      : [location.latitude, location.longitude];

                    const key = `${markerPosition[0].toFixed(5)},${markerPosition[1].toFixed(5)}`;
                    const group = grouped.get(key);
                    if (group && group.length > 1) {
                      const index = group.findIndex(g => g.uid === location.uid);
                      const radius = 0.00003; // ~3 meters offset
                      const angle = (index / group.length) * Math.PI * 2;
                      markerPosition = [
                        markerPosition[0] + radius * Math.cos(angle),
                        markerPosition[1] + radius * Math.sin(angle)
                      ];
                    }

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
                  });
                })()}
                {musicStations
                  .filter((station) => Number.isFinite(station.location?.lat) && Number.isFinite(station.location?.lng))
                  .map((station) => (
                    <Marker
                      key={`station-${station.id || `${station.userId}-${station.location.lat}-${station.location.lng}`}`}
                      position={[station.location.lat, station.location.lng]}
                      icon={stationMarkerIcon(station)}
                      zIndexOffset={450}
                      alt={`Trạm cảm xúc của ${station.userName}`}
                      title={`Trạm cảm xúc của ${station.userName}`}
                      eventHandlers={{
                        click: (event) => {
                          if (useMobileStationSheet) setSelectedStation(station);
                          else event.target.openPopup();
                        },
                      }}
                    >
                      {!useMobileStationSheet && (
                        <Popup
                          minWidth={250}
                          maxWidth={300}
                          autoPan
                          keepInView
                          autoPanPaddingTopLeft={[16, 120]}
                          autoPanPaddingBottomRight={[16, 72]}
                          className="music-station-map-popup"
                        >
                          <MusicStationPopup station={station} variant="card" />
                        </Popup>
                      )}
                    </Marker>
                  ))}
              </MapContainer>
              {useMobileStationSheet && selectedStation && typeof document !== 'undefined' && createPortal((
                <div className="fixed inset-0 z-[10010] sm:hidden" role="dialog" aria-modal="true" aria-label={`Trạm cảm xúc của ${selectedStation.userName}`}>
                  <button
                    type="button"
                    className="absolute inset-0 h-full w-full bg-slate-950/45 backdrop-blur-[2px]"
                    onClick={() => setSelectedStation(null)}
                    aria-label="Đóng trạm cảm xúc"
                  />
                  <div
                    className="absolute inset-x-3 mx-auto flex max-h-[calc(100dvh-7rem)] max-w-[320px] justify-center overflow-y-auto overscroll-contain rounded-3xl"
                    style={{ bottom: 'calc(5.25rem + env(safe-area-inset-bottom))' }}
                  >
                    <button
                      type="button"
                      onClick={() => setSelectedStation(null)}
                      className="absolute right-2 top-2 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-slate-950/70 text-white shadow-lg backdrop-blur"
                      aria-label="Đóng trạm cảm xúc"
                    >
                      <X className="h-5 w-5" />
                    </button>
                    <MusicStationPopup station={selectedStation} variant="card" />
                  </div>
                </div>
              ), document.body)}
              <button
                type="button"
                onClick={() => setIsCreateStationModalOpen(true)}
                className="absolute bottom-14 left-3 z-[500] flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-[0_8px_16px_rgba(79,70,229,0.3)] transition-transform hover:scale-105 active:scale-95"
                title="Thả trạm cảm xúc tại đây"
                aria-label="Thả trạm cảm xúc tại đây"
              >
                <Music className="h-5 w-5" />
              </button>
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
              <div className="pointer-events-none absolute bottom-3 left-3 z-[500] flex items-center gap-2 rounded-full bg-white/92 px-3 py-2 text-[10px] font-bold text-slate-600 shadow-lg backdrop-blur dark:bg-slate-900/92 dark:text-slate-300">
                <span className="inline-flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-emerald-500" />Bạn bè</span><span className="inline-flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-violet-500" />Cùng ngành</span><span className="inline-flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-slate-500" />TVU</span>
              </div>
            </div>
          </section>
        )}

        {selectedLocation && (
          <section className="fixed inset-x-3 z-[1000] max-h-[58dvh] overflow-y-auto rounded-[2rem] border border-white/80 bg-white/95 p-5 pb-6 shadow-[0_24px_80px_rgba(15,23,42,0.28)] backdrop-blur-xl dark:border-slate-700 dark:bg-slate-900/95 sm:static sm:inset-auto sm:z-auto sm:max-h-none sm:overflow-visible sm:rounded-3xl sm:border-slate-200 sm:bg-white sm:shadow-sm sm:backdrop-blur-none dark:sm:border-slate-700 dark:sm:bg-slate-900" style={{ bottom: 'calc(5.5rem + env(safe-area-inset-bottom))' }}>
            <div className="mx-auto -mt-2 mb-3 h-1.5 w-12 rounded-full bg-slate-200 sm:hidden dark:bg-slate-700" />
            <button type="button" onClick={() => setSelectedLocation(null)} className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition hover:bg-slate-200 sm:hidden dark:bg-slate-800 dark:text-slate-300" aria-label="Đóng thông tin vị trí"><X className="h-4 w-4" /></button>
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

        <details className="group rounded-2xl border border-slate-200/80 bg-white/80 px-4 py-3 text-xs text-slate-600 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-900/80 dark:text-slate-300">
          <summary className="flex min-h-8 cursor-pointer list-none items-center gap-2 font-black text-slate-800 dark:text-slate-100"><ShieldCheck className="h-4 w-4 text-emerald-600" />Cách TVU Connect bảo vệ vị trí của bạn</summary>
          <div className="mt-3 grid gap-3 border-t border-slate-100 pt-3 dark:border-slate-800 md:grid-cols-3">
            <div><strong className="block text-slate-900 dark:text-white">Vị trí được làm mờ</strong><span>Trình duyệt chỉ nhận khu vực theo đúng phạm vi bạn đã chọn.</span></div>
            <div><strong className="block text-slate-900 dark:text-white">Quan hệ hai chiều</strong><span>Chế độ bạn bè chỉ hoạt động sau khi lời mời được chấp nhận.</span></div>
            <div><strong className="block text-slate-900 dark:text-white">Chạm mặt có đồng thuận</strong><span>Không tạo sự kiện nếu một trong hai người tắt hoặc chặn nhau.</span></div>
          </div>
        </details>
      </div>

      {sharingSettingsOpen && typeof document !== 'undefined' && createPortal((
        <div className="fixed inset-0 z-[10020] flex items-end justify-center sm:items-center sm:p-5" role="dialog" aria-modal="true" aria-labelledby="location-sharing-title">
          <button type="button" className="absolute inset-0 h-full w-full bg-slate-950/55 backdrop-blur-[3px]" onClick={() => setSharingSettingsOpen(false)} aria-label="Đóng quản lý chia sẻ" />
          <div className="relative z-10 max-h-[88dvh] w-full overflow-y-auto overscroll-contain rounded-t-[2rem] bg-white px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3 shadow-[0_-24px_80px_rgba(15,23,42,0.3)] dark:bg-slate-900 sm:max-w-2xl sm:rounded-[2rem] sm:p-6">
            <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-slate-200 sm:hidden dark:bg-slate-700" />
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.14em] text-indigo-600 dark:text-indigo-300">Quyền riêng tư vị trí</p>
                <h2 id="location-sharing-title" className="mt-1 text-xl font-black tracking-tight text-slate-950 dark:text-white">Chia sẻ với ai?</h2>
                <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">Bạn có thể đổi phạm vi hoặc dừng chia sẻ bất kỳ lúc nào.</p>
              </div>
              <button type="button" onClick={() => setSharingSettingsOpen(false)} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300" aria-label="Đóng quản lý chia sẻ"><X className="h-5 w-5" /></button>
            </div>

            <div className="mt-5 grid gap-2.5 sm:grid-cols-3">
              {VISIBILITY_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setDraftVisibility(option.value)}
                  className={`rounded-2xl border p-4 text-left transition ${draftVisibility === option.value ? 'border-indigo-500 bg-indigo-50 ring-2 ring-indigo-500/15 dark:bg-indigo-950/30' : 'border-slate-200 hover:border-indigo-300 dark:border-slate-700 dark:hover:border-indigo-700'}`}
                >
                  <span className="flex items-center justify-between gap-2"><strong className="block text-sm text-slate-900 dark:text-white">{option.title}</strong>{draftVisibility === option.value && <span className="flex h-5 w-5 items-center justify-center rounded-full bg-indigo-600 text-[10px] text-white">✓</span>}</span>
                  <span className="mt-1 block text-xs leading-relaxed text-slate-500 dark:text-slate-400">{option.description}</span>
                  <span className="mt-2 block text-[11px] font-bold text-indigo-600 dark:text-indigo-300">{option.precision}</span>
                </button>
              ))}
            </div>

            <label className="mt-3 flex cursor-pointer items-start gap-3 rounded-2xl bg-slate-50 p-4 dark:bg-slate-800/70">
              <input type="checkbox" checked={draftEncounters} onChange={(event) => setDraftEncounters(event.target.checked)} className="mt-1" />
              <span><strong className="flex items-center gap-2 text-sm text-slate-900 dark:text-white"><BellRing className="h-4 w-4 text-violet-600" /> Báo khi vừa chạm mặt</strong><span className="mt-1 block text-xs leading-relaxed text-slate-500 dark:text-slate-400">Chỉ báo khi cả hai cùng bật và ở gần khoảng 35 m.</span></span>
            </label>

            <div className="sticky bottom-0 mt-4 grid gap-2 bg-white/95 pt-2 backdrop-blur dark:bg-slate-900/95 sm:grid-cols-[1fr_auto]">
              <button type="button" disabled={saving} onClick={() => void saveSharing()} className="min-h-12 rounded-2xl bg-gradient-to-r from-indigo-600 to-violet-600 px-5 text-sm font-black text-white shadow-lg shadow-indigo-500/20 disabled:opacity-60">{saving ? 'Đang cập nhật…' : sharingActive ? 'Lưu thay đổi' : 'Bắt đầu chia sẻ'}</button>
              {sharingActive && <button type="button" disabled={saving} onClick={() => void stopSharing()} className="min-h-12 rounded-2xl border border-rose-200 px-5 text-sm font-bold text-rose-600 hover:bg-rose-50 disabled:opacity-60 dark:border-rose-900 dark:hover:bg-rose-950/30">Dừng chia sẻ</button>}
            </div>
            <p className="mt-3 text-center text-[11px] text-slate-500 dark:text-slate-400">Vị trí tự hết hạn sau khoảng 15 phút nếu TVU Connect ngừng cập nhật.</p>
          </div>
        </div>
      ), document.body)}

      {isCreateStationModalOpen && (
        <CreateStationModal
          currentUser={currentUser}
          currentProfile={currentProfile}
          onClose={() => setIsCreateStationModalOpen(false)}
        />
      )}
    </div>
  );
};
