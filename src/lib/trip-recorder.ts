import { haversine, type LngLat } from '@/lib/geo';
import { HIST_BUCKETS, histBucket } from '@/lib/speed-bands';

export type LocationSample = {
  lat: number;
  lng: number;
  /** m/s as reported by the GPS chip; null or negative when unknown */
  speed: number | null;
  /** horizontal accuracy radius in meters; null when unknown */
  accuracy: number | null;
  heading: number | null;
  /** epoch ms */
  timestamp: number;
};

export type TripState = {
  startedAt: number;
  distanceM: number;
  /** seconds spent moving faster than MOVING_MPS (pauses at lights don't drag the average down) */
  movingS: number;
  maxSpeedMps: number;
  path: LngLat[];
  /** m/s at each path point (colors the route by speed) */
  speeds: number[];
  /** seconds moving in each 10 km/h bucket (speed distribution) */
  speedHist: number[];
  last: LocationSample | null;
  /** last sample accepted into the path/distance */
  lastAccepted: LocationSample | null;
};

/** Fixes worse than this are too noisy to add distance from. */
export const MAX_ACCURACY_M = 35;
/** ~2.2 mph: below this the vehicle is treated as stopped. */
export const MOVING_MPS = 1;
/** Implausible for a road vehicle (~224 mph) — treat as a GPS glitch. */
const MAX_PLAUSIBLE_MPS = 100;
/** Gaps longer than this (tunnel, app killed) don't count as moving time. */
const MAX_GAP_S = 30;

export function startTrip(now: number): TripState {
  return { startedAt: now, distanceM: 0, movingS: 0, maxSpeedMps: 0, path: [], speeds: [], speedHist: new Array(HIST_BUCKETS).fill(0), last: null, lastAccepted: null };
}

export function isAccurate(s: LocationSample) {
  return s.accuracy == null || s.accuracy <= MAX_ACCURACY_M;
}

/** GPS-reported speed, or null when the chip didn't provide one. */
export function reportedSpeed(s: LocationSample): number | null {
  return s.speed != null && s.speed >= 0 ? s.speed : null;
}

export function addSample(state: TripState, sample: LocationSample): TripState {
  if (state.last && sample.timestamp <= state.last.timestamp) return state; // out of order / duplicate

  const next: TripState = { ...state, last: sample };
  const point: LngLat = [sample.lng, sample.lat];

  if (!isAccurate(sample)) return next;

  const prev = state.lastAccepted;
  if (!prev) {
    return { ...next, path: [point], speeds: [reportedSpeed(sample) ?? 0], lastAccepted: sample };
  }

  const dt = (sample.timestamp - prev.timestamp) / 1000;
  const dist = haversine([prev.lng, prev.lat], point);
  const derivedSpeed = dt > 0 ? dist / dt : 0;
  const speed = reportedSpeed(sample) ?? derivedSpeed;

  if (derivedSpeed > MAX_PLAUSIBLE_MPS) return next; // teleport — drop it

  // Ignore stationary jitter: small moves while the chip says we're stopped.
  const jitterFloor = Math.max(5, (sample.accuracy ?? 10) * 0.5);
  if (speed < MOVING_MPS && dist < jitterFloor) return next;

  const moving = speed >= MOVING_MPS && dt <= MAX_GAP_S;
  // Trips persisted before these fields existed resume with empty ones.
  const speedHist = (state.speedHist ?? new Array(HIST_BUCKETS).fill(0)).slice();
  if (moving) speedHist[histBucket(Math.min(speed, MAX_PLAUSIBLE_MPS))] += dt;
  return {
    ...next,
    distanceM: state.distanceM + dist,
    movingS: state.movingS + (moving ? dt : 0),
    speeds: [...(state.speeds ?? []), Math.min(speed, MAX_PLAUSIBLE_MPS)],
    speedHist,
    maxSpeedMps: Math.max(state.maxSpeedMps, Math.min(speed, MAX_PLAUSIBLE_MPS)),
    path: [...state.path, point],
    lastAccepted: sample,
  };
}

export function averageSpeedMps(state: Pick<TripState, 'distanceM' | 'movingS'>) {
  return state.movingS > 0 ? state.distanceM / state.movingS : 0;
}
