import { describe, expect, it } from 'vitest';

import type { LngLat } from '@/lib/geo';
import { instructionFor, spokenDistance, type OsrmStep } from '@/lib/instructions';
import { announce, buildNavRoute, isOffRoute, progress, snap } from '@/lib/navigation';

// L-shaped route: ~1.1 km north, then ~0.9 km east.
const corner: LngLat = [-122, 37.01];
const end: LngLat = [-121.99, 37.01];
const geometry: LngLat[] = [];
for (let i = 0; i <= 10; i++) geometry.push([-122, 37 + i * 0.001]);
for (let i = 1; i <= 10; i++) geometry.push([-122 + i * 0.001, 37.01]);

const steps: OsrmStep[] = [
  { distance: 1112, duration: 80, name: 'North Rd', maneuver: { type: 'depart', location: [-122, 37] } },
  { distance: 889, duration: 70, name: 'Main Street', maneuver: { type: 'turn', modifier: 'right', location: corner } },
  { distance: 0, duration: 0, name: '', maneuver: { type: 'arrive', location: end } },
];
const route = buildNavRoute(geometry, steps, 150);

describe('instructions', () => {
  it('phrases common maneuvers', () => {
    expect(instructionFor(steps[1])).toBe('turn right onto Main Street');
    expect(instructionFor({ ...steps[1], maneuver: { type: 'roundabout', exit: 2, location: corner } })).toBe(
      'at the roundabout, take the second exit onto Main Street'
    );
    expect(instructionFor({ ...steps[1], destinations: 'San Jose, Gilroy', maneuver: { type: 'off ramp', modifier: 'slight right', location: corner } })).toBe(
      'take the exit on the right toward San Jose'
    );
    expect(instructionFor({ ...steps[1], maneuver: { type: 'arrive', modifier: 'left', location: end } })).toBe('your destination is on the left');
  });

  it('speaks distances naturally', () => {
    expect(spokenDistance('imperial', 150)).toBe('500 feet');
    expect(spokenDistance('imperial', 800)).toBe('half a mile');
    expect(spokenDistance('imperial', 3300)).toBe('2 miles');
    expect(spokenDistance('metric', 420)).toBe('400 meters');
    expect(spokenDistance('metric', 1200)).toBe('1 kilometer');
  });
});

describe('navigation progress', () => {
  it('places maneuvers along the route', () => {
    expect(route.steps[1].along).toBeCloseTo(1112, -1);
    expect(route.totalM).toBeGreaterThan(1900);
  });

  it('tracks the next maneuver and remaining distance', () => {
    const p = progress(route, [-121.99999, 37.005], 0); // halfway up, slightly off the line
    expect(p.next).toBe(1);
    expect(p.toNextM).toBeCloseTo(556, -1);
    expect(p.snap.offsetM).toBeLessThan(2);
    expect(p.arrived).toBe(false);
    const after = progress(route, [-121.995, 37.01], p.snap.segment);
    expect(after.next).toBe(2);
    expect(route.steps[after.next].type).toBe('arrive');
  });

  it('detects arrival and off-route', () => {
    expect(progress(route, [-121.9901, 37.01], 15).arrived).toBe(true);
    const off = snap(route, [-122.002, 37.005], 4);
    expect(off.offsetM).toBeGreaterThan(150);
    expect(isOffRoute(off.offsetM, 10)).toBe(true);
    expect(isOffRoute(20, 10)).toBe(false);
  });
});

describe('announcements', () => {
  it('speaks each tier once, closest tier wins when starting near a turn', () => {
    const spoken = new Set<string>();
    const at = (lat: number) => progress(route, [-122, lat], 0);

    // ~550 m before the turn at city speed: inside the 800 m "far" tier
    const first = announce(route, at(37.005), 10, 'imperial', spoken);
    expect(first?.text).toBe('In a quarter mile, turn right onto Main Street.');
    spoken.add(first!.key);
    expect(announce(route, at(37.0051), 10, 'imperial', spoken)).toBeNull();

    const prep = announce(route, at(37.0088), 10, 'imperial', spoken); // ~133 m out
    expect(prep?.text).toBe('In 400 feet, turn right onto Main Street.');
    spoken.add(prep!.key);

    const now = announce(route, at(37.0098), 10, 'imperial', spoken); // ~22 m out
    expect(now?.text).toBe('Turn right onto Main Street.');
  });

  it('announces arrival once', () => {
    const spoken = new Set<string>();
    const p = progress(route, end, 15);
    const a = announce(route, p, 5, 'metric', spoken);
    expect(a?.key).toBe('arrived');
    spoken.add(a!.key);
    expect(announce(route, p, 5, 'metric', spoken)).toBeNull();
  });
});
