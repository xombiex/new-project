import { haversine, type LngLat } from '@/lib/geo';

/**
 * Posted speed limits from OpenStreetMap `maxspeed` tags, fetched through the free Overpass API.
 * Point EXPO_PUBLIC_OVERPASS_URL at a self-hosted Overpass (or a paid host) once usage grows.
 */
const OVERPASS_URLS = process.env.EXPO_PUBLIC_OVERPASS_URL
  ? [process.env.EXPO_PUBLIC_OVERPASS_URL]
  : ['https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter'];

/** Roads cars drive on. Paths, tracks and footways are left out so they can't be matched. */
const CAR_ROADS =
  'motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|service|motorway_link|trunk_link|primary_link|secondary_link|tertiary_link';

export type SpeedLimit = { value: number; unit: 'mph' | 'kmh' };
export type Road = { id: number; name?: string; limit: SpeedLimit | null; oneway: boolean; coords: LngLat[] };

/** "45 mph" → 45 mph, "50" → 50 km/h (OSM's default unit). "none", "signals", "walk"… → null. */
export function parseMaxspeed(tag: string | undefined): SpeedLimit | null {
  if (!tag) return null;
  const m = /^\s*(\d+(?:\.\d+)?)\s*(mph|km\/h|kmh|kph)?\s*$/i.exec(tag.split(';')[0]);
  if (!m) return null;
  const value = Math.round(Number(m[1]));
  if (!value) return null;
  return { value, unit: m[2]?.toLowerCase() === 'mph' ? 'mph' : 'kmh' };
}

/** The limit converted to the user's units, rounded to a sign-like number. */
export function limitIn(units: 'imperial' | 'metric', limit: SpeedLimit): number {
  if (units === 'imperial') return limit.unit === 'mph' ? limit.value : Math.round(limit.value / 1.609344);
  return limit.unit === 'kmh' ? limit.value : Math.round(limit.value * 1.609344);
}

/** Limit in meters per second, for comparing against GPS speed. */
export function limitMps(limit: SpeedLimit): number {
  return limit.unit === 'mph' ? limit.value / 2.236936 : limit.value / 3.6;
}

// ─── Matching ────────────────────────────────────────────────────────────

/** Distance in meters from p to segment ab (equirectangular; accurate at street scale). */
function segmentDistance(p: LngLat, a: LngLat, b: LngLat) {
  const k = Math.cos((p[1] * Math.PI) / 180) * 111_320;
  const [px, py] = [p[0] * k, p[1] * 110_574];
  const [ax, ay] = [a[0] * k, a[1] * 110_574];
  const [bx, by] = [b[0] * k, b[1] * 110_574];
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  const bearingDeg = (Math.atan2(dx, dy) * 180) / Math.PI;
  return { dist: Math.hypot(px - (ax + t * dx), py - (ay + t * dy)), bearing: (bearingDeg + 360) % 360 };
}

function angleDiff(a: number, b: number) {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

/**
 * The road the driver is on: the nearest segment within `maxDist`, where segments that run the
 * way the car is heading win over close-by cross streets and parallel roads.
 */
export function matchRoad(roads: Road[], pos: LngLat, heading: number | null, maxDist = 30): Road | null {
  let best: Road | null = null;
  let bestScore = Infinity;
  for (const road of roads) {
    for (let i = 1; i < road.coords.length; i++) {
      const { dist, bearing } = segmentDistance(pos, road.coords[i - 1], road.coords[i]);
      if (dist > maxDist) continue;
      let score = dist;
      if (heading != null) {
        // A two-way street is fine in either direction; a one-way only forward.
        const off = road.oneway ? angleDiff(heading, bearing) : Math.min(angleDiff(heading, bearing), angleDiff(heading, bearing + 180));
        score += off > 50 ? 40 : off * 0.3;
      }
      if (score < bestScore) {
        bestScore = score;
        best = road;
      }
    }
  }
  return best;
}

// ─── Fetching ────────────────────────────────────────────────────────────

type OverpassWay = { id: number; tags?: Record<string, string>; geometry?: { lat: number; lon: number }[] };

export async function fetchRoads(center: LngLat, radiusM: number, signal?: AbortSignal): Promise<Road[]> {
  const [lng, lat] = center;
  // A bounding box is much quicker for Overpass than an `around:` radius search.
  const dLat = radiusM / 110_574;
  const dLng = radiusM / (111_320 * Math.cos((lat * Math.PI) / 180));
  const box = `${(lat - dLat).toFixed(5)},${(lng - dLng).toFixed(5)},${(lat + dLat).toFixed(5)},${(lng + dLng).toFixed(5)}`;
  const query = `[out:json][timeout:15];way[highway~"^(${CAR_ROADS})$"](${box});out tags geom;`;
  let json: { elements: OverpassWay[] } | null = null;
  let lastError: unknown = null;
  // If the main server is busy, try the next one.
  for (const url of OVERPASS_URLS) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `data=${encodeURIComponent(query)}`,
        signal,
      });
      if (!res.ok) throw new Error(`Overpass ${res.status}`);
      json = (await res.json()) as { elements: OverpassWay[] };
      break;
    } catch (e) {
      if (signal?.aborted) throw e;
      lastError = e;
    }
  }
  if (!json) throw lastError instanceof Error ? lastError : new Error('Overpass unavailable');
  return json.elements
    .filter((w) => w.geometry && w.geometry.length > 1)
    .map((w) => ({
      id: w.id,
      name: w.tags?.name ?? w.tags?.ref,
      limit: parseMaxspeed(w.tags?.maxspeed),
      oneway: w.tags?.oneway === 'yes' || w.tags?.highway === 'motorway' || w.tags?.junction === 'roundabout',
      coords: w.geometry!.map((g) => [g.lon, g.lat] as LngLat),
    }));
}

/** Refetch once the driver gets this close to the edge of the area we already have. */
export function needsRefetch(fetchedAt: LngLat | null, radiusM: number, pos: LngLat) {
  return !fetchedAt || haversine(fetchedAt, pos) > radiusM * 0.6;
}
