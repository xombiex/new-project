import { bearing, haversine, type LngLat } from '@/lib/geo';

export type ReplayTrack = { path: LngLat[]; cumulative: number[]; total: number };

export function buildTrack(path: LngLat[]): ReplayTrack {
  const cumulative = [0];
  for (let i = 1; i < path.length; i++) cumulative.push(cumulative[i - 1] + haversine(path[i - 1], path[i]));
  return { path, cumulative, total: cumulative.at(-1) ?? 0 };
}

/** Position and heading at fraction `f` (0–1) of the distance, plus the path drawn so far. */
export function positionAt(track: ReplayTrack, f: number): { head: LngLat; heading: number; drawn: LngLat[] } {
  const { path, cumulative, total } = track;
  if (path.length < 2) return { head: path[0] ?? [0, 0], heading: 0, drawn: path };
  const target = Math.max(0, Math.min(1, f)) * total;
  let i = 1;
  while (i < path.length - 1 && cumulative[i] < target) i++;
  const segLen = cumulative[i] - cumulative[i - 1];
  const t = segLen > 0 ? (target - cumulative[i - 1]) / segLen : 1;
  const a = path[i - 1];
  const b = path[i];
  const head: LngLat = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  return { head, heading: bearing(a, b), drawn: [...path.slice(0, i), head] };
}
