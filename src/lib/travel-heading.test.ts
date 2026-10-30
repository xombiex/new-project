import { describe, expect, it } from 'vitest';

import { nextTravelHeading, NO_HEADING } from './travel-heading';

const fix = (lat: number, lng: number, speed: number | null = null, heading: number | null = null, accuracy: number | null = 5) => ({ lat, lng, speed, heading, accuracy });
/** About 111 m of latitude. */
const NORTH = 0.001;

describe('nextTravelHeading', () => {
  it('uses the GPS course when moving', () => {
    expect(nextTravelHeading(NO_HEADING, fix(40, -105, 10, 123)).heading).toBe(123);
  });

  it('ignores the GPS course when crawling', () => {
    const s = nextTravelHeading(NO_HEADING, fix(40, -105, 1, 123));
    expect(s.heading).toBeNull();
  });

  it('works out the direction from positions when the device reports no course or speed', () => {
    const a = nextTravelHeading(NO_HEADING, fix(40, -105));
    const north = nextTravelHeading(a, fix(40 + NORTH, -105));
    expect(north.heading).toBeCloseTo(0, 0);
    const east = nextTravelHeading(north, fix(40 + NORTH, -105 + NORTH));
    expect(east.heading).toBeCloseTo(90, 0);
  });

  it('holds the last direction when stopped, even if the position wobbles', () => {
    const moving = nextTravelHeading(NO_HEADING, fix(40, -105, 10, 77));
    expect(nextTravelHeading(moving, fix(40, -105, 0, null)).heading).toBe(77);
    expect(nextTravelHeading(moving, fix(40 + NORTH, -105, 0, null)).heading).toBe(77);
    expect(nextTravelHeading(moving, fix(40.00001, -105)).heading).toBe(77); // ~1 m, no speed reported
  });

  it('does not turn on position noise from a poor fix', () => {
    const a = nextTravelHeading(NO_HEADING, fix(40, -105, null, null, 80));
    expect(nextTravelHeading(a, fix(40.00015, -105, null, null, 80)).heading).toBeNull(); // ~17 m, within the error
    expect(nextTravelHeading(a, fix(40 + NORTH, -105, null, null, 80)).heading).toBeCloseTo(0, 0);
  });
});
