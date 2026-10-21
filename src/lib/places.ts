import type { LngLat } from '@/lib/geo';
import type { OsrmStep } from '@/lib/instructions';

/**
 * Free, keyless OpenStreetMap services. Both public endpoints are fair-use only;
 * point the env vars at a self-hosted instance (or a paid host) once usage grows.
 */
const PHOTON_URL = process.env.EXPO_PUBLIC_PHOTON_URL ?? 'https://photon.komoot.io';
const OSRM_URL = process.env.EXPO_PUBLIC_OSRM_URL ?? 'https://router.project-osrm.org';
/** Valhalla (OpenStreetMap's own router) does the routes OSRM can't: shortest, and no highways. */
const VALHALLA_URL = process.env.EXPO_PUBLIC_VALHALLA_URL ?? 'https://valhalla1.openstreetmap.de';

export type Place = {
  id: string;
  name: string;
  detail: string;
  coord: LngLat;
  /** e.g. "Restaurant", "Gas station" (from the OSM tag) */
  category?: string;
};

type PhotonFeature = {
  geometry: { coordinates: LngLat };
  properties: {
    osm_id: number;
    osm_type: string;
    osm_key?: string;
    osm_value?: string;
    name?: string;
    housenumber?: string;
    street?: string;
    city?: string;
    state?: string;
    country?: string;
  };
};

export async function searchPlaces(query: string, near?: LngLat, signal?: AbortSignal): Promise<Place[]> {
  const q = query.trim();
  if (q.length < 3) return [];
  const params = new URLSearchParams({ q, limit: '8', lang: 'en' });
  if (near) {
    params.set('lon', String(near[0]));
    params.set('lat', String(near[1]));
  }
  const res = await fetch(`${PHOTON_URL}/api/?${params}`, { signal });
  if (!res.ok) throw new Error(`Search failed (${res.status})`);
  const json: { features: PhotonFeature[] } = await res.json();
  return json.features.map((f) => {
    const p = f.properties;
    const street = [p.housenumber, p.street].filter(Boolean).join(' ');
    const name = p.name ?? (street || p.city || 'Unnamed place');
    const detail = [p.name ? street : null, p.city, p.state, p.country].filter(Boolean).join(', ');
    const kind = p.osm_value && p.osm_value !== 'yes' && !['house', 'residential', 'street', 'road'].includes(p.osm_value) ? p.osm_value : null;
    const category = kind ? (p.osm_key === 'shop' && kind !== 'supermarket' ? `${kind} store` : kind).replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase()) : undefined;
    return { id: `${p.osm_type}${p.osm_id}`, name, detail, coord: f.geometry.coordinates, category };
  });
}

/** How a route was asked for, so rerouting keeps the same choice. */
export type RouteMode = 'fastest' | 'shortest' | 'no-highways' | 'twisty';
/** What a route is best at (one route can be several). */
export type RouteTag = 'fastest' | 'shortest' | 'fewest-turns' | 'no-highways' | 'twisty';

export const ROUTE_TAG_LABEL: Record<RouteTag, string> = {
  fastest: 'Fastest',
  shortest: 'Shortest',
  'fewest-turns': 'Fewest turns',
  'no-highways': 'No highways',
  twisty: 'Twisty roads',
};

export type Route = {
  distanceM: number;
  durationS: number;
  geometry: LngLat[];
  /** turn-by-turn maneuvers (single leg) */
  steps: OsrmStep[];
  /** cameras along this route, when known */
  cameras?: { speed: number; redlight: number; alpr: number };
  mode?: RouteMode;
  tags?: RouteTag[];
  /** real turns (not "continue" or name changes) */
  turns?: number;
  /** how bendy the road itself is: gentle-to-sharp curves per km (see curviness) */
  curviness?: number;
};

type OsrmJson = {
  code: string;
  routes: { distance: number; duration: number; geometry: { coordinates: LngLat[] }; legs: { steps: OsrmStep[] }[] }[];
};

const TURN_TYPES = new Set(['turn', 'end of road', 'fork', 'on ramp', 'off ramp', 'roundabout', 'rotary', 'roundabout turn']);

/** Count the maneuvers a driver actually has to make. */
export function countTurns(steps: OsrmStep[]): number {
  return steps.filter((s) => TURN_TYPES.has(s.maneuver.type) && s.maneuver.modifier !== 'straight').length;
}

function parse(json: OsrmJson, mode: RouteMode): Route[] {
  if (json.code !== 'Ok') throw new Error(json.code === 'NoRoute' ? 'No driving route found' : 'Routing failed');
  return json.routes.map((r) => {
    const steps = r.legs.flatMap((l) => l.steps);
    const geometry = r.geometry.coordinates;
    return { distanceM: r.distance, durationS: r.duration, geometry, steps, mode, turns: countTurns(steps), curviness: curviness(geometry) };
  });
}

function bearingDeg(a: LngLat, b: LngLat) {
  const k = Math.cos((a[1] * Math.PI) / 180);
  return (Math.atan2((b[0] - a[0]) * k, b[1] - a[1]) * 180) / Math.PI;
}

/**
 * How twisty a road is, in degrees of bending per km. Only gentle-to-tight bends count
 * (4°–75° between ~20 m pieces of road), so right-angle turns at city intersections don't make a
 * grid of streets look "twisty"; curves on a back road do.
 */
export function curviness(geometry: LngLat[]): number {
  // Resample to pieces of at least ~20 m so GPS-dense geometry and tiny kinks don't add noise.
  const pts: LngLat[] = [];
  let lengthM = 0;
  for (const p of geometry) {
    const last = pts.at(-1);
    if (!last) pts.push(p);
    else {
      const d = Math.hypot((p[0] - last[0]) * 111_320 * Math.cos((p[1] * Math.PI) / 180), (p[1] - last[1]) * 110_574);
      if (d >= 20) {
        pts.push(p);
        lengthM += d;
      }
    }
  }
  if (pts.length < 3 || lengthM < 500) return 0;
  let bend = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    let d = Math.abs(bearingDeg(pts[i], pts[i + 1]) - bearingDeg(pts[i - 1], pts[i])) % 360;
    if (d > 180) d = 360 - d;
    if (d >= 4 && d <= 75) bend += d;
  }
  return Math.round(bend / (lengthM / 1000));
}

/** Valhalla answering in OSRM's format, so the rest of the app doesn't care which router it was. */
async function valhalla(from: LngLat, to: LngLat, mode: Exclude<RouteMode, 'fastest'>, signal?: AbortSignal): Promise<Route[]> {
  // Twisty uses the no-highways router with alternatives, then picks the bendiest.
  const body = {
    locations: [
      { lon: from[0], lat: from[1] },
      { lon: to[0], lat: to[1] },
    ],
    costing: 'auto',
    costing_options: { auto: mode === 'shortest' ? { shortest: true } : { use_highways: 0 } },
    // Back-road candidates for the Twisty roads option.
    ...(mode === 'twisty' ? { alternates: 3 } : {}),
    format: 'osrm',
    shape_format: 'geojson',
  };
  const res = await fetch(`${VALHALLA_URL}/route?json=${encodeURIComponent(JSON.stringify(body))}`, { signal });
  if (!res.ok) throw new Error(`Routing failed (${res.status})`);
  return parse(await res.json(), mode);
}

/** Best route for one way of driving (used when rerouting mid-drive). */
export async function routeFor(mode: RouteMode, from: LngLat, to: LngLat, signal?: AbortSignal): Promise<Route | undefined> {
  if (mode === 'fastest') return (await getRoutes(from, to, signal))[0];
  if (mode === 'twisty') return pickTwisty(await valhalla(from, to, 'twisty', signal));
  return (await valhalla(from, to, mode, signal))[0];
}

/** Same road, give or take: within 2% on both distance and time. */
export function sameRoute(a: Pick<Route, 'distanceM' | 'durationS'>, b: Pick<Route, 'distanceM' | 'durationS'>) {
  return (
    Math.abs(a.distanceM - b.distanceM) / Math.max(a.distanceM, 1) < 0.02 &&
    Math.abs(a.durationS - b.durationS) / Math.max(a.durationS, 1) < 0.02
  );
}

const TAG_ORDER: RouteTag[] = ['fastest', 'shortest', 'fewest-turns', 'no-highways', 'twisty'];

/** The bendiest route that isn't a silly detour (at most 60% longer than the quickest one). */
export function pickTwisty(candidates: Route[], fastestS = Math.min(...candidates.map((r) => r.durationS))): Route | undefined {
  const ok = candidates.filter((r) => r.durationS <= fastestS * 1.6 && (r.curviness ?? 0) > 0);
  return ok.reduce<Route | undefined>((best, r) => (!best || (r.curviness ?? 0) > (best.curviness ?? 0) ? r : best), undefined);
}

/**
 * Tag each candidate with what it's best at, merge near-duplicates (so one route can be
 * "Fastest · Fewest turns"), and order them: fastest first, untagged alternatives last.
 */
export function labelRoutes(fastRoutes: Route[], shortest?: Route, noHighways?: Route, twistyCandidates: Route[] = []): Route[] {
  const all = [...fastRoutes, ...(shortest ? [shortest] : []), ...(noHighways ? [noHighways] : [])];
  if (all.length === 0) return [];
  const by = (f: (r: Route) => number) => all.reduce((best, r) => (f(r) < f(best) ? r : best));
  const tagsFor = new Map<Route, Set<RouteTag>>(all.map((r) => [r, new Set<RouteTag>()]));
  tagsFor.get(by((r) => r.durationS))!.add('fastest');
  tagsFor.get(by((r) => r.distanceM))!.add('shortest');
  tagsFor.get(by((r) => r.turns ?? Infinity))!.add('fewest-turns');
  if (noHighways) tagsFor.get(noHighways)!.add('no-highways');

  // Twisty roads: the bendiest of everything we have (back-road alternatives included), if it's
  // clearly bendier than the quickest route; otherwise there's no twisty option worth showing.
  const fastest = by((r) => r.durationS);
  const twisty = pickTwisty([...all, ...twistyCandidates], fastest.durationS);
  if (twisty && (twisty.curviness ?? 0) >= Math.max(25, (fastest.curviness ?? 0) * 1.3)) {
    if (!tagsFor.has(twisty)) {
      all.push(twisty);
      tagsFor.set(twisty, new Set());
    }
    tagsFor.get(twisty)!.add('twisty');
  }

  // Merge duplicates into the first copy (OSRM's fastest comes first and has the better time estimate).
  const out: Route[] = [];
  for (const r of all) {
    const twin = out.find((o) => sameRoute(o, r));
    if (twin) twin.tags = [...new Set([...(twin.tags ?? []), ...tagsFor.get(r)!])];
    else out.push({ ...r, tags: [...tagsFor.get(r)!] });
  }
  const rank = (r: Route) => Math.min(...(r.tags ?? []).map((t) => TAG_ORDER.indexOf(t)), TAG_ORDER.length);
  for (const r of out) r.tags = [...(r.tags ?? [])].sort((a, b) => TAG_ORDER.indexOf(a) - TAG_ORDER.indexOf(b));
  return out.sort((a, b) => rank(a) - rank(b) || a.durationS - b.durationS).slice(0, 6);
}

/** The choices shown before you go: fastest (plus alternatives), shortest, fewest turns and no highways. */
export async function getRouteOptions(from: LngLat, to: LngLat, signal?: AbortSignal, onFastest?: (routes: Route[]) => void): Promise<Route[]> {
  // The quickest router answers first: hand its routes over right away so the line can be drawn
  // while the slower route kinds (shortest, no highways, twisty) are still coming in.
  const fastest = getRoutes(from, to, signal);
  if (onFastest) fastest.then((r) => !signal?.aborted && r.length && onFastest(labelRoutes(r)), () => {});
  const [fast, short, noHwy, twisty] = await Promise.allSettled([
    fastest,
    valhalla(from, to, 'shortest', signal),
    valhalla(from, to, 'no-highways', signal),
    valhalla(from, to, 'twisty', signal),
  ]);
  const ok = (r: PromiseSettledResult<Route[]>) => (r.status === 'fulfilled' ? r.value : []);
  const routes = labelRoutes(ok(fast), ok(short)[0], ok(noHwy)[0], ok(twisty).map((r) => ({ ...r, mode: 'twisty' as const })));
  if (routes.length === 0) {
    const failed = [fast, short, noHwy].find((r) => r.status === 'rejected') as PromiseRejectedResult | undefined;
    throw failed?.reason instanceof Error ? failed.reason : new Error('Routing failed');
  }
  return routes;
}

/** Fastest route that stops at `via` on the way to `to` (e.g. a gas station). */
export async function routeVia(from: LngLat, via: LngLat, to: LngLat, signal?: AbortSignal): Promise<Route | undefined> {
  const coords = [from, via, to].map((c) => `${c[0]},${c[1]}`).join(';');
  const res = await fetch(`${OSRM_URL}/route/v1/driving/${coords}?overview=full&geometries=geojson&steps=true`, { signal });
  if (!res.ok) throw new Error(`Routing failed (${res.status})`);
  return parse(await res.json(), 'fastest')[0];
}

/** Driving routes, best first (includes alternatives when the router finds them). */
export async function getRoutes(from: LngLat, to: LngLat, signal?: AbortSignal): Promise<Route[]> {
  const coords = `${from[0]},${from[1]};${to[0]},${to[1]}`;
  const res = await fetch(
    // Up to 3 alternatives: more choices for camera-avoiding routes.
    `${OSRM_URL}/route/v1/driving/${coords}?overview=full&geometries=geojson&alternatives=3&steps=true`,
    { signal }
  );
  if (!res.ok) throw new Error(`Routing failed (${res.status})`);
  return parse(await res.json(), 'fastest');
}
