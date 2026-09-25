import {
  activate,
  fetchAndActivate,
  getBoolean,
  getNumber,
  getRemoteConfig,
  getString,
  onConfigUpdate,
  type RemoteConfig,
} from 'firebase/remote-config';
import { app } from '../firebase';
import { logger } from '../utils/logger';

export interface RuntimeConfigValues {
  aiEnabled: boolean;
  librarySearchEnabled: boolean;
  mapEnabled: boolean;
  callsEnabled: boolean;
  notificationsEnabled: boolean;
  aiModel: string;
  locationRefreshMs: number;
  focusedLocationRefreshMs: number;
  routeRefreshMs: number;
  uploadMaxMb: number;
}

const DEFAULTS: RuntimeConfigValues = {
  aiEnabled: true,
  librarySearchEnabled: true,
  mapEnabled: true,
  callsEnabled: true,
  notificationsEnabled: true,
  aiModel: 'gemini-3.8-flash',
  locationRefreshMs: 15_000,
  focusedLocationRefreshMs: 4_000,
  routeRefreshMs: 20_000,
  uploadMaxMb: 10,
};

const REMOTE_DEFAULTS: Record<string, string | number | boolean> = {
  feature_ai_enabled: DEFAULTS.aiEnabled,
  feature_library_search_enabled: DEFAULTS.librarySearchEnabled,
  feature_map_enabled: DEFAULTS.mapEnabled,
  feature_calls_enabled: DEFAULTS.callsEnabled,
  feature_notifications_enabled: DEFAULTS.notificationsEnabled,
  ai_model: DEFAULTS.aiModel,
  gps_location_refresh_ms: DEFAULTS.locationRefreshMs,
  gps_focused_refresh_ms: DEFAULTS.focusedLocationRefreshMs,
  gps_route_refresh_ms: DEFAULTS.routeRefreshMs,
  upload_max_mb: DEFAULTS.uploadMaxMb,
};

type Listener = (config: RuntimeConfigValues) => void;

let remoteConfig: RemoteConfig | null = null;
let currentConfig = { ...DEFAULTS };
let initialization: Promise<RuntimeConfigValues> | null = null;
const listeners = new Set<Listener>();

const boundedNumber = (value: number, fallback: number, minimum: number, maximum: number) => (
  Number.isFinite(value) ? Math.min(maximum, Math.max(minimum, value)) : fallback
);

function readRemoteValues(config: RemoteConfig): RuntimeConfigValues {
  return {
    aiEnabled: getBoolean(config, 'feature_ai_enabled'),
    librarySearchEnabled: getBoolean(config, 'feature_library_search_enabled'),
    mapEnabled: getBoolean(config, 'feature_map_enabled'),
    callsEnabled: getBoolean(config, 'feature_calls_enabled'),
    notificationsEnabled: getBoolean(config, 'feature_notifications_enabled'),
    aiModel: getString(config, 'ai_model').trim() || DEFAULTS.aiModel,
    locationRefreshMs: boundedNumber(
      getNumber(config, 'gps_location_refresh_ms'),
      DEFAULTS.locationRefreshMs,
      5_000,
      120_000,
    ),
    focusedLocationRefreshMs: boundedNumber(
      getNumber(config, 'gps_focused_refresh_ms'),
      DEFAULTS.focusedLocationRefreshMs,
      2_000,
      60_000,
    ),
    routeRefreshMs: boundedNumber(
      getNumber(config, 'gps_route_refresh_ms'),
      DEFAULTS.routeRefreshMs,
      10_000,
      180_000,
    ),
    uploadMaxMb: boundedNumber(
      getNumber(config, 'upload_max_mb'),
      DEFAULTS.uploadMaxMb,
      1,
      100,
    ),
  };
}

function publish(config: RuntimeConfigValues) {
  currentConfig = config;
  listeners.forEach((listener) => listener(config));
}

/**
 * Loads operational switches from Firebase. Failure is intentionally non-fatal:
 * the checked-in defaults keep the app usable when Remote Config is offline.
 */
export function initializeRuntimeConfig(): Promise<RuntimeConfigValues> {
  if (initialization) return initialization;

  initialization = (async () => {
    if (typeof window === 'undefined' || !app) return currentConfig;

    try {
      remoteConfig = getRemoteConfig(app);
      remoteConfig.defaultConfig = REMOTE_DEFAULTS;
      remoteConfig.settings.fetchTimeoutMillis = 8_000;
      remoteConfig.settings.minimumFetchIntervalMillis = import.meta.env.DEV
        ? 60_000
        : 12 * 60 * 60 * 1000;

      await fetchAndActivate(remoteConfig);
      publish(readRemoteValues(remoteConfig));

      onConfigUpdate(remoteConfig, {
        next: async () => {
          if (!remoteConfig) return;
          try {
            await activate(remoteConfig);
            publish(readRemoteValues(remoteConfig));
          } catch (error) {
            logger.warn('Remote Config realtime activation failed:', error);
          }
        },
        error: (error) => logger.warn('Remote Config realtime connection failed:', error),
        complete: () => undefined,
      });
    } catch (error) {
      logger.warn('Remote Config unavailable; using safe defaults:', error);
    }

    return currentConfig;
  })();

  return initialization;
}

export function getRuntimeConfig(): RuntimeConfigValues {
  return currentConfig;
}

export function subscribeRuntimeConfig(listener: Listener) {
  listeners.add(listener);
  listener(currentConfig);
  return () => {
    listeners.delete(listener);
  };
}

export function requireRuntimeFeature(
  feature: keyof Pick<RuntimeConfigValues, 'aiEnabled' | 'librarySearchEnabled' | 'mapEnabled' | 'callsEnabled' | 'notificationsEnabled'>,
  message: string,
) {
  if (!currentConfig[feature]) throw new Error(message);
}
