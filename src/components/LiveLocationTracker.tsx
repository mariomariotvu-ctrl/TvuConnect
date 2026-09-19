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
import {
  LOCATION_KEEP_ALIVE_MS,
  shouldSendLivePosition,
  type LivePositionSample,
} from '../utils/liveLocationUtils';
import { playAppSound } from '../utils/appSounds';
import {
  geolocationSample,
  shouldAcceptGeolocationSample,
  type PreciseGeolocation,
} from '../utils/geolocation';

interface LiveLocationTrackerProps {
  currentUser: User;
}

export const LiveLocationTracker: React.FC<LiveLocationTrackerProps> = ({ currentUser }) => {
  const [preferences, setPreferences] = useState<LocationPreferences>({
    uid: currentUser.uid,
    visibility: 'off',
    encounterAlertsEnabled: false,
  });
  const lastPositionRef = useRef<LivePositionSample | null>(null);
  const lastAcceptedSampleRef = useRef<PreciseGeolocation | null>(null);
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
      const sample = geolocationSample(position);
      if (!shouldAcceptGeolocationSample(lastAcceptedSampleRef.current, sample)) return;
      lastAcceptedSampleRef.current = sample;
      const previous = lastPositionRef.current;
      const now = Date.now();
      const next = {
        latitude: sample.lat,
        longitude: sample.lng,
        accuracy: sample.accuracy,
        sentAt: previous?.sentAt || 0,
        observedAt: sample.observedAt,
      };
      if (!shouldSendLivePosition(
        previous,
        next,
        now,
        preferences.encounterAlertsEnabled,
        force,
      )) return;
      if (sendingRef.current) return;

      sendingRef.current = true;
      try {
        await updateLiveLocation({
          latitude: next.latitude,
          longitude: next.longitude,
          accuracy: next.accuracy,
          visibility: activeVisibility,
          encounterAlertsEnabled: preferences.encounterAlertsEnabled,
          speed: sample.speed,
          heading: sample.heading,
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
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
    );

    const keepAlive = window.setInterval(() => {
      navigator.geolocation.getCurrentPosition(
        (position) => { void sendPosition(position, true); },
        () => undefined,
        { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
      );
    }, LOCATION_KEEP_ALIVE_MS);

    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return;
      navigator.geolocation.getCurrentPosition(
        (position) => { void sendPosition(position, true); },
        () => undefined,
        { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
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
        void playAppSound('encounter', { cooldownMs: 2_000 });
        if ('vibrate' in navigator) navigator.vibrate([120, 80, 120]);
        toast.info(`Bạn vừa chạm mặt ${peerName}.`, {
          description: `Cách nhau khoảng ${encounter.distanceMeters || 35} m. Chỉ hai người đã cùng bật tính năng mới nhận được báo.`,
          duration: 5_000,
        });
      });
    });
  }, (error) => console.warn('Could not observe encounters:', error)), [currentUser.uid, preferences.encounterAlertsEnabled]);

  return null;
};
