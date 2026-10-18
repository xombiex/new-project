import { describe, expect, it } from 'vitest';

import { openState, parseOpeningHours } from './opening-hours';

// Local-time dates: 2026-10-19 is a Monday.
const at = (day: number, h: number, m = 0) => new Date(2026, 9, 19 + day, h, m);

describe('parseOpeningHours', () => {
  it('reads common forms', () => {
    const w = parseOpeningHours('Mo-Fr 08:00-18:00; Sa 09:00-14:00; Su off')!;
    expect(w[0]).toEqual([[480, 1080]]);
    expect(w[5]).toEqual([[540, 840]]);
    expect(w[6]).toEqual([]);
    expect(parseOpeningHours('24/7')![3]).toEqual([[0, 1440]]);
    expect(parseOpeningHours('10:00-22:00')![6]).toEqual([[600, 1320]]);
    expect(parseOpeningHours('Fr-Sa 18:00-02:00')![4]).toEqual([[1080, 1560]]);
  });
  it('gives up on forms it does not know', () => {
    expect(parseOpeningHours('Mo-Fr sunrise-sunset')).toBeNull();
    expect(parseOpeningHours('PH off')).toBeNull();
  });
});

describe('openState', () => {
  const week = parseOpeningHours('Mo-Fr 08:00-18:00; Sa 09:00-14:00; Su off')!;
  it('knows when a place is open and when it closes', () => {
    expect(openState(week, at(0, 10)).open).toBe(true);
    expect(openState(week, at(0, 10)).label).toMatch(/^Open · Closes 6/);
  });
  it('says when it opens next', () => {
    expect(openState(week, at(0, 7)).label).toMatch(/^Closed · Opens 8/);
    expect(openState(week, at(5, 15)).label).toMatch(/^Closed · Opens Mon 8/); // Sat afternoon → Monday
  });
  it('handles closing after midnight', () => {
    const bar = parseOpeningHours('Fr-Sa 18:00-02:00')!;
    expect(openState(bar, at(5, 1)).open).toBe(true); // Saturday 1 AM, from Friday night
  });
  it('labels 24/7', () => {
    expect(openState(parseOpeningHours('24/7')!).label).toBe('Open 24 hours');
  });
});
