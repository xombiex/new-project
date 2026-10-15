import { describe, expect, it } from 'vitest';

import { analyzeConvoy, memberStatus, STALE_AFTER_MS, type ConvoyMemberInput } from '@/lib/convoy';

const NOW = 1_000_000;
const at = (id: string, lat: number, t = NOW, online = true): ConvoyMemberInput => ({
  id,
  online,
  position: { lat, lng: -122, speed: 20, t },
});

describe('memberStatus', () => {
  it('classifies freshness', () => {
    expect(memberStatus(at('a', 37), NOW)).toBe('live');
    expect(memberStatus(at('a', 37, NOW - STALE_AFTER_MS - 1), NOW)).toBe('stale');
    expect(memberStatus(at('a', 37, NOW - STALE_AFTER_MS - 1, false), NOW)).toBe('offline');
    expect(memberStatus({ id: 'a', online: true, position: null }, NOW)).toBe('waiting');
    expect(memberStatus({ id: 'a', online: false, position: null }, NOW)).toBe('offline');
  });
});

describe('analyzeConvoy', () => {
  it('flags a member far behind the leader relative to the destination', () => {
    const dest: [number, number] = [-122, 38];
    const views = analyzeConvoy([at('lead', 37.5), at('mid', 37.49), at('tail', 37.4)], [-122, 37.5], dest, NOW);
    const byId = Object.fromEntries(views.map((v) => [v.id, v]));
    expect(byId.lead.behind).toBe(false);
    expect(byId.mid.behind).toBe(false); // ~1.1 km back
    expect(byId.tail.behind).toBe(true); // ~11 km back
    expect(byId.tail.distanceFromMeM).toBeCloseTo(11_120, -2);
  });

  it('without a destination, flags whoever strays from the pack', () => {
    const views = analyzeConvoy([at('a', 37), at('b', 37.001), at('c', 37.002), at('far', 37.2)], null, null, NOW);
    expect(views.find((v) => v.id === 'far')!.behind).toBe(true);
    expect(views.filter((v) => v.behind)).toHaveLength(1);
  });

  it('ignores stale positions when judging who is behind', () => {
    const views = analyzeConvoy([at('a', 37), at('old', 36, NOW - STALE_AFTER_MS - 1)], null, [-122, 38], NOW);
    expect(views.every((v) => !v.behind)).toBe(true);
    expect(views.find((v) => v.id === 'old')!.status).toBe('stale');
  });
});
