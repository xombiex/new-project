import { haversine, type LngLat } from '@/lib/geo';
import { SITE_URL } from '@/lib/site';

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

export type SpeedLimit = {
  value: number;
  unit: 'mph' | 'kmh';
  /** not posted in OpenStreetMap: the usual limit for that kind of street (e.g. 25 mph residential in the US) */
  estimated?: boolean;
};
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

type RawRoad = {
  id: number;
  name: string | null;
  maxspeed: string | null;
  forward: string | null;
  backward: string | null;
  highway: string | null;
  oneway: boolean;
  coords: LngLat[];
};

/** Rough box for the contiguous US, Alaska and Hawaii, where the defaults below apply. */
function inUS([lng, lat]: LngLat) {
  return (lat > 24.4 && lat < 49.4 && lng > -125 && lng < -66.9) || (lat > 51 && lat < 71.5 && lng > -170 && lng < -129.9) || (lat > 18.8 && lat < 22.4 && lng > -160.5 && lng < -154.7);
}

/**
 * Most residential streets have no limit tagged in OpenStreetMap. In the US the usual default for
 * them is 25 mph, so show that, marked as an estimate (it's drawn differently). Elsewhere, and on
 * every other kind of road, an untagged limit stays unknown.
 */
export function estimatedLimit(highway: string | null, at: LngLat): SpeedLimit | null {
  if (!inUS(at)) return null;
  if (highway === 'residential') return { value: 25, unit: 'mph', estimated: true };
  if (highway === 'service_other') return null;
  if (highway === 'living_street') return { value: 15, unit: 'mph', estimated: true };
  return null;
}

export function toRoad(raw: RawRoad): Road {
  const posted = parseMaxspeed(raw.maxspeed ?? undefined) ?? parseMaxspeed(raw.forward ?? undefined) ?? parseMaxspeed(raw.backward ?? undefined);
  return {
    id: raw.id,
    name: raw.name ?? undefined,
    limit: posted ?? estimatedLimit(raw.highway, raw.coords[0]),
    oneway: raw.oneway,
    coords: raw.coords,
  };
}

/** Running in a web browser (the phone apps have no DOM). */
const isBrowser = () => typeof document !== 'undefined';

/** Lookups use a 0.01° grid (≈1 km) so nearby drivers share cached answers. Ways crossing a cell edge come back whole. */
const CELL = 0.01;
export function roadsCell([lng, lat]: LngLat): string {
  return `${Math.floor(lng / CELL)},${Math.floor(lat / CELL)}`;
}
function cellBox(pos: LngLat): [number, number, number, number] {
  const x = Math.floor(pos[0] / CELL);
  const y = Math.floor(pos[1] / CELL);
  const f = (v: number) => Number((v * CELL).toFixed(2));
  return [f(x), f(y), f(x + 1), f(y + 1)];
}

async function fromProxy(base: string, box: [number, number, number, number], signal?: AbortSignal): Promise<RawRoad[]> {
  const res = await fetch(`${base}/api/roads?bbox=${box.join(',')}`, { signal });
  if (!res.ok) throw new Error(`roads ${res.status}`);
  const json = (await res.json()) as { roads?: RawRoad[] };
  if (!json.roads) throw new Error('roads: bad response');
  return json.roads;
}

async function fromOverpass(url: string, [w, s2, e, n]: [number, number, number, number], signal?: AbortSignal): Promise<RawRoad[]> {
  const box = `${s2},${w},${n},${e}`;
  const query = `[out:json][timeout:15];way[highway~"^(${CAR_ROADS})$"](${box});out tags geom;`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `data=${encodeURIComponent(query)}`,
    signal,
  });
  if (!res.ok) throw new Error(`Overpass ${res.status}`);
  const json = (await res.json()) as { elements: OverpassWay[] };
  return json.elements
    .filter((w2) => w2.geometry && w2.geometry.length > 1)
    .map((w2) => ({
      id: w2.id,
      name: w2.tags?.name ?? w2.tags?.ref ?? null,
      maxspeed: w2.tags?.maxspeed ?? null,
      forward: w2.tags?.['maxspeed:forward'] ?? null,
      backward: w2.tags?.['maxspeed:backward'] ?? null,
      highway: w2.tags?.highway ?? null,
      oneway: w2.tags?.oneway === 'yes' || w2.tags?.highway === 'motorway' || w2.tags?.junction === 'roundabout',
      coords: w2.geometry!.map((g) => [g.lon, g.lat] as LngLat),
    }));
}

type OverpassWay = { id: number; tags?: Record<string, string>; geometry?: { lat: number; lon: number }[] };

/**
 * Roads around a point (about a kilometer each way). Browsers can't call Overpass directly (the
 * main server turns them away), so the web app goes through Convoy's cached proxy first; the
 * phone apps call Overpass directly and fall back to the proxy.
 */
export async function fetchRoads(center: LngLat, _radiusM: number, signal?: AbortSignal): Promise<Road[]> {
  const box = cellBox(center);
  const proxy = (base: string) => () => fromProxy(base, box, signal);
  const direct = (url: string) => () => fromOverpass(url, box, signal);
  const sources =
    isBrowser()
      ? [proxy(''), ...OVERPASS_URLS.slice(1).map(direct)]
      : [...OVERPASS_URLS.slice(0, 1).map(direct), proxy(SITE_URL), ...OVERPASS_URLS.slice(1).map(direct)];
  let lastError: unknown = null;
  for (const source of sources) {
    try {
      return (await source()).map(toRoad);
    } catch (e) {
      if (signal?.aborted) throw e;
      lastError = e;
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Map data unavailable');
}

/** Refetch once the driver gets this close to the edge of the area we already have. */
export function needsRefetch(fetchedAt: LngLat | null, radiusM: number, pos: LngLat) {
  return !fetchedAt || haversine(fetchedAt, pos) > radiusM * 0.6;
}

// ─── Live lookup: snap your recent track to the road (Valhalla) ──────────

const VALHALLA_URL = process.env.EXPO_PUBLIC_VALHALLA_URL ?? 'https://valhalla1.openstreetmap.de';

export type TracedRoad = { limit: SpeedLimit | null; name: string | null; roadClass: string | null };

type TraceEdge = { speed_limit?: number; road_class?: string; names?: string[] };

/**
 * Valhalla stores limits in km/h ("35 mph" becomes 56). In the US show them in mph, snapped to the
 * nearest 5 like real signs.
 */
export function limitFromKmh(kmh: number | undefined, at: LngLat): SpeedLimit | null {
  if (!kmh || kmh <= 0 || kmh > 200) return null;
  if (inUS(at)) {
    const mph = kmh / 1.609344;
    return { value: Math.round(mph / 5) * 5, unit: 'mph' };
  }
  return { value: Math.round(kmh), unit: 'kmh' };
}

/** The road at the end of an edge list: posted limit, or the usual one for its type, and its name. */
export function roadFromEdges(edges: TraceEdge[], at: LngLat): TracedRoad | null {
  const last = edges.at(-1);
  if (!last) return null;
  const roadClass = last.road_class ?? null;
  return {
    limit: limitFromKmh(last.speed_limit, at) ?? estimatedLimit(roadClass, at),
    name: last.names?.[0] ?? null,
    roadClass,
  };
}

/**
 * The road you're on right now, from your last few positions (oldest first): fast (well under a
 * second) and works everywhere OpenStreetMap does. Returns null if the track can't be matched.
 */
export async function traceRoad(points: LngLat[], signal?: AbortSignal): Promise<TracedRoad | null> {
  if (points.length < 2) return null;
  const body = {
    shape: points.map(([lng, lat]) => ({ lat: Number(lat.toFixed(6)), lon: Number(lng.toFixed(6)) })),
    costing: 'auto',
    shape_match: 'map_snap',
    filters: { attributes: ['edge.speed_limit', 'edge.road_class', 'edge.names'], action: 'include' },
  };
  const res = await fetch(`${VALHALLA_URL}/trace_attributes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
  if (res.status === 400) return null; // couldn't match this bit of track (parking lot, GPS jump)
  if (!res.ok) throw new Error(`Valhalla ${res.status}`);
  const json = (await res.json()) as { edges?: TraceEdge[] };
  return roadFromEdges(json.edges ?? [], points.at(-1)!);
}
