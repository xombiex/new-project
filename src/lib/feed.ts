import { haversine, type LngLat } from '@/lib/geo';

// The parts of the feed that are plain logic: paging, like counts, the route preview that leaves
// the phone, and when social features lock for a driver. No network, no UI.

/** Where the next page starts: the last row's time and id, so equal times can't skip or repeat rows. */
export type Cursor = { before: string; id: string };

export function encodeCursor(row: { created_at: string; id: string } | undefined): string | null {
  return row ? `${row.created_at}|${row.id}` : null;
}

export function decodeCursor(cursor: string | null): Cursor | null {
  if (!cursor) return null;
  const at = cursor.lastIndexOf('|');
  if (at <= 0 || at === cursor.length - 1) return null;
  return { before: cursor.slice(0, at), id: cursor.slice(at + 1) };
}

/** A full page means there may be more; a short one was the last. */
export function nextCursor<T extends { created_at: string; id: string }>(rows: T[], limit: number): string | null {
  return rows.length >= limit ? encodeCursor(rows.at(-1)) : null;
}

/** Adds a page to a list without repeating anything already in it (a refresh can overlap a page). */
export function mergePage<T extends { id: string }>(existing: T[], page: T[]): T[] {
  const seen = new Set(existing.map((x) => x.id));
  return [...existing, ...page.filter((x) => !seen.has(x.id))];
}

/** A like or unlike applied locally, before the server has answered. */
export function withLike<T extends { likedByMe: boolean; likeCount: number }>(item: T, liked: boolean): T {
  if (item.likedByMe === liked) return item;
  return { ...item, likedByMe: liked, likeCount: Math.max(0, item.likeCount + (liked ? 1 : -1)) };
}

/** The most points a shared route preview carries. Enough for a card, far too few to be a GPS log. */
export const PREVIEW_MAX_POINTS = 180;

/**
 * The route as it's shared: the already-trimmed pieces, thinned to a sketch and rounded to about
 * 10 m. The full recording never leaves the owner's account.
 */
export function previewForShare(segments: LngLat[][], maxPoints = PREVIEW_MAX_POINTS): LngLat[][] {
  const total = segments.reduce((n, s) => n + s.length, 0);
  if (total === 0) return [];
  const round = (p: LngLat): LngLat => [Math.round(p[0] * 1e4) / 1e4, Math.round(p[1] * 1e4) / 1e4];
  return segments
    .map((s) => {
      // Each piece gets a share of the budget in proportion to its length, and keeps both its ends.
      const budget = Math.max(2, Math.round((s.length / total) * maxPoints));
      if (s.length <= budget) return s.map(round);
      const step = (s.length - 1) / (budget - 1);
      return Array.from({ length: budget }, (_, i) => round(s[Math.min(s.length - 1, Math.round(i * step))]));
    })
    .filter((s) => s.length > 1);
}

/** Length of a shared preview in metres (for sanity checks and tests). */
export function previewLength(segments: LngLat[][]): number {
  let m = 0;
  for (const s of segments) for (let i = 1; i < s.length; i++) m += haversine(s[i - 1], s[i]);
  return m;
}

/**
 * Points to route through so a new route follows a shared one: a handful spread along it, ending
 * at its last point. Routers take only so many stops, and the sketch is too coarse for more.
 */
export function waypointsFor(segments: LngLat[][], max = 8): LngLat[] {
  const all = segments.flat();
  if (all.length < 2) return [];
  const n = Math.min(max, all.length);
  return Array.from({ length: n }, (_, i) => all[Math.round(((i + 1) / n) * (all.length - 1))]);
}

/** Above this the phone is in a moving car, not in a pocket on foot. */
export const DRIVING_MPS = 3;

/**
 * Should the feed, likes and comments be locked right now? Yes while navigating, and while a
 * drive is being recorded and the car is moving. A passenger can say so and unlock it.
 */
export function isDrivingNow({ navigating, recording, speedMps, passenger }: { navigating: boolean; recording: boolean; speedMps: number | null | undefined; passenger: boolean }): boolean {
  if (passenger) return false;
  if (navigating) return true;
  return recording && (speedMps ?? 0) >= DRIVING_MPS;
}

/** How long a drive took, for a card: "52 min", "1h 44m". */
export function driveTime(seconds: number): string {
  const min = Math.max(1, Math.round(seconds / 60));
  if (min < 60) return `${min} min`;
  const m = min % 60;
  return m ? `${Math.floor(min / 60)}h ${m}m` : `${Math.floor(min / 60)}h`;
}

/** "2h ago", "3d ago", then a date: how long ago something was posted. */
export function postedAgo(iso: string, now = Date.now()): string {
  const s = Math.max(0, (now - Date.parse(iso)) / 1000);
  if (s < 60) return 'Just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86_400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 7 * 86_400) return `${Math.floor(s / 86_400)}d ago`;
  return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' });
}
