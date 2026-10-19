import { describe, expect, it } from 'vitest';

import type { OsrmStep } from './instructions';
import { countTurns, curviness, labelRoutes, pickTwisty, type Route } from './places';

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

describe('twisty roads', () => {
  // ~5 km north–south; one straight, one weaving gently side to side like a back road.
  const straight: [number, number][] = Array.from({ length: 100 }, (_, i) => [0, i * 0.00045]);
  const wiggly: [number, number][] = Array.from({ length: 100 }, (_, i) => [Math.sin(i / 3) * 0.0006, i * 0.00045]);
  const grid: [number, number][] = [
    [0, 0],
    [0, 0.01],
    [0.01, 0.01],
    [0.01, 0.02],
    [0.02, 0.02],
  ];

  it('scores bends, not straight roads or right-angle city turns', () => {
    expect(curviness(straight)).toBe(0);
    expect(curviness(wiggly)).toBeGreaterThan(60);
    expect(curviness(grid)).toBe(0);
  });

  it('picks the bendiest route that is not a silly detour', () => {
    const fast = { ...route(5000, 300, 2), curviness: 10 };
    const bendy = { ...route(6000, 420, 9), curviness: 120 };
    const tooSlow = { ...route(9000, 900, 20), curviness: 300 };
    expect(pickTwisty([fast, bendy, tooSlow])?.curviness).toBe(120);
  });

  it('labels a twisty option only when it is clearly bendier', () => {
    const fast = { ...route(5000, 300, 2), curviness: 10 };
    const bendy = { ...route(6000, 420, 9, 'twisty'), curviness: 120 };
    expect(labelRoutes([fast], undefined, undefined, [bendy]).find((r) => r.tags?.includes('twisty'))?.curviness).toBe(120);
    expect(labelRoutes([fast], undefined, undefined, [{ ...bendy, curviness: 11 }]).some((r) => r.tags?.includes('twisty'))).toBe(false);
  });
});
