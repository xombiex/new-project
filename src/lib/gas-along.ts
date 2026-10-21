import { haversine, type LngLat } from '@/lib/geo';
import { snap, type NavRoute } from '@/lib/navigation';
import { tilePlaces, tileXY, type TilePlace } from '@/lib/regroup';

/** A gas station near the road ahead: how far along the route, and how far off it. */
export type GasStop = { name: string; coord: LngLat; aheadM: number; offRouteM: number };

/** Look this far down the route, and at stations at most this far off it. */
const LOOK_AHEAD_M = 40_000;
const MAX_OFF_ROUTE_M = 500;
/** Skip anything you're basically already at. */
const MIN_AHEAD_M = 150;

/** Map tiles the road ahead passes through (sampled every ~500 m), nearest first. */
export function tilesAhead(route: Pick<NavRoute, 'geometry' | 'cumulative'>, fromAlong: number, lookAheadM = LOOK_AHEAD_M): [number, number][] {
  const seen = new Set<string>();
  const out: [number, number][] = [];
  let nextSample = fromAlong;
  for (let i = 0; i < route.geometry.length; i++) {
    const along = route.cumulative[i];
    if (along < fromAlong) continue;
    if (along > fromAlong + lookAheadM) break;
    if (along < nextSample && i !== route.geometry.length - 1) continue;
    nextSample = along + 500;
    const [x, y] = tileXY(route.geometry[i]);
    const key = `${x}/${y}`;
    if (!seen.has(key)) {
      seen.add(key);
      out.push([x, y]);
    }
  }
  return out;
}

/** Of these places, the gas stations close to the route ahead, in the order you'll reach them. */
export function stopsAlong(places: TilePlace[], route: Pick<NavRoute, 'geometry' | 'cumulative'>, fromAlong: number, fromSegment = 0): GasStop[] {
  const out: GasStop[] = [];
  for (const p of places) {
    if (p.kind !== 'fuel') continue;
    const s = snap(route, p.coord, fromSegment);
    const ahead = s.along - fromAlong;
    if (s.offsetM > MAX_OFF_ROUTE_M || ahead < MIN_AHEAD_M || ahead > LOOK_AHEAD_M) continue;
    // Same station from two neighbouring tiles: keep one.
    if (out.some((o) => o.name === p.name && haversine(o.coord, p.coord) < 40)) continue;
    out.push({ name: p.name, coord: p.coord, aheadM: ahead, offRouteM: s.offsetM });
  }
  return out.sort((a, b) => a.aheadM - b.aheadM);
}

/** Gas stations along the road ahead (first ~25 mi), soonest first. */
export async function gasAlong(route: NavRoute, fromAlong: number, fromSegment: number, signal?: AbortSignal): Promise<GasStop[]> {
  const tiles = tilesAhead(route, fromAlong).slice(0, 36);
  const places = (await Promise.all(tiles.map(([x, y]) => tilePlaces(x, y, signal).catch(() => [] as TilePlace[])))).flat();
  return stopsAlong(places, route, fromAlong, fromSegment);
}
