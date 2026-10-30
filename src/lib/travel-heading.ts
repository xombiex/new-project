import { bearing, haversine, type LngLat } from '@/lib/geo';
import type { LocationSample } from '@/lib/trip-recorder';

/** Below this the GPS course is mostly noise (about 3 mph). */
const COURSE_MIN_SPEED = 1.5;
/** Reported speed under this means stopped, however much the position wobbles. */
const STOPPED_SPEED = 0.5;
/** Move at least this far before trusting a direction worked out from positions... */
const MIN_MOVE_M = 12;
/** ...or as far as the fix could be off, up to this much (indoors accuracy can be 100 m+). */
const MAX_NOISE_M = 25;

export type TravelHeading = {
  /** Degrees clockwise from north; null until you've first moved. */
  heading: number | null;
  /** Where the last direction was measured from. */
  anchor: LngLat | null;
};

export const NO_HEADING: TravelHeading = { heading: null, anchor: null };

/**
 * The way you're travelling, from one location fix to the next: the GPS course when it's good,
 * otherwise the line between positions (many browsers and some phones never report a course or
 * speed). Stopped, it holds the last direction so the map doesn't swing around at a red light.
 */
export function nextTravelHeading(state: TravelHeading, s: Pick<LocationSample, 'lat' | 'lng' | 'speed' | 'heading' | 'accuracy'>): TravelHeading {
  const here: LngLat = [s.lng, s.lat];
  const speed = s.speed != null && Number.isFinite(s.speed) && s.speed >= 0 ? s.speed : null;
  if (speed != null && speed >= COURSE_MIN_SPEED && s.heading != null && Number.isFinite(s.heading)) return { heading: s.heading, anchor: here };
  if (!state.anchor) return { ...state, anchor: here };
  if (speed != null && speed < STOPPED_SPEED) return state;
  const needed = Math.max(MIN_MOVE_M, Math.min(s.accuracy ?? 0, MAX_NOISE_M));
  if (haversine(state.anchor, here) < needed) return state;
  return { heading: bearing(state.anchor, here), anchor: here };
}
