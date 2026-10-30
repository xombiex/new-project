import { describe, expect, it } from 'vitest';

import { odometerDigits } from '@/lib/odometer';

import { driveKicker } from './drive-kicker';

describe('driveKicker', () => {
  // 2026-10-24 is a Saturday, 10-25 a Sunday, 10-26 a Monday, 10-30 a Friday.
  it('knows the car scene calendar', () => {
    expect(driveKicker(new Date(2026, 9, 24, 8))).toBe('Cars & coffee?');
    expect(driveKicker(new Date(2026, 9, 25, 11))).toBe('Sunday drive?');
    expect(driveKicker(new Date(2026, 9, 30, 20))).toBe('Night cruise?');
  });

  it('has something for an ordinary day', () => {
    expect(driveKicker(new Date(2026, 9, 26, 3))).toBe('Empty roads. Good hour.');
    expect(driveKicker(new Date(2026, 9, 26, 8))).toBe('Morning. Keys in hand?');
    expect(driveKicker(new Date(2026, 9, 26, 13))).toBe('Where to today?');
    expect(driveKicker(new Date(2026, 9, 26, 18))).toBe('Taking the long way home?');
    expect(driveKicker(new Date(2026, 9, 26, 22))).toBe('One more lap of town?');
  });
});

describe('odometerDigits', () => {
  it('splits whole and tenths across the drums', () => {
    expect(odometerDigits(4821.67)).toEqual([0, 0, 4, 8, 2, 1, 6]);
    expect(odometerDigits(0)).toEqual([0, 0, 0, 0, 0, 0, 0]);
  });

  it('rolls over at a million, like the real thing', () => {
    expect(odometerDigits(1000000.5)).toEqual([0, 0, 0, 0, 0, 0, 5]);
  });
});
