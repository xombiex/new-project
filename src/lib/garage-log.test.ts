import { describe, expect, it } from 'vitest';

import { economyLabel, fuelEconomy, parseCents, parseNumber, spentSince, toKm, toLitres } from './garage-log';

describe('fuel economy', () => {
  it('needs two full tanks before it says anything', () => {
    expect(fuelEconomy([])).toBeNull();
    expect(fuelEconomy([{ litres: 40, odometerKm: 1000, fullTank: true }])).toBeNull();
  });

  it('is the fuel put in between two full tanks over the distance driven', () => {
    const l100 = fuelEconomy([
      { litres: 40, odometerKm: 1000, fullTank: true },
      { litres: 35, odometerKm: 1500, fullTank: true },
    ]);
    expect(l100).toBeCloseTo(7, 5);
  });

  it('adds partial fills to the next full tank, and ignores a trailing partial', () => {
    const l100 = fuelEconomy([
      { litres: 40, odometerKm: 1000, fullTank: true },
      { litres: 10, odometerKm: 1200, fullTank: false },
      { litres: 30, odometerKm: 1500, fullTank: true },
      { litres: 15, odometerKm: 1700, fullTank: false },
    ]);
    expect(l100).toBeCloseTo(8, 5);
  });

  it('skips fills with no odometer reading and copes with any order', () => {
    const l100 = fuelEconomy([
      { litres: 35, odometerKm: 1500, fullTank: true },
      { litres: 99, odometerKm: null, fullTank: true },
      { litres: 40, odometerKm: 1000, fullTank: true },
    ]);
    expect(l100).toBeCloseTo(7, 5);
  });

  it('reads as mpg or litres per 100 km', () => {
    expect(economyLabel('metric', 7.56)).toBe('7.6 L/100 km');
    expect(economyLabel('imperial', 7.84)).toBe('30 mpg');
  });
});

describe('what people type', () => {
  it('reads numbers with commas and spaces, and refuses the rest', () => {
    expect(parseNumber('1,234.5')).toBe(1234.5);
    expect(parseNumber(' 40 ')).toBe(40);
    expect(parseNumber('')).toBeNull();
    expect(parseNumber('abc')).toBeNull();
    expect(parseNumber('-5')).toBeNull();
  });

  it('turns money into cents', () => {
    expect(parseCents('45.99')).toBe(4599);
    expect(parseCents('$1,200')).toBe(120000);
    expect(parseCents('')).toBeNull();
  });

  it('stores miles and gallons as kilometres and litres', () => {
    expect(toKm('imperial', 100)).toBeCloseTo(160.9344);
    expect(toKm('metric', 100)).toBe(100);
    expect(toLitres('imperial', 10)).toBeCloseTo(37.854, 3);
  });
});

describe('spending', () => {
  it('adds service and fuel from a date on, and treats a missing cost as nothing', () => {
    const total = spentSince(
      '2026-01-01',
      [
        { done_on: '2026-03-01', cost_cents: 8000 },
        { done_on: '2025-12-31', cost_cents: 99999 },
        { done_on: '2026-05-01', cost_cents: null },
      ],
      [{ filled_on: '2026-01-01', cost_cents: 5000 }]
    );
    expect(total).toBe(13000);
  });
});
