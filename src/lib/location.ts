import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';

import type { LocationSample } from '@/lib/trip-recorder';

/**
 * Single owner of the device GPS. Features declare *why* they need location
 * ("reasons"); this module picks the cheapest mode that satisfies all of them:
 *   - nothing      → GPS off
 *   - 'map' only   → foreground watch (stops when the app is backgrounded by the OS)
 *   - trip / drive → background updates with a persistent notification
 */
export type TrackingReason = 'map' | 'trip' | 'drive';

const TASK = 'convoy-location';
const BACKGROUND_REASONS: TrackingReason[] = ['trip', 'drive'];

type Listener = (samples: LocationSample[]) => void;
const listeners = new Set<Listener>();
const reasons = new Set<TrackingReason>();
let watch: Location.LocationSubscription | null = null;
let mode: 'off' | 'foreground' | 'background' = 'off';
let applying: Promise<void> = Promise.resolve();

export type PermissionLevel = 'none' | 'foreground' | 'background';
let permission: PermissionLevel = 'none';

function toSample(loc: Location.LocationObject): LocationSample {
  return {
    lat: loc.coords.latitude,
    lng: loc.coords.longitude,
    speed: loc.coords.speed,
    accuracy: loc.coords.accuracy,
    heading: loc.coords.heading != null && loc.coords.heading >= 0 ? loc.coords.heading : null,
    timestamp: loc.timestamp,
  };
}

function emit(samples: LocationSample[]) {
  for (const l of listeners) l(samples);
}

// Must be defined at module scope so the OS can wake the JS runtime into it.
TaskManager.defineTask<{ locations: Location.LocationObject[] }>(TASK, async ({ data, error }) => {
  if (error) {
    console.warn('Background location error', error.message);
    return;
  }
  if (data?.locations?.length) emit(data.locations.map(toSample));
});

export function onLocation(listener: Listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getPermissionLevel() {
  return permission;
}

export async function requestForegroundPermission(): Promise<boolean> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status === 'granted' && permission === 'none') permission = 'foreground';
  return status === 'granted';
}

async function requestBackgroundPermission(): Promise<boolean> {
  if (!(await requestForegroundPermission())) return false;
  if (Platform.OS === 'web') return false;
  const { status } = await Location.requestBackgroundPermissionsAsync();
  if (status === 'granted') permission = 'background';
  return status === 'granted';
}

async function stopAll() {
  watch?.remove();
  watch = null;
  if (Platform.OS !== 'web' && (await Location.hasStartedLocationUpdatesAsync(TASK).catch(() => false))) {
    await Location.stopLocationUpdatesAsync(TASK);
  }
}

async function apply() {
  const wantsBackground = BACKGROUND_REASONS.some((r) => reasons.has(r));
  const wantsAny = reasons.size > 0;

  if (!wantsAny) {
    if (mode !== 'off') await stopAll();
    mode = 'off';
    return;
  }

  if (wantsBackground && mode !== 'background' && (await requestBackgroundPermission())) {
    await stopAll();
    await Location.startLocationUpdatesAsync(TASK, {
      accuracy: Location.Accuracy.BestForNavigation,
      timeInterval: 1000,
      distanceInterval: 3,
      activityType: Location.ActivityType.AutomotiveNavigation,
      pausesUpdatesAutomatically: false,
      showsBackgroundLocationIndicator: true,
      foregroundService: {
        notificationTitle: 'Convoy is using your location',
        notificationBody: reasons.has('drive')
          ? 'Sharing your location with your group drive.'
          : 'Recording your trip.',
        notificationColor: '#3B82F6',
        killServiceOnDestroy: true,
      },
    });
    mode = 'background';
    return;
  }

  if (mode === 'background' && wantsBackground) return;

  // Foreground-only (either nothing needs background, or background permission was refused).
  if (mode !== 'foreground') {
    await stopAll();
    if (!(await requestForegroundPermission())) {
      mode = 'off';
      return;
    }
    watch = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 1000, distanceInterval: 2 },
      (loc) => emit([toSample(loc)])
    );
    mode = 'foreground';
  }
}

/** Serialize mode changes so rapid start/stop calls can't interleave native calls. */
function schedule() {
  applying = applying.then(apply).catch((e) => console.warn('Location mode change failed', e));
  return applying;
}

export function addReason(reason: TrackingReason) {
  reasons.add(reason);
  return schedule();
}

export function removeReason(reason: TrackingReason) {
  reasons.delete(reason);
  return schedule();
}

export function getTrackingMode() {
  return mode;
}
