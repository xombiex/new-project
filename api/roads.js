// Roads with speed limits for a small grid-aligned box, from OpenStreetMap via Overpass.
//
//   GET /api/roads?bbox=west,south,east,north   (at most ~3 km across)
//   → { roads: [{ id, name, maxspeed, forward, backward, highway, oneway, coords }] }
//
// The app can't call Overpass from a browser (the main server turns browsers away), so the web
// app asks this edge function instead. Responses are cached at Vercel's edge for a day, and the
// app snaps boxes to a grid, so everyone driving the same area shares one lookup.
export const config = { runtime: 'edge' };

const MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];
const CAR_ROADS =
  'motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|service|motorway_link|trunk_link|primary_link|secondary_link|tertiary_link';
const MAX_SPAN = 0.031;

const reply = (body, status, cache) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': cache ? 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800' : 'no-store',
    },
  });

export default async function handler(request) {
  const bbox = new URL(request.url).searchParams.get('bbox') ?? '';
  const b = bbox.split(',').map(Number);
  if (b.length !== 4 || !b.every(Number.isFinite)) return reply({ error: 'bbox required' }, 400);
  const [w, s, e, n] = b;
  if (e <= w || n <= s || e - w > MAX_SPAN || n - s > MAX_SPAN || s < -90 || n > 90 || w < -180 || e > 180) {
    return reply({ error: 'bbox too large' }, 400);
  }
  const box = `${s.toFixed(5)},${w.toFixed(5)},${n.toFixed(5)},${e.toFixed(5)}`;
  const query = `[out:json][timeout:20];way[highway~"^(${CAR_ROADS})$"](${box});out tags geom;`;
  const errors = [];
  for (const url of MIRRORS) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json', 'User-Agent': 'Convoy/1.0 (speed limits)' },
        body: `data=${encodeURIComponent(query)}`,
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) {
        errors.push(`${new URL(url).host} ${res.status}`);
        continue;
      }
      const { elements } = await res.json();
      const roads = elements
        .filter((wy) => wy.geometry && wy.geometry.length > 1)
        .map((wy) => {
          const t = wy.tags ?? {};
          return {
            id: wy.id,
            name: t.name ?? t.ref ?? null,
            maxspeed: t.maxspeed ?? null,
            forward: t['maxspeed:forward'] ?? null,
            backward: t['maxspeed:backward'] ?? null,
            highway: t.highway ?? null,
            oneway: t.oneway === 'yes' || t.highway === 'motorway' || t.junction === 'roundabout',
            coords: wy.geometry.map((g) => [Math.round(g.lon * 1e6) / 1e6, Math.round(g.lat * 1e6) / 1e6]),
          };
        });
      return reply({ roads }, 200, true);
    } catch (err) {
      errors.push(`${new URL(url).host} ${err instanceof Error ? err.message : err}`);
    }
  }
  return reply({ error: 'map data unavailable', tried: errors }, 502);
}
