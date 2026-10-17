export type LngLat = [number, number];

export type Units = 'imperial' | 'metric';

const EARTH_RADIUS_M = 6_371_008.8;
const toRad = (deg: number) => (deg * Math.PI) / 180;

/** Great-circle distance in meters between two [lng, lat] points. */
export function haversine(a: LngLat, b: LngLat): number {
  const dLat = toRad(b[1] - a[1]);
  const dLng = toRad(b[0] - a[0]);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

export const MPS_TO_MPH = 2.236936;
export const MPS_TO_KMH = 3.6;

export function speedIn(units: Units, mps: number): number {
  return Math.max(0, mps) * (units === 'imperial' ? MPS_TO_MPH : MPS_TO_KMH);
}

export function speedUnitLabel(units: Units) {
  return units === 'imperial' ? 'mph' : 'km/h';
}

/** "36 MPH" for a live speed bubble, or undefined when stopped, unknown or stale. */
export function speedLabel(units: Units, mps: number | null | undefined, stale: boolean): string | undefined {
  if (stale || mps == null || mps < 1) return undefined;
  return `${Math.round(speedIn(units, mps))} ${speedUnitLabel(units).toUpperCase()}`;
}

export function formatDistance(units: Units, meters: number): string {
  if (units === 'imperial') {
    const miles = meters / 1609.344;
    if (miles < 0.1) return `${Math.round(meters * 3.28084)} ft`;
    return `${miles < 10 ? miles.toFixed(1) : Math.round(miles)} mi`;
  }
  if (meters < 1000) return `${Math.round(meters)} m`;
  const km = meters / 1000;
  return `${km < 10 ? km.toFixed(1) : Math.round(km)} km`;
}

export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m.toString().padStart(2, '0')}m`;
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

/** Initial bearing in degrees (0 = north) from a to b. */
export function bearing(a: LngLat, b: LngLat): number {
  const y = Math.sin(toRad(b[0] - a[0])) * Math.cos(toRad(b[1]));
  const x =
    Math.cos(toRad(a[1])) * Math.sin(toRad(b[1])) -
    Math.sin(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.cos(toRad(b[0] - a[0]));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/**
 * Ramer–Douglas–Peucker simplification with a tolerance in meters, using a local
 * equirectangular projection (accurate enough at trip scale).
 */
export function simplifyPath(points: LngLat[], toleranceM = 8): LngLat[] {
  return simplifyIndices(points, toleranceM).map((i) => points[i]);
}

/** Indices of the points `simplifyPath` keeps, so parallel arrays (speeds) can follow along. */
export function simplifyIndices(points: LngLat[], toleranceM = 8): number[] {
  if (points.length <= 2) return points.map((_, i) => i);
  const lat0 = toRad(points[0][1]);
  const project = ([lng, lat]: LngLat) => [
    toRad(lng) * Math.cos(lat0) * EARTH_RADIUS_M,
    toRad(lat) * EARTH_RADIUS_M,
  ];
  const xy = points.map(project);
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;

  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length) {
    const [start, end] = stack.pop()!;
    const [x1, y1] = xy[start];
    const [x2, y2] = xy[end];
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;
    let maxDist = 0;
    let index = -1;
    for (let i = start + 1; i < end; i++) {
      const [px, py] = xy[i];
      const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq));
      const dist = Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
      if (dist > maxDist) {
        maxDist = dist;
        index = i;
      }
    }
    if (index !== -1 && maxDist > toleranceM) {
      keep[index] = 1;
      stack.push([start, index], [index, end]);
    }
  }
  const out: number[] = [];
  for (let i = 0; i < points.length; i++) if (keep[i]) out.push(i);
  return out;
}
