import { describe, expect, it } from 'vitest';

import type { OsrmStep } from './instructions';
import { buildNavRoute, laneArrow } from './navigation';
import { describeAlert, firstAlert, samplePoints, weatherKind, type RoutePoint } from './weather';

const step = (modifier: string, lanes?: { valid: boolean; indications: string[] }[]): OsrmStep => ({
  distance: 100,
  duration: 10,
  name: 'Main St',
  maneuver: { type: 'turn', modifier, location: [0, 0.001] },
  intersections: [{ lanes }],
});

describe('lane guidance', () => {
  it('keeps lanes only when they tell you something', () => {
    const geometry: [number, number][] = [
      [0, 0],
      [0, 0.002],
    ];
    const route = buildNavRoute(
      geometry,
      [
        step('left', [
          { valid: true, indications: ['left'] },
          { valid: false, indications: ['straight'] },
        ]),
        step('right', [
          { valid: true, indications: ['none'] },
          { valid: true, indications: ['none'] },
        ]),
        step('right', [{ valid: true, indications: ['right'] }]),
      ],
      60
    );
    expect(route.steps[0].lanes).toHaveLength(2);
    expect(route.steps[1].lanes).toBeUndefined(); // all valid, no arrows
    expect(route.steps[2].lanes).toBeUndefined(); // single lane
  });

  it('draws the arrow that matches your turn', () => {
    expect(laneArrow({ valid: true, indications: ['straight', 'right'] }, 'right').angle).toBe(90);
    expect(laneArrow({ valid: false, indications: ['left'] }, 'right').angle).toBe(-90);
    expect(laneArrow({ valid: true, indications: ['uturn', 'left'] }, 'uturn').uturn).toBe(true);
  });
});

describe('weather along a route', () => {
  it('maps WMO codes to what matters for driving', () => {
    expect(weatherKind(0, 0)).toBeNull();
    expect(weatherKind(61, 0.5)).toBe('rain');
    expect(weatherKind(65, 6)).toBe('heavy-rain');
    expect(weatherKind(95, 2)).toBe('storm');
    expect(weatherKind(73, 0.2)).toBe('snow');
    expect(weatherKind(45, 0)).toBe('fog');
  });

  it('samples points with arrival times', () => {
    const geometry: [number, number][] = [
      [0, 0],
      [0, 0.5],
    ]; // ~55 km
    const pts = samplePoints(geometry, [0, 55_600], 3600, 0, [{ along: 20_000, name: 'Ridge Rd' }]);
    expect(pts.length).toBeGreaterThan(3);
    expect(pts[0].minutes).toBe(0);
    expect(pts.at(-1)!.minutes).toBe(60);
    expect(pts.at(-1)!.place).toBe('Ridge Rd');
  });

  it('reports the first bad spot in the hour you will be there', () => {
    const now = Date.parse('2026-10-18T02:10:00Z');
    const points: RoutePoint[] = [
      { coord: [0, 0], minutes: 0, place: null },
      { coord: [0, 0.1], minutes: 55, place: 'Ridge Rd' },
    ];
    const hourly = (codes: number[]) => ({ hourly: { time: ['2026-10-18T02:00', '2026-10-18T03:00'], weather_code: codes, precipitation: [0, 0] } });
    const alert = firstAlert(points, [hourly([0, 0]), hourly([0, 63])], now);
    expect(alert).toEqual({ kind: 'rain', minutes: 55, place: 'Ridge Rd' });
    expect(describeAlert(alert!)).toBe('Rain near Ridge Rd in 55 min');
  });
});
