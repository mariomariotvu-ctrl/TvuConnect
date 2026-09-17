import React, { useEffect, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { toast } from 'sonner';
import { db } from '../firebase';
import type { LocationPreferences, StudentEncounter } from '../types';
import {
  subscribeLocationPreferences,
  subscribeStudentEncounters,
  updateLiveLocation,
} from '../services/liveLocationService';
import { calculateDistance } from '../utils/locationUtils';

interface LiveLocationTrackerProps {
  currentUser: User;
}

interface LastPosition {
  latitude: number;
  longitude: number;
  accuracy: number;
  sentAt: number;
}

const MIN_SEND_INTERVAL_MS = 45_000;
const KEEP_ALIVE_INTERVAL_MS = 5 * 60_000;
const MIN_MOVEMENT_KM = 0.03;

export const LiveLocationTracker: React.FC<LiveLocationTrackerProps> = ({ currentUser }) => {
  const [preferences, setPreferences] = useState<LocationPreferences>({
    uid: currentUser.uid,
    visibility: 'off',
    encounterAlertsEnabled: false,
  });
  const lastPositionRef = useRef<LastPosition | null>(null);
  const sendingRef = useRef(false);
  const permissionErrorShownRef = useRef(false);
  const seenEncounterIdsRef = useRef(new Set<string>());
  const encounterListenerReadyRef = useRef(false);

  useEffect(() => subscribeLocationPreferences(
    currentUser.uid,
    setPreferences,
    (error) => console.warn('Could not observe location preferences:', error),
  ), [currentUser.uid]);

  useEffect(() => {
    if (preferences.visibility === 'off' || !navigator.geolocation) return;
    const activeVisibility = preferences.visibility;

    const sendPosition = async (position: GeolocationPosition, force = false) => {
      const previous = lastPositionRef.current;
      const now = Date.now();
      const next = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy,
        sentAt: previous?.sentAt || 0,
      };
      const movedKm = previous
        ? calculateDistance(
            { lat: previous.latitude, lng: previous.longitude },
            { lat: next.latitude, lng: next.longitude },
          )
        : Number.POSITIVE_INFINITY;

      if (!force && previous) {
        const elapsed = now - previous.sentAt;
        if (elapsed < MIN_SEND_INTERVAL_MS) return;
        if (movedKm < MIN_MOVEMENT_KM && elapsed < KEEP_ALIVE_INTERVAL_MS) return;
      }
      if (sendingRef.current) return;

      sendingRef.current = true;
      try {
        await updateLiveLocation({
          latitude: next.latitude,
          longitude: next.longitude,
          accuracy: next.accuracy,
          visibility: activeVisibility,
          encounterAlertsEnabled: preferences.encounterAlertsEnabled,
        });
        lastPositionRef.current = { ...next, sentAt: now };
        permissionErrorShownRef.current = false;
      } catch (error) {
        console.warn('Could not refresh shared location:', error);
      } finally {
        sendingRef.current = false;
      }
    };

    const watchId = navigator.geolocation.watchPosition(
      (position) => { void sendPosition(position); },
      (error) => {
        if (permissionErrorShownRef.current) return;
        permissionErrorShownRef.current = true;
        toast.error(error.code === error.PERMISSION_DENIED
          ? 'Quyền vị trí đang bị tắt. TVU Connect đã ngừng cập nhật vị trí của bạn.'
          : 'Chưa thể cập nhật vị trí. Ứng dụng sẽ tự thử lại khi tín hiệu ổn định.');
      },
      { enableHighAccuracy: true, timeout: 20_000, maximumAge: 30_000 },
    );

    const keepAlive = window.setInterval(() => {
      navigator.geolocation.getCurrentPosition(
        (position) => { void sendPosition(position, true); },
        () => undefined,
        { enableHighAccuracy: true, timeout: 20_000, maximumAge: 60_000 },
      );
    }, KEEP_ALIVE_INTERVAL_MS);

    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return;
      navigator.geolocation.getCurrentPosition(
        (position) => { void sendPosition(position, true); },
        () => undefined,
        { enableHighAccuracy: true, timeout: 20_000, maximumAge: 60_000 },
      );
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      navigator.geolocation.clearWatch(watchId);
      window.clearInterval(keepAlive);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [preferences.encounterAlertsEnabled, preferences.visibility]);

  useEffect(() => subscribeStudentEncounters(currentUser.uid, (encounters) => {
    if (!encounterListenerReadyRef.current) {
      encounters.forEach((encounter) => seenEncounterIdsRef.current.add(encounter.id));
      encounterListenerReadyRef.current = true;
      return;
    }

    const newEncounters = encounters.filter((encounter) => !seenEncounterIdsRef.current.has(encounter.id));
    encounters.forEach((encounter) => seenEncounterIdsRef.current.add(encounter.id));
    if (!preferences.encounterAlertsEnabled || document.visibilityState !== 'visible') return;

    newEncounters.forEach((encounter: StudentEncounter) => {
      const peerUid = encounter.participantUids.find((uid) => uid !== currentUser.uid);
      if (!peerUid) return;
      void getDoc(doc(db, 'profiles', peerUid)).then((profile) => {
        const peerName = profile.data()?.fullName || 'một sinh viên TVU';
        if ('vibrate' in navigator) navigator.vibrate([120, 80, 120]);
        toast.info(`Bạn vừa chạm mặt ${peerName}.`, {
          description: 'Chỉ hai người đã bật tính năng này mới nhận được thông báo.',
          duration: 5_000,
        });
      });
    });
  }, (error) => console.warn('Could not observe encounters:', error)), [currentUser.uid, preferences.encounterAlertsEnabled]);

  return null;
};
