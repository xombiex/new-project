import type { LngLat } from '@/lib/geo';
import type { OsrmStep } from '@/lib/instructions';

/**
 * Free, keyless OpenStreetMap services. Both public endpoints are fair-use only;
 * point the env vars at a self-hosted instance (or a paid host) once usage grows.
 */
const PHOTON_URL = process.env.EXPO_PUBLIC_PHOTON_URL ?? 'https://photon.komoot.io';
const OSRM_URL = process.env.EXPO_PUBLIC_OSRM_URL ?? 'https://router.project-osrm.org';

export type Place = {
  id: string;
  name: string;
  detail: string;
  coord: LngLat;
};

type PhotonFeature = {
  geometry: { coordinates: LngLat };
  properties: {
    osm_id: number;
    osm_type: string;
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
    return { id: `${p.osm_type}${p.osm_id}`, name, detail, coord: f.geometry.coordinates };
  });
}

export type Route = {
  distanceM: number;
  durationS: number;
  geometry: LngLat[];
  /** turn-by-turn maneuvers (single leg) */
  steps: OsrmStep[];
  /** cameras along this route, when known */
  cameras?: { speed: number; alpr: number };
};

/** Driving routes, best first (includes alternatives when the router finds them). */
export async function getRoutes(from: LngLat, to: LngLat, signal?: AbortSignal): Promise<Route[]> {
  const coords = `${from[0]},${from[1]};${to[0]},${to[1]}`;
  const res = await fetch(
    // Up to 3 alternatives: more choices for camera-avoiding routes.
    `${OSRM_URL}/route/v1/driving/${coords}?overview=full&geometries=geojson&alternatives=3&steps=true`,
    { signal }
  );
  if (!res.ok) throw new Error(`Routing failed (${res.status})`);
  const json: {
    code: string;
    routes: { distance: number; duration: number; geometry: { coordinates: LngLat[] }; legs: { steps: OsrmStep[] }[] }[];
  } = await res.json();
  if (json.code !== 'Ok') throw new Error(json.code === 'NoRoute' ? 'No driving route found' : 'Routing failed');
  return json.routes.map((r) => ({
    distanceM: r.distance,
    durationS: r.duration,
    geometry: r.geometry.coordinates,
    steps: r.legs.flatMap((l) => l.steps),
  }));
}
