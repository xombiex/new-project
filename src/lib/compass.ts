import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';

/**
 * Compass heading for the web app (degrees clockwise from north), so the map can face where the
 * phone points even while you're standing still. iPhone Safari only allows it after a tap, so we
 * start on the first tap anywhere. Native apps get rotation from the map's own course tracking.
 */
let heading: number | null = null;
let started = false;
const listeners = new Set<() => void>();

function set(h: number) {
  // Ignore jitter under a couple of degrees so the map doesn't shimmer.
  if (heading != null && Math.abs(((h - heading + 540) % 360) - 180) < 2) return;
  heading = (h + 360) % 360;
  listeners.forEach((l) => l());
}

type OrientationEventWithCompass = DeviceOrientationEvent & { webkitCompassHeading?: number };

export async function startCompass(): Promise<boolean> {
  if (Platform.OS !== 'web' || started || typeof window === 'undefined' || !('DeviceOrientationEvent' in window)) return started;
  const DOE = window.DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<'granted' | 'denied'> };
  try {
    if (typeof DOE.requestPermission === 'function' && (await DOE.requestPermission()) !== 'granted') return false;
  } catch {
    return false; // not from a tap yet; we'll try again on the next one
  }
  started = true;
  // iOS reports a true compass heading; Android gives absolute alpha (counter-clockwise).
  window.addEventListener('deviceorientation', (e: OrientationEventWithCompass) => {
    if (typeof e.webkitCompassHeading === 'number') set(e.webkitCompassHeading);
  });
  window.addEventListener('deviceorientationabsolute' as 'deviceorientation', (e: DeviceOrientationEvent) => {
    if (e.absolute && typeof e.alpha === 'number') set(360 - e.alpha);
  });
  return true;
}

if (Platform.OS === 'web' && typeof document !== 'undefined') {
  const onTap = () => {
    void startCompass().then((ok) => {
      if (ok) {
        document.removeEventListener('touchend', onTap);
        document.removeEventListener('click', onTap);
      }
    });
  };
  document.addEventListener('touchend', onTap);
  document.addEventListener('click', onTap);
}

export function useCompassHeading(): number | null {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => heading,
    () => null
  );
}
