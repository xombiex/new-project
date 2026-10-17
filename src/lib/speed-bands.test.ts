import { describe, expect, it } from 'vitest';

import { distribution, histBucket, keepSpeedChanges, routeByBand, speedBands } from './speed-bands';

const mph = (v: number) => v / 2.236936;

describe('speed bands', () => {
  it('buckets speeds by 10 km/h', () => {
    expect(histBucket(0)).toBe(0);
    expect(histBucket(mph(60))).toBe(9); // 96.6 km/h
    expect(histBucket(200)).toBe(25); // capped
  });

  it('turns the histogram into band shares', () => {
    const hist = new Array(26).fill(0);
    hist[histBucket(mph(20))] = 60; // <30 mph
    hist[histBucket(mph(60))] = 180; // 50–70 mph
    const d = distribution(hist, 'imperial')!;
    expect(d[0]).toBeCloseTo(0.25);
    expect(d[2]).toBeCloseTo(0.75);
    expect(distribution([], 'imperial')).toBeNull();
    expect(speedBands('metric')[0].label).toBe('<50');
  });

  it('splits a route into colored pieces', () => {
    const path: [number, number][] = [[0, 0], [0, 0.001], [0, 0.002], [0, 0.003]];
    const pieces = routeByBand(path, [mph(20), mph(22), mph(60), mph(62)], 'imperial');
    expect(pieces.map((p) => p.coords.length)).toEqual([1, 1, 1]); // slow, then 30–50 (avg 41), then 50–70
    expect(routeByBand(path, undefined, 'imperial')).toEqual([]);
  });
});

describe('keepSpeedChanges', () => {
  it('keeps points where the speed changes on a straight road', () => {
    // Simplification kept only the ends; the speed jumps at index 2 and drops at 4.
    expect(keepSpeedChanges([0, 5], [10, 10, 20, 21, 9, 9])).toEqual([0, 2, 4, 5]);
  });
});
