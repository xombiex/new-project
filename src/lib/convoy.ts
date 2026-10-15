import { haversine, type LngLat } from '@/lib/geo';

export type ConvoyMemberInput = {
  id: string;
  online: boolean;
  position: { lat: number; lng: number; speed: number | null; t: number } | null;
};

export type MemberStatus = 'live' | 'stale' | 'offline' | 'waiting';

export type ConvoyMemberView = {
  id: string;
  status: MemberStatus;
  /** meters from the viewer, when both positions are known */
  distanceFromMeM: number | null;
  /** straight-line meters to the group destination */
  toDestinationM: number | null;
  /** true when noticeably further from the destination (or the pack) than the lead car */
  behind: boolean;
  lastSeenMs: number | null;
};

/** No update for this long while still "online" means the phone lost signal. */
export const STALE_AFTER_MS = 45_000;
/** How far back from the leader (or the pack, with no destination) counts as falling behind. */
export const BEHIND_M = 3_000;

export function memberStatus(m: ConvoyMemberInput, now: number): MemberStatus {
  if (!m.position) return m.online ? 'waiting' : 'offline';
  if (now - m.position.t > STALE_AFTER_MS) return m.online ? 'stale' : 'offline';
  return 'live';
}

function median(xs: number[]) {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * Derives per-member status for the convoy list. With a destination, "behind" is
 * measured against whoever is closest to it; without one, against the pack center.
 */
export function analyzeConvoy(
  members: ConvoyMemberInput[],
  me: LngLat | null,
  destination: LngLat | null,
  now: number
): ConvoyMemberView[] {
  const views = members.map((m) => {
    const pos: LngLat | null = m.position ? [m.position.lng, m.position.lat] : null;
    return {
      id: m.id,
      pos,
      status: memberStatus(m, now),
      distanceFromMeM: pos && me ? haversine(me, pos) : null,
      toDestinationM: pos && destination ? haversine(pos, destination) : null,
      behind: false,
      lastSeenMs: m.position?.t ?? null,
    };
  });

  const tracked = views.filter((v) => v.pos && v.status === 'live');
  if (tracked.length >= 2) {
    if (destination) {
      const lead = Math.min(...tracked.map((v) => v.toDestinationM!));
      for (const v of tracked) v.behind = v.toDestinationM! - lead > BEHIND_M;
    } else {
      const center: LngLat = [median(tracked.map((v) => v.pos![0])), median(tracked.map((v) => v.pos![1]))];
      for (const v of tracked) v.behind = haversine(v.pos!, center) > BEHIND_M;
    }
  }

  return views.map(({ pos: _pos, ...v }) => v);
}
