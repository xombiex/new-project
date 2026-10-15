import { describe, expect, it } from 'vitest';

import { formatDistance, formatDuration, haversine, simplifyPath, speedIn, type LngLat } from '@/lib/geo';
import { addSample, averageSpeedMps, startTrip, type LocationSample } from '@/lib/trip-recorder';

// ~111.2 m per 0.001° latitude
const sample = (lat: number, t: number, extra: Partial<LocationSample> = {}): LocationSample => ({
  lat,
  lng: -122,
  speed: 10,
  accuracy: 5,
  heading: 0,
  timestamp: t * 1000,
  ...extra,
});

describe('geo', () => {
  it('haversine matches known distance (SF → LA ≈ 559 km)', () => {
    const d = haversine([-122.4194, 37.7749], [-118.2437, 34.0522]);
    expect(d / 1000).toBeCloseTo(559, -1);
  });

  it('converts speeds', () => {
    expect(speedIn('imperial', 26.8224)).toBeCloseTo(60, 1);
    expect(speedIn('metric', 10)).toBeCloseTo(36, 5);
    expect(speedIn('metric', -1)).toBe(0);
  });

  it('formats distances and durations', () => {
    expect(formatDistance('imperial', 16093.44)).toBe('10 mi');
    expect(formatDistance('imperial', 30)).toBe('98 ft');
    expect(formatDistance('metric', 1500)).toBe('1.5 km');
    expect(formatDuration(65)).toBe('1:05');
    expect(formatDuration(3720)).toBe('1h 02m');
  });

  it('simplifies a straight line to its endpoints', () => {
    const line: LngLat[] = Array.from({ length: 50 }, (_, i) => [-122, 37 + i * 0.0001]);
    expect(simplifyPath(line)).toEqual([line[0], line[49]]);
  });

  it('keeps corners when simplifying', () => {
    const corner: LngLat[] = [
      [-122, 37],
      [-122, 37.001],
      [-122, 37.002],
      [-121.999, 37.002],
      [-121.998, 37.002],
    ];
    expect(simplifyPath(corner)).toEqual([corner[0], corner[2], corner[4]]);
  });
});

describe('trip recorder', () => {
  it('accumulates distance, moving time and max speed', () => {
    let s = startTrip(0);
    s = addSample(s, sample(37, 0));
    s = addSample(s, sample(37.001, 10, { speed: 11 }));
    s = addSample(s, sample(37.002, 20, { speed: 12 }));
    expect(s.distanceM).toBeCloseTo(222.4, 0);
    expect(s.movingS).toBe(20);
    expect(s.maxSpeedMps).toBe(12);
    expect(averageSpeedMps(s)).toBeCloseTo(11.1, 1);
    expect(s.path).toHaveLength(3);
  });

  it('ignores inaccurate fixes', () => {
    let s = startTrip(0);
    s = addSample(s, sample(37, 0));
    s = addSample(s, sample(37.01, 5, { accuracy: 200 }));
    expect(s.distanceM).toBe(0);
    expect(s.last?.accuracy).toBe(200);
  });

  it('ignores stationary GPS jitter', () => {
    let s = startTrip(0);
    s = addSample(s, sample(37, 0, { speed: 0 }));
    s = addSample(s, sample(37.00002, 1, { speed: 0.2 })); // ~2 m wobble
    s = addSample(s, sample(37, 2, { speed: 0 }));
    expect(s.distanceM).toBe(0);
    expect(s.movingS).toBe(0);
  });

  it('drops teleport glitches', () => {
    let s = startTrip(0);
    s = addSample(s, sample(37, 0));
    s = addSample(s, sample(38, 1)); // 111 km in 1 s
    expect(s.distanceM).toBe(0);
    s = addSample(s, sample(37.001, 10));
    expect(s.distanceM).toBeCloseTo(111.2, 0);
  });

  it('does not count long signal gaps as moving time', () => {
    let s = startTrip(0);
    s = addSample(s, sample(37, 0));
    s = addSample(s, sample(37.02, 120)); // tunnel: 2 min gap
    expect(s.movingS).toBe(0);
    expect(s.distanceM).toBeGreaterThan(2000);
  });

  it('ignores out-of-order samples', () => {
    let s = startTrip(0);
    s = addSample(s, sample(37, 10));
    const before = s;
    s = addSample(s, sample(37.001, 5));
    expect(s).toBe(before);
  });

  it('falls back to derived speed when GPS speed is unavailable', () => {
    let s = startTrip(0);
    s = addSample(s, sample(37, 0, { speed: -1 }));
    s = addSample(s, sample(37.001, 10, { speed: -1 }));
    expect(s.maxSpeedMps).toBeCloseTo(11.1, 1);
    expect(s.movingS).toBe(10);
  });
});
