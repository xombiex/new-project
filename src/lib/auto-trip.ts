import type { LocationSample } from '@/lib/trip-recorder';

/** ~15 mph: faster than walking or cycling, so a car is very likely. */
export const START_MPS = 6.7;
/** Must hold that speed this long (filters GPS spikes and short bursts). */
export const START_HOLD_MS = 20_000;
/** ~3 mph: effectively stopped. */
export const STOP_MPS = 1.5;
/** Stopped this long ends the drive (longer than any red light or drive-through). */
export const STOP_HOLD_MS = 5 * 60_000;
/** No location updates for this long while driving also ends it (phone off, app killed). */
export const GAP_MS = 10 * 60_000;

export type DetectorState = {
  driving: boolean;
  fastSince: number | null;
  slowSince: number | null;
  lastT: number | null;
};

export const initialDetector: DetectorState = { driving: false, fastSince: null, slowSince: null, lastT: null };

export type DetectorEvent = 'start' | 'stop' | null;

export function step(state: DetectorState, s: LocationSample): { state: DetectorState; event: DetectorEvent } {
  const t = s.timestamp;
  const speed = s.speed != null && s.speed >= 0 ? s.speed : 0;
  const accurate = s.accuracy == null || s.accuracy <= 50;

  if (state.driving && state.lastT != null && t - state.lastT > GAP_MS) {
    return { state: { ...initialDetector, lastT: t }, event: 'stop' };
  }

  if (!state.driving) {
    if (speed >= START_MPS && accurate) {
      const fastSince = state.fastSince ?? t;
      if (t - fastSince >= START_HOLD_MS) return { state: { driving: true, fastSince: null, slowSince: null, lastT: t }, event: 'start' };
      return { state: { ...state, fastSince, lastT: t }, event: null };
    }
    return { state: { ...state, fastSince: null, lastT: t }, event: null };
  }

  if (speed < STOP_MPS) {
    const slowSince = state.slowSince ?? t;
    if (t - slowSince >= STOP_HOLD_MS) return { state: { ...initialDetector, lastT: t }, event: 'stop' };
    return { state: { ...state, slowSince, lastT: t }, event: null };
  }
  return { state: { ...state, slowSince: null, lastT: t }, event: null };
}
