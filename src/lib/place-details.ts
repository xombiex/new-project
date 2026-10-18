import { parseOpeningHours, type Week } from '@/lib/opening-hours';

/**
 * Extra details for a searched place, from its OpenStreetMap tags (via Overpass): category,
 * opening hours, phone, website, cuisine, address, accessibility. Ratings and reviews aren't in
 * OpenStreetMap; they'd need a paid places service.
 */
const OVERPASS_URLS = ['https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter'];

export type PlaceDetails = {
  category: string | null;
  hours: Week | null;
  /** the raw opening_hours text, shown when it can't be parsed */
  hoursText: string | null;
  phone: string | null;
  website: string | null;
  cuisine: string | null;
  address: string | null;
  wheelchair: 'yes' | 'limited' | 'no' | null;
};

const human = (s: string) => s.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

/** "fast_food" → "Fast food"; prefers the most specific tag. */
export function categoryOf(tags: Record<string, string>): string | null {
  const key = ['amenity', 'shop', 'tourism', 'leisure', 'office', 'healthcare', 'craft', 'historic', 'aeroway', 'railway', 'building'].find((k) => tags[k] && tags[k] !== 'yes');
  if (!key) return null;
  if (key === 'shop') return tags.shop === 'supermarket' ? 'Supermarket' : `${human(tags.shop)} store`;
  return human(tags[key]);
}

const cleanUrl = (u: string | undefined) => (u ? (/^https?:\/\//.test(u) ? u : `https://${u}`) : null);

export function detailsFromTags(tags: Record<string, string>): PlaceDetails {
  const hoursText = tags.opening_hours ?? null;
  const street = [tags['addr:housenumber'], tags['addr:street']].filter(Boolean).join(' ');
  const address = [street, tags['addr:city'], tags['addr:state'] ?? tags['addr:province'], tags['addr:postcode']].filter(Boolean).join(', ');
  const wc = tags.wheelchair;
  return {
    category: categoryOf(tags),
    hours: parseOpeningHours(hoursText ?? undefined),
    hoursText,
    phone: tags.phone ?? tags['contact:phone'] ?? null,
    website: cleanUrl(tags.website ?? tags['contact:website'] ?? tags.url),
    cuisine: tags.cuisine ? tags.cuisine.split(';').map(human).join(', ') : null,
    address: address || null,
    wheelchair: wc === 'yes' || wc === 'limited' || wc === 'no' ? wc : null,
  };
}

/** Place ids look like "N123", "W456" or "R789" (Photon's osm_type + osm_id). */
function osmRef(placeId: string): { type: 'node' | 'way' | 'relation'; id: string } | null {
  const m = /^([NWR])(\d+)$/.exec(placeId);
  if (!m) return null;
  return { type: m[1] === 'N' ? 'node' : m[1] === 'W' ? 'way' : 'relation', id: m[2] };
}

const cache = new Map<string, PlaceDetails | null>();

export async function fetchPlaceDetails(placeId: string, signal?: AbortSignal): Promise<PlaceDetails | null> {
  if (cache.has(placeId)) return cache.get(placeId)!;
  const ref = osmRef(placeId);
  if (!ref) return null;
  const query = `[out:json][timeout:10];${ref.type}(${ref.id});out tags;`;
  for (const url of OVERPASS_URLS) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `data=${encodeURIComponent(query)}`,
        signal,
      });
      if (!res.ok) continue;
      const json = (await res.json()) as { elements: { tags?: Record<string, string> }[] };
      const tags = json.elements[0]?.tags;
      const details = tags ? detailsFromTags(tags) : null;
      cache.set(placeId, details);
      return details;
    } catch (e) {
      if (signal?.aborted) throw e;
    }
  }
  return null;
}
