import { describe, expect, it } from 'vitest';

import { limitIn, matchRoad, parseMaxspeed, type Road } from './speed-limit';

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
