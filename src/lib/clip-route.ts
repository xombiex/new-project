import { haversine, type LngLat } from '@/lib/geo';

/** Clips leave out each end of the drive, which is usually someone's front door. */
export const CLIP_TRIM_M = 250;
/** Shorter than this after trimming, there's nothing to show. */
export const CLIP_MIN_M = 400;

/** Drops `metres` from the start of a line. */
function trimStart(line: LngLat[], metres: number): LngLat[] {
  let left = metres;
  for (let i = 1; i < line.length; i++) {
    const d = haversine(line[i - 1], line[i]);
    if (d > left) {
      const t = left / d;
      const a = line[i - 1];
      const b = line[i];
      return [[a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], ...line.slice(i)];
    }
    left -= d;
  }
  return [];
}

/** The drive with both ends trimmed. Takes what's left after privacy zones, so it may be several pieces. */
export function trimClipRoute(segments: LngLat[][], metres = CLIP_TRIM_M): LngLat[][] {
  const out = segments.map((s) => [...s]);
  while (out.length) {
    out[0] = trimStart(out[0], metres);
    if (out[0].length > 1) break;
    out.shift();
  }
  while (out.length) {
    const last = out.length - 1;
    out[last] = trimStart([...out[last]].reverse(), metres).reverse();
    if (out[last].length > 1) break;
    out.pop();
  }
  return out;
}

export function routeLength(segments: LngLat[][]): number {
  let total = 0;
  for (const s of segments) for (let i = 1; i < s.length; i++) total += haversine(s[i - 1], s[i]);
  return total;
}

/** Map zoom that keeps the chase camera's ground speed watchable: long drives get a higher view. */
export function chaseZoom(distanceM: number, seconds: number, latitude: number): number {
  const MAX_PIXELS_PER_SECOND = 900;
  const metresPerSecond = Math.max(1, distanceM / seconds);
  const zoom = Math.log2((78271 * Math.cos((latitude * Math.PI) / 180) * MAX_PIXELS_PER_SECOND) / metresPerSecond);
  return Math.max(11.5, Math.min(16.2, zoom));
}

/** Shortest way round from one compass heading to another, as a signed number of degrees. */
export function turnBetween(from: number, to: number): number {
  return ((((to - from) % 360) + 540) % 360) - 180;
}
