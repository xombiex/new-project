import { describe, expect, it } from 'vitest';

import { estimatedLimit, limitFromKmh, limitIn, matchRoad, parseMaxspeed, roadFromEdges, roadsCell, toRoad, type Road } from './speed-limit';

describe('parseMaxspeed', () => {
  it('reads mph and defaults to km/h', () => {
    expect(parseMaxspeed('45 mph')).toEqual({ value: 45, unit: 'mph' });
    expect(parseMaxspeed('50')).toEqual({ value: 50, unit: 'kmh' });
    expect(parseMaxspeed('80 km/h')).toEqual({ value: 80, unit: 'kmh' });
    expect(parseMaxspeed('30 mph;20 mph')).toEqual({ value: 30, unit: 'mph' });
  });
  it('ignores non-numeric limits', () => {
    for (const t of ['none', 'signals', 'walk', 'DE:urban', '', undefined]) expect(parseMaxspeed(t)).toBeNull();
  });
});

describe('limitIn', () => {
  it('converts to the user units', () => {
    expect(limitIn('imperial', { value: 45, unit: 'mph' })).toBe(45);
    expect(limitIn('metric', { value: 45, unit: 'mph' })).toBe(72);
    expect(limitIn('imperial', { value: 100, unit: 'kmh' })).toBe(62);
  });
});

describe('matchRoad', () => {
  // A north–south avenue and an east–west street crossing it at (0, 0).
  const avenue: Road = { id: 1, limit: { value: 45, unit: 'mph' }, oneway: false, coords: [[0, -0.01], [0, 0.01]] };
  const street: Road = { id: 2, limit: { value: 25, unit: 'mph' }, oneway: false, coords: [[-0.01, 0], [0.01, 0]] };

  it('picks the nearest road', () => {
    expect(matchRoad([avenue, street], [0.00005, 0.004], null)?.id).toBe(1);
  });
  it('prefers the road matching the heading at an intersection', () => {
    expect(matchRoad([avenue, street], [0.00001, 0.00001], 90)?.id).toBe(2);
    expect(matchRoad([avenue, street], [0.00001, 0.00001], 180)?.id).toBe(1);
  });
  it('returns null when no road is close', () => {
    expect(matchRoad([avenue], [0.005, 0.004], 0)).toBeNull();
  });
});

describe('estimated limits', () => {
  const tampa: [number, number] = [-82.45, 27.95];
  const raw = (over: Record<string, unknown>) => ({ id: 1, name: 'Elm St', maxspeed: null, forward: null, backward: null, highway: 'residential', oneway: false, coords: [tampa, tampa], ...over });

  it('uses 25 mph on untagged US residential streets, marked as estimated', () => {
    expect(toRoad(raw({})).limit).toEqual({ value: 25, unit: 'mph', estimated: true });
  });

  it('prefers a posted limit, including one tagged per direction', () => {
    expect(toRoad(raw({ maxspeed: '30 mph' })).limit).toEqual({ value: 30, unit: 'mph' });
    expect(toRoad(raw({ forward: '35 mph' })).limit).toEqual({ value: 35, unit: 'mph' });
  });

  it('leaves other roads and other countries unknown', () => {
    expect(toRoad(raw({ highway: 'primary' })).limit).toBeNull();
    expect(estimatedLimit('residential', [2.35, 48.85])).toBeNull(); // Paris
  });

  it('groups lookups into a shared grid', () => {
    expect(roadsCell([-82.4561, 27.9512])).toBe(roadsCell([-82.4509, 27.9599]));
  });
});

describe('live road lookup (Valhalla)', () => {
  const tampa: [number, number] = [-82.45, 27.95];
  it('turns km/h back into the US sign value', () => {
    expect(limitFromKmh(56, tampa)).toEqual({ value: 35, unit: 'mph' });
    expect(limitFromKmh(40, tampa)).toEqual({ value: 25, unit: 'mph' });
    expect(limitFromKmh(50, [2.35, 48.85])).toEqual({ value: 50, unit: 'kmh' });
    expect(limitFromKmh(0, tampa)).toBeNull();
  });

  it('uses the last edge, estimating residential streets without a limit', () => {
    expect(roadFromEdges([{ names: ['Polk St'], road_class: 'tertiary' }, { names: ['Florida Ave'], road_class: 'primary', speed_limit: 56 }], tampa)).toEqual({
      limit: { value: 35, unit: 'mph' },
      name: 'Florida Ave',
      roadClass: 'primary',
    });
    expect(roadFromEdges([{ names: ['Elm St'], road_class: 'residential' }], tampa)?.limit).toEqual({ value: 25, unit: 'mph', estimated: true });
    expect(roadFromEdges([], tampa)).toBeNull();
  });
});
