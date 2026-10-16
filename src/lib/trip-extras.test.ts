import { describe, expect, it } from 'vitest';

import type { LngLat } from '@/lib/geo';
import { toGpx } from '@/lib/gpx';
import { hideZones, inZone, type PrivacyZone } from '@/lib/privacy';

const home: PrivacyZone = { id: 'h', name: 'Home', lat: 37, lng: -122, radiusM: 300 };
// ~111 m per 0.001° latitude
const line = (from: number, to: number): LngLat[] => {
  const out: LngLat[] = [];
  for (let lat = from; lat <= to + 1e-9; lat += 0.001) out.push([-122, Number(lat.toFixed(3))]);
  return out;
};

describe('privacy zones', () => {
  it('detects points inside a zone', () => {
    expect(inZone([-122, 37.002], [home])).toBe(true); // ~222 m
    expect(inZone([-122, 37.004], [home])).toBe(false); // ~445 m
  });

  it('trims the start of a drive that leaves home', () => {
    const [seg] = hideZones(line(37, 37.01), [home]);
    expect(seg[0]).toEqual([-122, 37.003]);
    expect(seg.at(-1)).toEqual([-122, 37.01]);
  });

  it('splits a route that passes through a zone', () => {
    const segs = hideZones(line(36.99, 37.01), [home]);
    expect(segs).toHaveLength(2);
    expect(segs.flat().some((p) => inZone(p, [home]))).toBe(false);
  });

  it('returns the path untouched with no zones', () => {
    expect(hideZones(line(37, 37.002), [])).toEqual([line(37, 37.002)]);
  });
});

describe('gpx', () => {
  it('writes a valid track with escaped names and spread-out times', () => {
    const start = Date.UTC(2026, 9, 15, 12);
    const gpx = toGpx({ name: 'Tom & Jerry <run>', startedAt: start, endedAt: start + 600_000, segments: [line(37, 37.002)] });
    expect(gpx).toContain('<name>Tom &amp; Jerry &lt;run&gt;</name>');
    expect(gpx.match(/<trkpt /g)).toHaveLength(3);
    expect(gpx).toContain('<time>2026-10-15T12:00:00.000Z</time></trkpt>');
    expect(gpx).toContain('<time>2026-10-15T12:05:00.000Z</time></trkpt>');
    expect(gpx).toContain('<time>2026-10-15T12:10:00.000Z</time></trkpt>');
  });
});
