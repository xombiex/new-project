import { VectorTile } from '@mapbox/vector-tile';
import { PbfReader } from 'pbf';

import { haversine, type LngLat } from '@/lib/geo';

/**
 * Regroup points: a gas station (or a parking lot) a little way ahead, where a convoy can pull
 * over and gather. Places come straight from the map's own vector tiles (OpenFreeMap), so it's
 * instant, free and works everywhere the map does.
 */
const TILEJSON = process.env.EXPO_PUBLIC_MAP_TILES_URL ?? 'https://tiles.openfreemap.org/planet';
const Z = 14;

export type RegroupSpot = { name: string; kind: 'fuel' | 'parking'; coord: LngLat; distanceM: number };

let template: Promise<string> | null = null;
function tileTemplate(): Promise<string> {
  template ??= fetch(TILEJSON)
    .then((r) => r.json() as Promise<{ tiles: string[] }>)
    .then((j) => j.tiles[0])
    .catch((e) => {
      template = null;
      throw e;
    });
  return template;
}

function tileXY([lng, lat]: LngLat): [number, number] {
  const n = 2 ** Z;
  const rad = (lat * Math.PI) / 180;
  return [Math.floor(((lng + 180) / 360) * n), Math.floor(((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n)];
}

function toLngLat(tx: number, ty: number, px: number, py: number, extent: number): LngLat {
  const n = 2 ** Z;
  const x = (tx + px / extent) / n;
  const y = (ty + py / extent) / n;
  return [x * 360 - 180, (Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) * 180) / Math.PI];
}

/** Gas stations and parking in the 3×3 map tiles (≈4–5 km square) around a point. */
export async function placesAround(center: LngLat, signal?: AbortSignal): Promise<Omit<RegroupSpot, 'distanceM'>[]> {
  const url = await tileTemplate();
  const [cx, cy] = tileXY(center);
  const tiles: [number, number][] = [];
  for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) tiles.push([cx + dx, cy + dy]);
  const found = await Promise.all(
    tiles.map(async ([x, y]) => {
      const res = await fetch(url.replace('{z}', String(Z)).replace('{x}', String(x)).replace('{y}', String(y)), { signal });
      if (!res.ok) return [];
      const layer = new VectorTile(new PbfReader(new Uint8Array(await res.arrayBuffer()))).layers.poi;
      const out: Omit<RegroupSpot, 'distanceM'>[] = [];
      for (let i = 0; i < (layer?.length ?? 0); i++) {
        const f = layer.feature(i);
        const cls = f.properties.class;
        if (cls !== 'fuel' && cls !== 'parking') continue;
        // EV chargers are tagged like gas stations; they're no place for a mixed convoy to gather.
        const nm = String(f.properties.name ?? '');
        if (f.properties.subclass === 'charging_station' || /supercharger|charging|chargepoint|evgo|electrify|blink/i.test(nm)) continue;
        const pt = f.loadGeometry()[0]?.[0];
        if (!pt) continue;
        out.push({
          name: String(f.properties.name ?? f.properties['name:latin'] ?? '') || (cls === 'fuel' ? 'Gas station' : 'Parking lot'),
          kind: cls,
          coord: toLngLat(x, y, pt.x, pt.y, layer.extent),
        });
      }
      return out;
    })
  );
  return found.flat();
}

/** A point `m` meters from `a` toward `b` (or `a` itself if they're closer than that). */
function toward(a: LngLat, b: LngLat, m: number): LngLat {
  const d = haversine(a, b);
  if (d <= m) return b;
  const t = m / d;
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

/** A point `m` meters from `a` along a compass heading. */
function ahead(a: LngLat, heading: number, m: number): LngLat {
  const rad = (heading * Math.PI) / 180;
  return [a[0] + (Math.sin(rad) * m) / (111_320 * Math.cos((a[1] * Math.PI) / 180)), a[1] + (Math.cos(rad) * m) / 110_574];
}

/**
 * Where to gather: from the middle of the group, a third of the way to the destination (between
 * 3 and 10 km), or about 3 km ahead of the leader if there's no destination.
 */
export function regroupTarget(group: LngLat[], destination: LngLat | null, leaderHeading: number | null): LngLat | null {
  if (group.length === 0) return null;
  const mid: LngLat = [group.reduce((s, p) => s + p[0], 0) / group.length, group.reduce((s, p) => s + p[1], 0) / group.length];
  if (destination) return toward(mid, destination, Math.min(10_000, Math.max(3_000, haversine(mid, destination) / 3)));
  if (leaderHeading != null) return ahead(mid, leaderHeading, 3_000);
  return mid;
}

/**
 * Up to `count` places to regroup near the target: gas stations first (room to park, restrooms,
 * snacks), then named parking lots, nearest first. Distances are from `from` (you).
 */
export function pickSpots(places: Omit<RegroupSpot, 'distanceM'>[], target: LngLat, from: LngLat, count = 3): RegroupSpot[] {
  // A gas station wins unless a lot is much closer (800 m for a named lot, 1.5 km for a nameless one).
  const score = (p: Omit<RegroupSpot, 'distanceM'>) => haversine(p.coord, target) + (p.kind === 'fuel' ? 0 : p.name === 'Parking lot' ? 1500 : 800);
  const seen = new Set<string>();
  return [...places]
    .sort((a, b) => score(a) - score(b))
    .filter((p) => {
      const key = `${p.name}@${p.coord[0].toFixed(3)},${p.coord[1].toFixed(3)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, count)
    .map((p) => ({ ...p, distanceM: haversine(from, p.coord) }));
}

/** Within this distance of the regroup point counts as "here". */
export const REGROUP_HERE_M = 120;
