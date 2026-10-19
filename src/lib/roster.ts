import { haversine, type LngLat } from '@/lib/geo';
import type { GroupDrive, Member } from '@/store/drive';

/** A member counts as live if their last position is this fresh. */
const LIVE_MS = 60_000;

export type RosterEntry = {
  id: string;
  name: string;
  color: string;
  me: boolean;
  /** m/s, null when unknown or stale */
  speed: number | null;
  /** meters to the stop (or to you, when there's no stop); null when unknown */
  awayM: number | null;
  live: boolean;
};

/** Where "away" is measured to: the regroup point, then the destination; null = from you. */
export function convoyStop(drive: GroupDrive): { coord: LngLat; label: string } | null {
  if (drive.regroup_lat != null && drive.regroup_lng != null && drive.regroup_name) return { coord: [drive.regroup_lng, drive.regroup_lat], label: drive.regroup_name };
  if (drive.dest_lat != null && drive.dest_lng != null) return { coord: [drive.dest_lng, drive.dest_lat], label: drive.destination_name ?? 'destination' };
  return null;
}

/** Everyone in the drive with speed and distance to the stop, closest to the stop first. */
export function rosterEntries(
  members: Record<string, Member>,
  myId: string | null,
  me: { coord: LngLat; speed: number | null } | null,
  stop: LngLat | null,
  now: number
): RosterEntry[] {
  return Object.entries(members)
    .map(([id, m]) => {
      const mine = id === myId;
      const pos: LngLat | null = mine && me ? me.coord : m.position ? [m.position.lng, m.position.lat] : null;
      const live = mine ? Boolean(me) : Boolean(m.online && m.position && now - m.position.t < LIVE_MS);
      const speed = mine ? (me?.speed ?? null) : live ? (m.position?.speed ?? null) : null;
      const from = stop ?? (mine ? null : (me?.coord ?? null));
      return {
        id,
        name: mine ? 'You' : m.profile.display_name.split(' ')[0],
        color: m.profile.avatar_color,
        me: mine,
        speed: speed != null && speed >= 0 ? speed : null,
        awayM: pos && from ? haversine(pos, from) : null,
        live,
      };
    })
    .sort((a, b) => (a.awayM ?? Infinity) - (b.awayM ?? Infinity) || (a.me ? -1 : b.me ? 1 : 0));
}
