import { haversine, type LngLat } from '@/lib/geo';

export type PrivacyZone = { id: string; name: string; lat: number; lng: number; radiusM: number };

export function inZone(point: LngLat, zones: PrivacyZone[]): boolean {
  return zones.some((z) => haversine(point, [z.lng, z.lat]) <= z.radiusM);
}

/**
 * Removes every point inside a privacy zone, so shared routes never reveal where a
 * zone (home, work) is. Segments are split where the route passes through a zone.
 */
export function hideZones(path: LngLat[], zones: PrivacyZone[]): LngLat[][] {
  if (zones.length === 0) return path.length > 1 ? [path] : [];
  const segments: LngLat[][] = [];
  let current: LngLat[] = [];
  for (const p of path) {
    if (inZone(p, zones)) {
      if (current.length > 1) segments.push(current);
      current = [];
    } else current.push(p);
  }
  if (current.length > 1) segments.push(current);
  return segments;
}
