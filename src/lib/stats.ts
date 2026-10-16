/** Pure stats over saved trips. Times are local (the user's calendar), distances in meters. */

export type TripLike = {
  id: string;
  startedAt: number;
  endedAt: number;
  distanceM: number;
  movingS: number;
  maxSpeedMps: number;
};

export type Period = 'week' | 'month' | 'year';

export type Bar = { label: string; value: number; start: number };

const DAY = 86_400_000;

function startOfDay(t: number) {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Start of the period containing `now`, offset by `back` whole periods. Weeks start Monday. */
export function periodStart(period: Period, now: number, back = 0): number {
  const d = new Date(startOfDay(now));
  if (period === 'week') {
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7) - back * 7);
  } else if (period === 'month') {
    d.setDate(1);
    d.setMonth(d.getMonth() - back);
  } else {
    d.setMonth(0, 1);
    d.setFullYear(d.getFullYear() - back);
  }
  return d.getTime();
}

export function periodEnd(period: Period, now: number, back = 0): number {
  return periodStart(period, now, back - 1);
}

/** Distance per day (week/month) or per month (year) for the period containing `now`. */
export function buckets(trips: TripLike[], period: Period, now: number): Bar[] {
  const start = periodStart(period, now);
  const end = periodEnd(period, now);
  const bars: Bar[] = [];
  if (period === 'year') {
    for (let m = 0; m < 12; m++) {
      const d = new Date(start);
      d.setMonth(m);
      bars.push({ label: d.toLocaleDateString([], { month: 'narrow' }), value: 0, start: d.getTime() });
    }
    for (const t of trips) {
      if (t.startedAt >= start && t.startedAt < end) bars[new Date(t.startedAt).getMonth()].value += t.distanceM;
    }
    return bars;
  }
  for (let day = start; day < end; day = startOfDay(day + DAY * 1.5)) {
    const d = new Date(day);
    const label = period === 'week' ? d.toLocaleDateString([], { weekday: 'narrow' }) : String(d.getDate());
    bars.push({ label, value: 0, start: day });
  }
  for (const t of trips) {
    if (t.startedAt < start || t.startedAt >= end) continue;
    const i = bars.findIndex((b, j) => t.startedAt >= b.start && (j === bars.length - 1 || t.startedAt < bars[j + 1].start));
    if (i >= 0) bars[i].value += t.distanceM;
  }
  return bars;
}

export type Totals = { count: number; distanceM: number; durationS: number; movingS: number };

export function totals(trips: TripLike[], from = -Infinity, to = Infinity): Totals {
  const out: Totals = { count: 0, distanceM: 0, durationS: 0, movingS: 0 };
  for (const t of trips) {
    if (t.startedAt < from || t.startedAt >= to) continue;
    out.count++;
    out.distanceM += t.distanceM;
    out.durationS += (t.endedAt - t.startedAt) / 1000;
    out.movingS += t.movingS;
  }
  return out;
}

/** Fractional change from previous to current, or null when there's no baseline. */
export function change(current: number, previous: number): number | null {
  return previous > 0 ? (current - previous) / previous : null;
}

export type Records = {
  longest: TripLike | null;
  longestTime: TripLike | null;
  topSpeed: TripLike | null;
  bestDayM: number;
  bestWeekM: number;
};

export function records(trips: TripLike[]): Records {
  const byDay = new Map<number, number>();
  const byWeek = new Map<number, number>();
  let longest: TripLike | null = null;
  let longestTime: TripLike | null = null;
  let topSpeed: TripLike | null = null;
  for (const t of trips) {
    if (!longest || t.distanceM > longest.distanceM) longest = t;
    if (!longestTime || t.endedAt - t.startedAt > longestTime.endedAt - longestTime.startedAt) longestTime = t;
    if (!topSpeed || t.maxSpeedMps > topSpeed.maxSpeedMps) topSpeed = t;
    const day = startOfDay(t.startedAt);
    byDay.set(day, (byDay.get(day) ?? 0) + t.distanceM);
    const week = periodStart('week', t.startedAt);
    byWeek.set(week, (byWeek.get(week) ?? 0) + t.distanceM);
  }
  return {
    longest,
    longestTime,
    topSpeed,
    bestDayM: Math.max(0, ...byDay.values()),
    bestWeekM: Math.max(0, ...byWeek.values()),
  };
}

/** Consecutive calendar days with at least one drive. `current` counts back from today (or yesterday). */
export function streaks(trips: TripLike[], now: number): { current: number; best: number } {
  const days = [...new Set(trips.map((t) => startOfDay(t.startedAt)))].sort((a, b) => a - b);
  let best = 0;
  let run = 0;
  for (let i = 0; i < days.length; i++) {
    run = i > 0 && startOfDay(days[i - 1] + DAY * 1.5) === days[i] ? run + 1 : 1;
    best = Math.max(best, run);
  }
  const set = new Set(days);
  let current = 0;
  let day = startOfDay(now);
  if (!set.has(day)) day = startOfDay(day - DAY / 2); // a streak isn't broken until today ends
  while (set.has(day)) {
    current++;
    day = startOfDay(day - DAY / 2);
  }
  return { current, best };
}
