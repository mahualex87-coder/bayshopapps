import * as Location from 'expo-location';
import type { Coordinates } from '@/domain/pickup-points';

const CACHE_MAX_AGE_MS = 60_000;
const CACHE_MAX_ACCURACY_METRES = 100;
const CACHE_TIMEOUT_MS = 750;
const CURRENT_MAX_AGE_MS = 5_000;
const CURRENT_TIMEOUT_MS = 8_000;

/** Return only coordinates, without retaining the OS location object or metadata. */
function coordinates(value: unknown, maxAge: number, maxAccuracy = Infinity): Coordinates | null {
  if (!value || typeof value !== 'object' || !('coords' in value) || !('timestamp' in value)) return null;
  const { coords, timestamp } = value;
  if (!coords || typeof coords !== 'object' || !('latitude' in coords) || !('longitude' in coords) || !('accuracy' in coords)) return null;
  const { latitude, longitude, accuracy } = coords;
  if (typeof latitude !== 'number' || !Number.isFinite(latitude) || Math.abs(latitude) > 90
    || typeof longitude !== 'number' || !Number.isFinite(longitude) || Math.abs(longitude) > 180
    || typeof accuracy !== 'number' || !Number.isFinite(accuracy) || accuracy < 0 || accuracy > maxAccuracy
    || typeof timestamp !== 'number' || !Number.isFinite(timestamp)) return null;
  const age = Date.now() - timestamp;
  return age >= 0 && age <= maxAge ? { latitude, longitude } : null;
}

function locationError(aborted = false): Error {
  const error = new Error(aborted ? 'Location request cancelled' : 'Location unavailable');
  if (aborted) error.name = 'AbortError';
  return error;
}

/** Foreground, one-fix adapter. No startup read, persistence, background task or
 * High-accuracy retry. The caller controls the visible picker/request scope. */
export function createPickupLocationDevice() {
  let permissionGranted = false;
  return {
    async requestPermission(): Promise<boolean> {
      try { permissionGranted = (await Location.requestForegroundPermissionsAsync()).status === 'granted'; }
      catch { permissionGranted = false; }
      return permissionGranted;
    },
    getLastKnownPosition(): Promise<Coordinates | null> {
      if (!permissionGranted) return Promise.resolve(null);
      return new Promise(resolve => {
        let settled = false;
        const finish = (result: Coordinates | null) => {
          if (settled) return;
          settled = true; clearTimeout(timer); resolve(result);
        };
        const timer = setTimeout(() => finish(null), CACHE_TIMEOUT_MS);
        try {
          void Location.getLastKnownPositionAsync({ maxAge: CACHE_MAX_AGE_MS, requiredAccuracy: CACHE_MAX_ACCURACY_METRES })
            .then(result => finish(coordinates(result, CACHE_MAX_AGE_MS, CACHE_MAX_ACCURACY_METRES)), () => finish(null));
        } catch { finish(null); }
      });
    },
    getPosition(signal?: AbortSignal): Promise<Coordinates> {
      if (signal?.aborted) return Promise.reject(locationError(true));
      if (!permissionGranted) return Promise.reject(locationError());
      return new Promise((resolve, reject) => {
        let settled = false;
        let subscription: Location.LocationSubscription | null = null;
        const remove = (current: Location.LocationSubscription | null) => {
          try { current?.remove(); } catch { /* A failed native teardown must not retain the JS request. */ }
        };
        const finish = (result: Coordinates | null, aborted = false) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer); signal?.removeEventListener('abort', abort);
          remove(subscription); subscription = null;
          if (result) resolve(result); else reject(locationError(aborted));
        };
        const abort = () => finish(null, true);
        const timer = setTimeout(() => finish(null), CURRENT_TIMEOUT_MS);
        signal?.addEventListener('abort', abort, { once: true });
        if (signal?.aborted) { abort(); return; }
        try {
          void Location.watchPositionAsync(
            { accuracy: Location.Accuracy.Balanced, timeInterval: 1000, distanceInterval: 0, mayShowUserSettingsDialog: true },
            result => { const position = coordinates(result, CURRENT_MAX_AGE_MS); if (position) finish(position); },
            () => finish(null),
          ).then(current => {
            // Expo can call the location callback before resolving its subscription,
            // or finish registration after cancellation/timeout. Remove that late watcher.
            if (settled) remove(current); else subscription = current;
          }, () => finish(null));
        } catch { finish(null); }
      });
    },
  };
}
