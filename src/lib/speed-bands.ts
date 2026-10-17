import type { LngLat, Units } from '@/lib/geo';

/**
 * Speed distribution for a drive. While recording we keep seconds spent in each 10 km/h bucket
 * (unit-agnostic), then group them into five bands in the viewer's units when showing them.
 */
export const HIST_BUCKET_KMH = 10;
export const HIST_BUCKETS = 26; // 0–250+ km/h

export function histBucket(mps: number) {
  return Math.min(HIST_BUCKETS - 1, Math.max(0, Math.floor((mps * 3.6) / HIST_BUCKET_KMH)));
}

export type Band = { label: string; color: string; /** upper bound in m/s (Infinity for the last band) */ maxMps: number };

const COLORS = ['#2D9CFF', '#2DBE60', '#FFC400', '#FF8A00', '#E5281F'];

/** Five bands that read naturally in each unit system. */
export function speedBands(units: Units): Band[] {
  const edges = units === 'imperial' ? [30, 50, 70, 100] : [50, 80, 110, 160];
  const toMps = units === 'imperial' ? 1 / 2.236936 : 1 / 3.6;
  const labels = [`<${edges[0]}`, `${edges[0]}–${edges[1]}`, `${edges[1]}–${edges[2]}`, `${edges[2]}–${edges[3]}`, `${edges[3]}+`];
  return labels.map((label, i) => ({ label, color: COLORS[i], maxMps: i < edges.length ? edges[i] * toMps : Infinity }));
}

export function bandIndex(mps: number, bands: Band[]) {
  const i = bands.findIndex((b) => mps < b.maxMps);
  return i === -1 ? bands.length - 1 : i;
}

/** Share of moving time in each band (0–1), from the 10 km/h histogram. Empty → null. */
export function distribution(hist: number[] | undefined, units: Units): number[] | null {
  if (!hist?.length) return null;
  const bands = speedBands(units);
  const out = bands.map(() => 0);
  hist.forEach((secs, i) => {
    // Bucket midpoint decides the band; buckets are fine enough for the edges to land well.
    const midMps = ((i + 0.5) * HIST_BUCKET_KMH) / 3.6;
    out[bandIndex(midMps, bands)] += secs;
  });
  const total = out.reduce((a, b) => a + b, 0);
  return total > 0 ? out.map((s) => s / total) : null;
}

/**
 * The route split into colored pieces by speed: one multi-line per band, so the map draws the
 * whole drive in five layers however long it is.
 */
export function routeByBand(path: LngLat[], speeds: number[] | undefined, units: Units): { color: string; coords: LngLat[][] }[] {
  if (!speeds || speeds.length !== path.length || path.length < 2) return [];
  const bands = speedBands(units);
  const pieces: LngLat[][][] = bands.map(() => []);
  let current: { band: number; line: LngLat[] } | null = null;
  for (let i = 1; i < path.length; i++) {
    const band = bandIndex((speeds[i - 1] + speeds[i]) / 2, bands);
    if (current && current.band === band) current.line.push(path[i]);
    else {
      current = { band, line: [path[i - 1], path[i]] };
      pieces[band].push(current.line);
    }
  }
  return bands.map((b, i) => ({ color: b.color, coords: pieces[i] })).filter((p) => p.coords.length);
}

/**
 * Route simplification drops points on straight roads, which would also drop where the speed
 * changed. Add back any point whose speed differs from the last kept one by more than `stepMps`.
 */
export function keepSpeedChanges(keep: number[], speeds: number[], stepMps = 3): number[] {
  const set = new Set(keep);
  let last = speeds[0] ?? 0;
  for (let i = 1; i < speeds.length; i++) {
    if (set.has(i)) last = speeds[i];
    else if (Math.abs(speeds[i] - last) > stepMps) {
      set.add(i);
      last = speeds[i];
    }
  }
  return [...set].sort((a, b) => a - b);
}
