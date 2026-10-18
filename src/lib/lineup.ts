import { bearing, haversine, type LngLat } from '@/lib/geo';

export type LineupInput = {
  id: string;
  name: string;
  color: string;
  coord: LngLat | null;
  stale: boolean;
  arrived: boolean;
};

export type LineupEntry = LineupInput & {
  me: boolean;
  /** meters ahead of you (negative = behind); null when unknown */
  gapM: number | null;
};

/**
 * Convoy order, front to back. With a group destination, whoever is closest to it leads. Without
 * one, people are placed along the way you're facing (ahead of you vs behind). Members with no
 * position go last.
 */
export function lineup(members: LineupInput[], meId: string | null, myHeading: number | null, dest: LngLat | null, myPosition?: LngLat | null): LineupEntry[] {
  const me = members.find((m) => m.id === meId);
  const myCoord = myPosition ?? me?.coord ?? null;

  // How far "forward" each member is: larger = further ahead.
  const forward = (c: LngLat): number => {
    if (dest) return -haversine(c, dest);
    if (!myCoord) return 0;
    const d = haversine(myCoord, c);
    if (myHeading == null || d < 1) return -d;
    return d * Math.cos(((bearing(myCoord, c) - myHeading) * Math.PI) / 180);
  };

  const myForward = myCoord ? forward(myCoord) : null;
  const placed = members
    .filter((m) => m.coord)
    .map((m) => {
      const f = forward(m.coord!);
      const gapM = m.id === meId ? 0 : myForward == null ? null : f - myForward;
      return { ...m, me: m.id === meId, gapM, f };
    })
    .sort((a, b) => (a.arrived === b.arrived ? b.f - a.f : a.arrived ? -1 : 1))
    .map(({ f: _f, ...e }) => e);
  const unplaced = members.filter((m) => !m.coord).map((m) => ({ ...m, me: m.id === meId, gapM: null }));
  return [...placed, ...unplaced];
}
