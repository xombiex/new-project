import { haversine, type LngLat } from '@/lib/geo';

import { getJson } from './routing/http';

export type Place = {
  id: string;
  name: string;
  detail: string;
  coord: LngLat;
  /** e.g. "Restaurant", "Gas station" (from the OSM tag) */
  category?: string;
};

export interface GeocodingProvider {
  readonly name: string;
  /** Places matching what was typed, nearest first when `near` is given. Throws a RoutingError. */
  search(query: string, opts: { near?: LngLat; signal?: AbortSignal }): Promise<Place[]>;
}

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

export function placeFromPhoton(f: PhotonFeature): Place {
  const p = f.properties;
  const street = [p.housenumber, p.street].filter(Boolean).join(' ');
  const name = p.name ?? (street || p.city || 'Unnamed place');
  const detail = [p.name ? street : null, p.city, p.state, p.country].filter(Boolean).join(', ');
  const kind = p.osm_value && p.osm_value !== 'yes' && !['house', 'residential', 'street', 'road'].includes(p.osm_value) ? p.osm_value : null;
  const category = kind ? (p.osm_key === 'shop' && kind !== 'supermarket' ? `${kind} store` : kind).replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase()) : undefined;
  return { id: `${p.osm_type}${p.osm_id}`, name, detail, coord: f.geometry.coordinates, category };
}

/** Photon: search-as-you-type over OpenStreetMap. */
export function photonProvider(baseUrl: string): GeocodingProvider {
  return {
    name: 'photon',
    async search(query, { near, signal }) {
      const params = new URLSearchParams({ q: query, limit: '8', lang: 'en' });
      if (near) {
        params.set('lon', String(near[0]));
        params.set('lat', String(near[1]));
      }
      const json = await getJson<{ features: PhotonFeature[] }>(`${baseUrl}/api/?${params}`, signal);
      return json.features.map(placeFromPhoton);
    },
  };
}

const CACHE_MS = 10 * 60_000;
const CACHE_SIZE = 40;
/** A cached answer is reused while you're still within this distance of where it was asked from. */
const CACHE_NEAR_M = 2_000;

/**
 * Search with a small memory, so retyping a query, or backspacing to one you already typed,
 * doesn't ask the server again. Failures are never remembered.
 */
export function createGeocoder(provider: GeocodingProvider, now: () => number = Date.now) {
  let cache: { query: string; near?: LngLat; at: number; places: Place[] }[] = [];
  return {
    provider,
    async search(query: string, near?: LngLat, signal?: AbortSignal): Promise<Place[]> {
      const q = query.trim().toLowerCase();
      if (q.length < 3) return [];
      cache = cache.filter((c) => now() - c.at < CACHE_MS);
      const hit = cache.find((c) => c.query === q && (c.near && near ? haversine(c.near, near) < CACHE_NEAR_M : !c.near && !near));
      if (hit) return hit.places;
      const places = await provider.search(q, { near, signal });
      cache = [{ query: q, near, at: now(), places }, ...cache].slice(0, CACHE_SIZE);
      return places;
    },
  };
}

const PHOTON_URL = process.env.EXPO_PUBLIC_PHOTON_URL ?? 'https://photon.komoot.io';

export const geocoder = createGeocoder(photonProvider(PHOTON_URL));
