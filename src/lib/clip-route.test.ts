import { describe, expect, it } from 'vitest';

import { chaseZoom, routeLength, trimClipRoute, turnBetween } from './clip-route';
import type { LngLat } from './geo';

/** About 111 m per step going north. */
const north = (steps: number, from = 0): LngLat[] => Array.from({ length: steps + 1 }, (_, i) => [0, from + i * 0.001] as LngLat);

describe('trimClipRoute', () => {
  it('takes the distance off both ends', () => {
    const line = north(20);
    const out = trimClipRoute([line], 250);
    expect(routeLength(out)).toBeCloseTo(routeLength([line]) - 500, -1);
    expect(out[0][0][1]).toBeGreaterThan(0.002);
    expect(out[0].at(-1)![1]).toBeLessThan(0.018);
  });

  it('never leaves the real start or end in the clip', () => {
    const line = north(20);
    const out = trimClipRoute([line], 250);
    expect(out.flat()).not.toContainEqual(line[0]);
    expect(out.flat()).not.toContainEqual(line.at(-1));
  });

  it('drops a whole first piece that is shorter than the trim', () => {
    const out = trimClipRoute([north(1), north(20, 1)], 250);
    expect(out).toHaveLength(1);
    expect(out[0][0][1]).toBeGreaterThan(1);
  });

  it('returns nothing for a drive too short to trim', () => {
    expect(trimClipRoute([north(2)], 250)).toEqual([]);
    expect(trimClipRoute([], 250)).toEqual([]);
  });
});

describe('chaseZoom', () => {
  it('pulls back for longer drives and stays in range', () => {
    expect(chaseZoom(2_000, 10, 30)).toBe(16.2);
    expect(chaseZoom(10_000, 10, 30)).toBeGreaterThan(chaseZoom(100_000, 10, 30));
    expect(chaseZoom(5_000_000, 10, 30)).toBe(11.5);
  });
});

describe('turnBetween', () => {
  it('goes the short way round', () => {
    expect(turnBetween(350, 10)).toBe(20);
    expect(turnBetween(10, 350)).toBe(-20);
    expect(turnBetween(90, 90)).toBe(0);
  });
});
