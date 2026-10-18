/**
 * A small parser for OpenStreetMap `opening_hours` covering the forms most places use:
 *   "24/7", "Mo-Fr 08:00-18:00; Sa 09:00-14:00", "Mo,We 10:00-12:00,13:00-17:00",
 *   "Su off", times past midnight ("Fr-Sa 18:00-02:00"), rules without days ("10:00-22:00").
 * Anything fancier (holidays, months, sunrise…) returns null, and the raw text is shown instead.
 */
const DAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'] as const;
export const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/** Minutes from midnight, per weekday (0 = Monday); end may exceed 1440 for past-midnight. */
export type Week = [number, number][][];

function parseDays(spec: string): number[] | null {
  const out = new Set<number>();
  for (const part of spec.split(',')) {
    const m = /^(Mo|Tu|We|Th|Fr|Sa|Su)(?:-(Mo|Tu|We|Th|Fr|Sa|Su))?$/.exec(part.trim());
    if (!m) return null;
    const a = DAYS.indexOf(m[1] as (typeof DAYS)[number]);
    const b = m[2] ? DAYS.indexOf(m[2] as (typeof DAYS)[number]) : a;
    for (let d = a; ; d = (d + 1) % 7) {
      out.add(d);
      if (d === b) break;
    }
  }
  return [...out];
}

function parseTimes(spec: string): [number, number][] | null {
  const out: [number, number][] = [];
  for (const part of spec.split(',')) {
    const m = /^(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})\+?$/.exec(part.trim());
    if (!m) return null;
    const start = Number(m[1]) * 60 + Number(m[2]);
    let end = Number(m[3]) * 60 + Number(m[4]);
    if (end <= start) end += 1440; // closes after midnight
    out.push([start, end]);
  }
  return out;
}

export function parseOpeningHours(value: string | undefined): Week | null {
  if (!value) return null;
  const v = value.trim();
  if (v === '24/7') return DAYS.map(() => [[0, 1440]]);
  const week: Week = DAYS.map(() => []);
  for (const raw of v.split(';')) {
    const rule = raw.trim();
    if (!rule) continue;
    // "Mo-Fr 08:00-18:00", "Su off", "10:00-22:00", "Sa,Su closed"
    const m = /^(?:([A-Za-z,\-\s]+?)\s+)?([\d:,\-+\s]+|off|closed)$/.exec(rule);
    if (!m) return null;
    const days = m[1] ? parseDays(m[1].replace(/\s/g, '')) : DAYS.map((_, i) => i);
    if (!days) return null;
    const closed = m[2] === 'off' || m[2] === 'closed';
    const times = closed ? [] : parseTimes(m[2].replace(/\s/g, ''));
    if (!times) return null;
    for (const d of days) week[d] = times; // later rules override earlier ones, as in OSM
  }
  return week;
}

/** Monday-based weekday and minutes since midnight, in the device's local time. */
function local(now: Date) {
  return { day: (now.getDay() + 6) % 7, min: now.getHours() * 60 + now.getMinutes() };
}

const clock = (min: number) => {
  const m = ((min % 1440) + 1440) % 1440;
  const d = new Date(2000, 0, 1, Math.floor(m / 60), m % 60);
  return d.toLocaleTimeString([], { hour: 'numeric', minute: m % 60 ? '2-digit' : undefined });
};

export type OpenState = { open: boolean; label: string };

/** "Open · Closes 9 PM", "Closed · Opens 8 AM", "Open 24 hours". */
export function openState(week: Week, now = new Date()): OpenState {
  const { day, min } = local(now);
  const prev = (day + 6) % 7;
  if (week.every((d) => d.length === 1 && d[0][0] === 0 && d[0][1] >= 1440)) return { open: true, label: 'Open 24 hours' };
  // Still inside yesterday's past-midnight range?
  for (const [, e] of week[prev]) if (e > 1440 && min < e - 1440) return { open: true, label: `Open · Closes ${clock(e)}` };
  for (const [s, e] of week[day]) if (min >= s && min < e) return { open: true, label: e >= 1440 && s === 0 ? 'Open' : `Open · Closes ${clock(e)}` };
  // Closed: find the next opening within a week.
  for (let i = 0; i < 7; i++) {
    const d = (day + i) % 7;
    const next = week[d].map(([s]) => s).filter((s) => i > 0 || s > min).sort((a, b) => a - b)[0];
    if (next !== undefined) return { open: false, label: `Closed · Opens ${i === 0 ? '' : i === 1 ? 'tomorrow ' : `${DAY_NAMES[d].slice(0, 3)} `}${clock(next)}` };
  }
  return { open: false, label: 'Closed' };
}

/** One line per weekday for the expanded hours list. */
export function weekLines(week: Week): { day: string; hours: string }[] {
  return week.map((ranges, i) => ({
    day: DAY_NAMES[i],
    hours: ranges.length === 0 ? 'Closed' : ranges.map(([s, e]) => (s === 0 && e >= 1440 ? 'Open 24 hours' : `${clock(s)} – ${clock(e)}`)).join(', '),
  }));
}
