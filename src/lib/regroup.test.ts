import { describe, expect, it } from 'vitest';

import { haversine } from './geo';
import { pickSpots, regroupTarget } from './regroup';

describe('regroup', () => {
  const group: [number, number][] = [
    [0, 0],
    [0, 0.002],
  ];

  it('aims a third of the way to the destination, between 3 and 10 km', () => {
    const t = regroupTarget(group, [0, 0.5], null)!; // destination ≈ 55 km away
    expect(Math.round(haversine([0, 0.001], t) / 1000)).toBe(10);
    const near = regroupTarget(group, [0, 0.05], null)!; // ≈ 5.4 km away → 3 km
    expect(Math.round(haversine([0, 0.001], near) / 1000)).toBe(3);
  });

  it('aims ahead of the leader without a destination', () => {
    const t = regroupTarget(group, null, 90)!;
    expect(t[0]).toBeGreaterThan(0.02);
    expect(Math.abs(t[1] - 0.001)).toBeLessThan(0.0005);
  });

  it('prefers gas stations, then named parking, nearest first', () => {
    const target: [number, number] = [0, 0];
    const spots = pickSpots(
      [
        { name: 'Parking lot', kind: 'parking', coord: [0, 0.0001] },
        { name: 'Shell', kind: 'fuel', coord: [0, 0.002] },
        { name: 'City Garage', kind: 'parking', coord: [0, 0.001] },
        { name: 'Wawa', kind: 'fuel', coord: [0, 0.0005] },
      ],
      target,
      [0, -0.01]
    );
    expect(spots.map((s) => s.name)).toEqual(['Wawa', 'Shell', 'City Garage']);
    expect(spots[0].distanceM).toBeGreaterThan(1000);
  });
});
