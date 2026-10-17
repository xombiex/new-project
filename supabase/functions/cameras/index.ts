// Convoy road-camera cache.
//
//   POST { cells: ["27,-83", ...] }   (1°×1° cells, "floor(lat),floor(lng)", at most 6)
//   → { cameras: [{ osm_id, kind, lat, lng, maxspeed, operator, direction }] }
//
// Cells older than a week (or never fetched) are refreshed from OpenStreetMap via Overpass first
// (speed cameras + ALPR/Flock plate readers); everything else comes straight from Postgres, so only
// the first driver in an area waits. Public data, so no sign-in required; refreshes are bounded by
// the cell staleness check.
import { createClient } from 'npm:@supabase/supabase-js@2';

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
});

const MAX_CELLS = 6;
const STALE_MS = 7 * 24 * 3600_000;
const CELL = /^-?\d{1,2},-?\d{1,3}$/;
// Public Overpass instances; the next one is tried if one is busy or down.
const MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

type OsmNode = { id: number; lat: number; lon: number; tags?: Record<string, string> };

async function overpass(query: string): Promise<OsmNode[]> {
  let lastError = 'no mirrors';
  for (const url of MIRRORS) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `data=${encodeURIComponent(query)}`,
        signal: AbortSignal.timeout(50_000),
      });
      if (!res.ok) {
        lastError = `${url} ${res.status}`;
        continue;
      }
      return ((await res.json()) as { elements: OsmNode[] }).elements;
    } catch (e) {
      lastError = `${url} ${e instanceof Error ? e.message : e}`;
    }
  }
  throw new Error(lastError);
}

async function refreshCell(cell: string) {
  const [lat, lng] = cell.split(',').map(Number);
  const box = `${lat},${lng},${lat + 1},${lng + 1}`;
  const nodes = await overpass(
    `[out:json][timeout:45];(node["highway"="speed_camera"](${box});node["man_made"="surveillance"]["surveillance:type"="ALPR"](${box}););out body;`
  );
  const rows = nodes.map((n) => {
    const t = n.tags ?? {};
    const dir = Number(t['camera:direction'] ?? t.direction);
    return {
      osm_id: n.id,
      kind: t['surveillance:type'] === 'ALPR' ? 'alpr' : 'speed',
      lat: n.lat,
      lng: n.lon,
      maxspeed: t.maxspeed ?? null,
      operator: t.manufacturer ?? t.operator ?? t.brand ?? null,
      direction: Number.isFinite(dir) ? dir : null,
      cell,
      updated_at: new Date().toISOString(),
    };
  });
  await admin.from('road_cameras').delete().eq('cell', cell);
  for (let i = 0; i < rows.length; i += 1000) await admin.from('road_cameras').upsert(rows.slice(i, i + 1000));
  await admin.from('camera_cells').upsert({ cell, fetched_at: new Date().toISOString(), camera_count: rows.length });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);
  const body = await req.json().catch(() => ({}));
  const cells: string[] = Array.isArray(body.cells) ? [...new Set(body.cells as string[])].filter((c) => CELL.test(c)) : [];
  if (cells.length === 0 || cells.length > MAX_CELLS) return json({ error: `send 1–${MAX_CELLS} cells` }, 400);

  const { data: known } = await admin.from('camera_cells').select('cell, fetched_at').in('cell', cells);
  const fresh = new Set((known ?? []).filter((k) => Date.now() - Date.parse(k.fetched_at) < STALE_MS).map((k) => k.cell));
  const stale = cells.filter((c) => !fresh.has(c));
  const failed: string[] = [];
  await Promise.all(
    stale.map((c) =>
      refreshCell(c).catch((e) => {
        console.error('refresh failed', c, e instanceof Error ? e.message : e);
        failed.push(c);
      })
    )
  );

  const { data, error } = await admin
    .from('road_cameras')
    .select('osm_id, kind, lat, lng, maxspeed, operator, direction')
    .in('cell', cells)
    .limit(20000);
  if (error) return json({ error: error.message }, 500);
  return json({ cameras: data, failed });
});
