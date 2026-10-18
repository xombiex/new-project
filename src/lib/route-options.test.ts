import { describe, expect, it } from 'vitest';

import type { OsrmStep } from './instructions';
import { countTurns, labelRoutes, type Route } from './places';

const step = (type: string, modifier?: string): OsrmStep => ({ distance: 100, duration: 10, name: '', maneuver: { type, modifier, location: [0, 0] } });

const route = (distanceM: number, durationS: number, turns: number, mode: Route['mode'] = 'fastest'): Route => ({
  distanceM,
  durationS,
  geometry: [],
  steps: [],
  turns,
  mode,
});

describe('countTurns', () => {
  it('counts real maneuvers only', () => {
    const steps = [step('depart'), step('turn', 'left'), step('new name', 'straight'), step('continue', 'right'), step('off ramp', 'slight right'), step('turn', 'straight'), step('arrive')];
    expect(countTurns(steps)).toBe(2);
  });
});

describe('labelRoutes', () => {
  it('tags fastest, shortest, fewest turns and no highways', () => {
    const fast = route(10_000, 600, 8);
    const alt = route(11_000, 650, 3);
    const short = route(8_000, 800, 12, 'shortest');
    const noHwy = route(9_500, 900, 10, 'no-highways');
    const out = labelRoutes([fast, alt], short, noHwy);
    expect(out.map((r) => r.tags)).toEqual([['fastest'], ['shortest'], ['fewest-turns'], ['no-highways']]);
    expect(out[0].mode).toBe('fastest');
  });

  it('merges a duplicate into one route with both labels', () => {
    const fast = route(10_000, 600, 4);
    const noHwy = route(10_050, 605, 4, 'no-highways'); // same road
    const short = route(9_000, 700, 9, 'shortest');
    const out = labelRoutes([fast], short, noHwy);
    expect(out).toHaveLength(2);
    expect(out[0].tags).toEqual(['fastest', 'fewest-turns', 'no-highways']);
    expect(out[1].tags).toEqual(['shortest']);
  });

  it('keeps working when the second router is down', () => {
    const out = labelRoutes([route(10_000, 600, 5), route(10_500, 640, 6)]);
    expect(out[0].tags).toEqual(['fastest', 'shortest', 'fewest-turns']);
    expect(out[1].tags).toEqual([]);
  });
});
