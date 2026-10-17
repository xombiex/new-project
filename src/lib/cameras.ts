import { bearing, haversine, type LngLat } from '@/lib/geo';

/**
 * Road cameras from OpenStreetMap, via the free Overpass API (same endpoint as speed limits):
 *   - speed cameras: highway=speed_camera (mapped worldwide)
 *   - license-plate readers (Flock Safety and others): man_made=surveillance +
 *     surveillance:type=ALPR, mapped by volunteers through the DeFlock project (deflock.me)
 * Coverage is whatever the community has mapped; it is never complete.
 */
const OVERPASS_URL = process.env.EXPO_PUBLIC_OVERPASS_URL ?? 'https://overpass-api.de/api/interpreter';

export type CameraKind = 'speed' | 'alpr';
export type Camera = {
  id: number;
  kind: CameraKind;
  coord: LngLat;
  /** posted limit the camera enforces, when tagged */
  maxspeed?: string;
  /** e.g. "Flock Safety" */
  operator?: string;
  /** compass direction the camera faces, when tagged */
  direction?: number;
};

type OsmNode = { id: number; lat: number; lon: number; tags?: Record<string, string> };

function toCamera(n: OsmNode): Camera {
  const t = n.tags ?? {};
  const alpr = t['surveillance:type'] === 'ALPR';
  const dir = Number(t['camera:direction'] ?? t.direction);
  return {
    id: n.id,
    kind: alpr ? 'alpr' : 'speed',
    coord: [n.lon, n.lat],
    maxspeed: t.maxspeed,
    operator: t.manufacturer ?? t.operator ?? t.brand,
    direction: Number.isFinite(dir) ? dir : undefined,
  };
}

async function overpass(query: string, signal?: AbortSignal): Promise<Camera[]> {
  const res = await fetch(OVERPASS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `data=${encodeURIComponent(query)}`,
    signal,
  });
  if (!res.ok) throw new Error(`Overpass ${res.status}`);
  const json = (await res.json()) as { elements: OsmNode[] };
  return json.elements.filter((e) => typeof e.lat === 'number').map(toCamera);
}

const filters = (area: string) => `node["highway"="speed_camera"](${area});node["man_made"="surveillance"]["surveillance:type"="ALPR"](${area});`;

/**
 * Every camera in the square around a point. A bounding box is far quicker for Overpass than an
 * `around:` radius search with these tag filters (seconds instead of most of a minute).
 */
export function fetchCamerasAround(center: LngLat, radiusM: number, signal?: AbortSignal) {
  const dLat = radiusM / 110_574;
  const dLng = radiusM / (111_320 * Math.cos((center[1] * Math.PI) / 180));
  return fetchCamerasInBox([center[0] - dLng, center[1] - dLat, center[0] + dLng, center[1] + dLat], signal);
}

/** Every camera inside a bounding box [west, south, east, north]. */
export function fetchCamerasInBox([w, s, e, n]: [number, number, number, number], signal?: AbortSignal) {
  const area = `${s.toFixed(5)},${w.toFixed(5)},${n.toFixed(5)},${e.toFixed(5)}`;
  return overpass(`[out:json][timeout:40];(${filters(area)});out body;`, signal);
}

// ─── Geometry ────────────────────────────────────────────────────────────

function angleDiff(a: number, b: number) {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

/** Warn earlier at speed: about 20 seconds out, between 250 m and 1 km. */
export function cameraAlertDistance(speedMps: number) {
  return Math.min(1000, Math.max(250, speedMps * 20));
}

/** The nearest camera on the road ahead (within ~35° of the heading), if any is close enough. */
export function cameraAhead(cameras: Camera[], me: LngLat, heading: number | null, speedMps: number, kinds: CameraKind[]) {
  if (heading == null || speedMps < 3) return null;
  const max = cameraAlertDistance(speedMps);
  let best: { camera: Camera; distanceM: number } | null = null;
  for (const c of cameras) {
    if (!kinds.includes(c.kind)) continue;
    const d = haversine(me, c.coord);
    if (d > max || d < 15) continue;
    if (angleDiff(bearing(me, c.coord), heading) > 35) continue;
    // A camera facing away from us (the other carriageway) isn't ours.
    if (c.kind === 'speed' && c.direction != null && angleDiff(c.direction, heading + 180) > 90 && angleDiff(c.direction, heading) > 90) continue;
    if (!best || d < best.distanceM) best = { camera: c, distanceM: d };
  }
  return best;
}

/** Meters from point p to segment ab (equirectangular; fine at street scale). */
function segmentDistance(p: LngLat, a: LngLat, b: LngLat) {
  const k = Math.cos((p[1] * Math.PI) / 180) * 111_320;
  const [px, py, ax, ay, bx, by] = [p[0] * k, p[1] * 110_574, a[0] * k, a[1] * 110_574, b[0] * k, b[1] * 110_574];
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** Cameras a route passes (within `withinM` of its line), counted by kind. */
export function camerasOnRoute(route: LngLat[], cameras: Camera[], withinM = 30): Record<CameraKind, number> {
  const out: Record<CameraKind, number> = { speed: 0, alpr: 0 };
  if (route.length < 2) return out;
  // Cheap reject first: the route's bounding box, padded.
  let [w, s, e, n] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const [lng, lat] of route) {
    w = Math.min(w, lng);
    e = Math.max(e, lng);
    s = Math.min(s, lat);
    n = Math.max(n, lat);
  }
  const pad = 0.0005;
  for (const c of cameras) {
    const [lng, lat] = c.coord;
    if (lng < w - pad || lng > e + pad || lat < s - pad || lat > n + pad) continue;
    for (let i = 1; i < route.length; i++) {
      if (segmentDistance(c.coord, route[i - 1], route[i]) <= withinM) {
        out[c.kind]++;
        break;
      }
    }
  }
  return out;
}

/** Bounding box of several routes, padded a little: [west, south, east, north]. */
export function routesBox(routes: LngLat[][], padDeg = 0.005): [number, number, number, number] {
  let [w, s, e, n] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const r of routes)
    for (const [lng, lat] of r) {
      w = Math.min(w, lng);
      e = Math.max(e, lng);
      s = Math.min(s, lat);
      n = Math.max(n, lat);
    }
  return [w - padDeg, s - padDeg, e + padDeg, n + padDeg];
}
