import { describe, expect, it } from 'vitest';

import { initialDetector, step, type DetectorEvent, type DetectorState } from '@/lib/auto-trip';
import type { LocationSample } from '@/lib/trip-recorder';

const at = (sec: number, speed: number, accuracy = 10): LocationSample => ({
  lat: 37,
  lng: -122,
  speed,
  accuracy,
  heading: null,
  timestamp: sec * 1000,
});

function run(samples: LocationSample[], state: DetectorState = initialDetector) {
  const events: [number, DetectorEvent][] = [];
  for (const s of samples) {
    const r = step(state, s);
    state = r.state;
    if (r.event) events.push([s.timestamp / 1000, r.event]);
  }
  return { state, events };
}

describe('auto trip detection', () => {
  it('starts after 20 s at driving speed', () => {
    const { events } = run([at(0, 2), at(5, 10), at(15, 12), at(24, 11), at(26, 13)]);
    expect(events).toEqual([[26, 'start']]);
  });

  it('ignores a short burst and inaccurate fixes', () => {
    expect(run([at(0, 10), at(10, 10), at(15, 1), at(30, 10)]).events).toEqual([]);
    expect(run([at(0, 10, 200), at(30, 10, 200)]).events).toEqual([]);
  });

  it('a red light does not end the drive, five stopped minutes does', () => {
    const driving = run([at(0, 10), at(20, 10)]).state;
    expect(driving.driving).toBe(true);
    const light = run([at(30, 0), at(90, 0), at(120, 12)], driving);
    expect(light.events).toEqual([]);
    const parked = run([at(200, 0), at(400, 0.5), at(501, 0)], light.state);
    expect(parked.events).toEqual([[501, 'stop']]);
  });

  it('a long gap in updates ends the drive', () => {
    const driving = run([at(0, 10), at(20, 10)]).state;
    expect(run([at(20 + 11 * 60, 10)], driving).events).toEqual([[680, 'stop']]);
  });
});
