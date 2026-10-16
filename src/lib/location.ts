import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { AppState, Platform } from 'react-native';

import type { LocationSample } from '@/lib/trip-recorder';

/**
 * Single owner of the device GPS. Features declare *why* they need location
 * ("reasons"); this module picks the cheapest mode that satisfies all of them:
 *   - nothing      → GPS off
 *   - 'map' only   → foreground watch (stops when the app is backgrounded)
 *   - trip / drive / nav → precise background updates with a persistent notification
 *   - 'auto' only  → low-power background updates, just enough to notice a drive starting
 */
export type TrackingReason = 'map' | 'trip' | 'drive' | 'nav' | 'auto';

const TASK = 'convoy-location';
const HIGH_REASONS: TrackingReason[] = ['trip', 'drive', 'nav'];

type Listener = (samples: LocationSample[]) => void;
const listeners = new Set<Listener>();
const reasons = new Set<TrackingReason>();
let watch: Location.LocationSubscription | null = null;
let mode: 'off' | 'foreground' | 'background' | 'background-low' = 'off';
let appActive = AppState.currentState !== 'background';
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

function notificationBody() {
  if (reasons.has('drive')) return 'Sharing your location with your group drive.';
  if (reasons.has('nav')) return 'Navigating to your destination.';
  if (reasons.has('trip')) return 'Recording your trip.';
  return 'Watching for drives to record automatically.';
}

async function startBackground(profile: 'high' | 'low') {
  await stopAll();
  await Location.startLocationUpdatesAsync(TASK, {
    ...(profile === 'high'
      ? { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 1000, distanceInterval: 3, pausesUpdatesAutomatically: false }
      : // Low power: coarse, infrequent fixes are enough to notice that a drive has started.
        { accuracy: Location.Accuracy.Balanced, timeInterval: 10_000, distanceInterval: 50, deferredUpdatesInterval: 10_000 }),
    activityType: Location.ActivityType.AutomotiveNavigation,
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: 'Convoy is using your location',
      notificationBody: notificationBody(),
      notificationColor: '#1E9BFF',
      killServiceOnDestroy: profile === 'high',
    },
  });
  mode = profile === 'high' ? 'background' : 'background-low';
}

async function apply() {
  // A visible map only needs GPS while the app is in front.
  const effective = new Set([...reasons].filter((r) => r !== 'map' || appActive));
  const high = HIGH_REASONS.some((r) => effective.has(r)) || (effective.has('map') && effective.has('auto'));
  const low = !high && effective.has('auto');

  if (effective.size === 0) {
    if (mode !== 'off') await stopAll();
    mode = 'off';
    return;
  }

  if (high || low) {
    const want = high ? 'background' : 'background-low';
    if (mode === want) return;
    if (await requestBackgroundPermission()) {
      await startBackground(high ? 'high' : 'low');
      return;
    }
    if (!effective.has('map') && !high) {
      // Auto-detect without background permission can't work; stay off.
      if (mode !== 'off') await stopAll();
      mode = 'off';
      return;
    }
  }

  // Foreground-only (map only, or background permission was refused).
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

AppState.addEventListener('change', (state) => {
  const active = state === 'active';
  if (active === appActive) return;
  appActive = active;
  void schedule();
});

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
