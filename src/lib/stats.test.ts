import { describe, expect, it } from 'vitest';

import { evaluate } from '@/lib/achievements';
import { buckets, change, periodStart, records, streaks, totals, type TripLike } from '@/lib/stats';

const MI = 1609.344;
let n = 0;
const trip = (start: Date, miles: number, minutes = 30, mph = 40): TripLike => ({
  id: String(n++),
  startedAt: start.getTime(),
  endedAt: start.getTime() + minutes * 60_000,
  distanceM: miles * MI,
  movingS: minutes * 60,
  maxSpeedMps: mph / 2.236936,
});

// Thursday 15 Oct 2026, noon local
const NOW = new Date(2026, 9, 15, 12).getTime();

describe('periods', () => {
  it('weeks start on Monday', () => {
    expect(new Date(periodStart('week', NOW)).toDateString()).toBe(new Date(2026, 9, 12).toDateString());
    expect(new Date(periodStart('week', NOW, 1)).toDateString()).toBe(new Date(2026, 9, 5).toDateString());
  });
  it('months and years', () => {
    expect(new Date(periodStart('month', NOW, 1)).toDateString()).toBe(new Date(2026, 8, 1).toDateString());
    expect(new Date(periodStart('year', NOW)).toDateString()).toBe(new Date(2026, 0, 1).toDateString());
  });
});

describe('buckets', () => {
  const trips = [trip(new Date(2026, 9, 12, 8), 10), trip(new Date(2026, 9, 12, 18), 5), trip(new Date(2026, 9, 15, 9), 20), trip(new Date(2026, 9, 1, 9), 99)];
  it('sums distance per weekday', () => {
    const bars = buckets(trips, 'week', NOW);
    expect(bars).toHaveLength(7);
    expect(bars[0].value / MI).toBeCloseTo(15);
    expect(bars[3].value / MI).toBeCloseTo(20);
    expect(bars.reduce((a, b) => a + b.value, 0) / MI).toBeCloseTo(35); // Oct 1 is outside this week
  });
  it('month has one bar per day, year one per month', () => {
    expect(buckets(trips, 'month', NOW)).toHaveLength(31);
    const year = buckets(trips, 'year', NOW);
    expect(year).toHaveLength(12);
    expect(year[9].value / MI).toBeCloseTo(134);
  });
});

describe('totals, change, records', () => {
  const trips = [trip(new Date(2026, 9, 12, 8), 10, 20), trip(new Date(2026, 9, 13, 8), 120, 200, 70), trip(new Date(2026, 9, 13, 18), 5, 10)];
  it('totals within a range', () => {
    expect(totals(trips).count).toBe(3);
    expect(totals(trips, periodStart('week', NOW)).distanceM / MI).toBeCloseTo(135);
  });
  it('change vs previous', () => {
    expect(change(150, 100)).toBeCloseTo(0.5);
    expect(change(10, 0)).toBeNull();
  });
  it('records', () => {
    const r = records(trips);
    expect(r.longest?.distanceM).toBeCloseTo(120 * MI);
    expect(r.topSpeed?.id).toBe(trips[1].id);
    expect(r.bestDayM / MI).toBeCloseTo(125);
    expect(r.bestWeekM / MI).toBeCloseTo(135);
  });
});

describe('streaks', () => {
  it('counts consecutive days and keeps a streak alive until today ends', () => {
    const trips = [new Date(2026, 9, 10), new Date(2026, 9, 12), new Date(2026, 9, 13), new Date(2026, 9, 14)].map((d) => trip(d, 1));
    expect(streaks(trips, NOW)).toEqual({ current: 3, best: 3 });
    expect(streaks(trips, new Date(2026, 9, 17).getTime()).current).toBe(0);
  });
});

describe('achievements', () => {
  it('evaluates progress and caps at the goal', () => {
    const trips = [trip(new Date(2026, 9, 12, 6), 110, 190), trip(new Date(2026, 9, 13, 2), 5)];
    const byId = Object.fromEntries(evaluate(trips, NOW).map((a) => [a.id, a]));
    expect(byId.first_drive.earned).toBe(true);
    expect(byId.road_trip.earned).toBe(true);
    expect(byId.marathon.earned).toBe(true);
    expect(byId.early_bird.earned).toBe(true);
    expect(byId.night_owl.earned).toBe(true);
    expect(byId.century.earned).toBe(true);
    expect(byId.thousand.earned).toBe(false);
    expect(byId.thousand.value).toBeCloseTo(115);
    expect(byId.regular.value).toBe(2);
  });
});
