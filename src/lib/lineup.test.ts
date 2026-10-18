import { describe, expect, it } from 'vitest';

import { lineup, type LineupInput } from './lineup';

const m = (id: string, coord: [number, number] | null, extra: Partial<LineupInput> = {}): LineupInput => ({
  id,
  name: id,
  color: '#000',
  coord,
  stale: false,
  arrived: false,
  ...extra,
});

describe('lineup', () => {
  // Driving north along a meridian: +0.001° lat ≈ 111 m.
  const members = [m('me', [0, 0]), m('ahead', [0, 0.003]), m('behind', [0, -0.002]), m('lost', null)];

  it('orders by the way you are facing when there is no destination', () => {
    const out = lineup(members, 'me', 0, null);
    expect(out.map((e) => e.id)).toEqual(['ahead', 'me', 'behind', 'lost']);
    expect(Math.round(out[0].gapM!)).toBe(334);
    expect(Math.round(out[2].gapM!)).toBe(-222);
    expect(out[3].gapM).toBeNull();
  });

  it('orders by distance to the destination when there is one', () => {
    // Destination due south: the one behind me is now leading.
    const out = lineup(members, 'me', 0, [0, -0.01]);
    expect(out.map((e) => e.id)).toEqual(['behind', 'me', 'ahead', 'lost']);
    expect(out[0].gapM!).toBeGreaterThan(0);
  });

  it('puts people who arrived at the front', () => {
    const out = lineup([...members.slice(0, 2), m('done', [5, 5], { arrived: true })], 'me', 0, [0, 0.01]);
    expect(out[0].id).toBe('done');
  });
});
