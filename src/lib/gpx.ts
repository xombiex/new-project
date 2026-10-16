import { haversine, type LngLat } from '@/lib/geo';

const esc = (s: string) => s.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]!);

/**
 * GPX 1.1 track. Stored routes are simplified and don't keep per-point times, so point
 * times are spread across the trip by distance travelled (noted in the description).
 */
export function toGpx(trip: { name: string; startedAt: number; endedAt: number; segments: LngLat[][] }): string {
  const all = trip.segments.flat();
  const total = all.reduce((acc, p, i) => (i ? acc + haversine(all[i - 1], p) : 0), 0);
  const span = trip.endedAt - trip.startedAt;
  let travelled = 0;
  let prev: LngLat | null = null;

  const segs = trip.segments
    .map((seg) => {
      const pts = seg
        .map((p) => {
          if (prev) travelled += haversine(prev, p);
          prev = p;
          const t = new Date(trip.startedAt + (total > 0 ? (travelled / total) * span : 0)).toISOString();
          return `      <trkpt lat="${p[1].toFixed(6)}" lon="${p[0].toFixed(6)}"><time>${t}</time></trkpt>`;
        })
        .join('\n');
      return `    <trkseg>\n${pts}\n    </trkseg>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Convoy" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>${esc(trip.name)}</name>
    <time>${new Date(trip.startedAt).toISOString()}</time>
    <desc>Exported from Convoy. Point times are estimated from distance.</desc>
  </metadata>
  <trk>
    <name>${esc(trip.name)}</name>
${segs}
  </trk>
</gpx>
`;
}
