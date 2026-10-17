import { describe, expect, it } from 'vitest';

import { cameraAhead, camerasOnRoute, type Camera } from './cameras';

const cam = (id: number, kind: Camera['kind'], lng: number, lat: number): Camera => ({ id, kind, coord: [lng, lat] });

describe('cameraAhead', () => {
  const cams = [cam(1, 'speed', 0, 0.002), cam(2, 'speed', 0, -0.002), cam(3, 'alpr', 0.0001, 0.001)];

  it('finds the nearest camera in front of a moving car', () => {
    // Driving north at ~60 mph: the camera 220 m north is ahead, the one south is behind.
    expect(cameraAhead(cams, [0, 0], 0, 27, ['speed'])?.camera.id).toBe(1);
    expect(cameraAhead(cams, [0, 0], 180, 27, ['speed'])?.camera.id).toBe(2);
  });

  it('respects the kinds asked for and ignores parked cars', () => {
    expect(cameraAhead(cams, [0, 0], 0, 27, ['alpr'])?.camera.id).toBe(3);
    expect(cameraAhead(cams, [0, 0], 0, 1, ['speed'])).toBeNull();
    expect(cameraAhead(cams, [0, 0], 90, 27, ['speed'])).toBeNull();
  });
});

describe('camerasOnRoute', () => {
  it('counts cameras next to the route only', () => {
    const route: [number, number][] = [[0, 0], [0, 0.01]];
    const cams = [cam(1, 'alpr', 0.0001, 0.005), cam(2, 'alpr', 0.01, 0.005), cam(3, 'speed', 0, 0.009)];
    expect(camerasOnRoute(route, cams)).toEqual({ alpr: 1, speed: 1 });
  });
});
