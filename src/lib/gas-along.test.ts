import { describe, expect, it, vi } from 'vitest';

vi.mock('@mapbox/vector-tile', () => ({ VectorTile: class {} }));
vi.mock('pbf', () => ({ PbfReader: class {} }));

const { stopsAlong, tilesAhead } = await import('./gas-along');
const { buildNavRoute } = await import('./navigation');

// A straight road north, ~22 km long.
const geometry: [number, number][] = Array.from({ length: 201 }, (_, i) => [0, i * 0.001]);
const route = buildNavRoute(geometry, [], 1200);

describe('gas along the route', () => {
  it('walks the tiles the road ahead passes through, once each', () => {
    const tiles = tilesAhead(route, 0, 10_000);
    expect(tiles.length).toBeGreaterThan(3);
    expect(new Set(tiles.map((t) => t.join())).size).toBe(tiles.length);
  });

  it('keeps stations just off the road ahead, soonest first', () => {
    const places = [
      { name: 'Behind you', kind: 'fuel' as const, coord: [0.0002, 0.001] as [number, number] },
      { name: 'Far off road', kind: 'fuel' as const, coord: [0.02, 0.05] as [number, number] },
      { name: 'Later', kind: 'fuel' as const, coord: [0.001, 0.15] as [number, number] },
      { name: 'Soon', kind: 'fuel' as const, coord: [0.0003, 0.06] as [number, number] },
      { name: 'Lot', kind: 'parking' as const, coord: [0, 0.07] as [number, number] },
    ];
    const out = stopsAlong(places, route, 2_000);
    expect(out.map((s) => s.name)).toEqual(['Soon', 'Later']);
    expect(Math.round(out[0].aheadM / 100)).toBe(47); // ~6.6 km along, minus the 2 km already driven
    expect(out[0].offRouteM).toBeLessThan(50);
  });
});
