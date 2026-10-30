// Performance numbers for a car, from three places, best first:
//  - the EPA Test Car List (public/specs, see scripts/car-power): official rated horsepower and test
//    weight for every engine of every model since 2009,
//  - car-performance.ts: hand-checked torque, 0–60 and top speed for popular and enthusiast cars,
//  - an estimate of 0–60 from power and weight, marked as such (within ~0.3 s on the known figures).
import { lookupPerformance, lookupTopSpeed } from '@/lib/car-performance';
import { cleanModel } from '@/lib/car-photos';

/** year, model, displacement (L), cylinders, rated hp, test weight (lb), all-wheel drive (0/1) */
export type PowerRow = [number, string, number | null, number | null, number, number | null, number];
export type Engine = { displ?: number; cyl?: number };
export type CarFacts = { hp?: number; torque?: number; zeroToSixty?: number; topSpeedMph?: number; estimated?: 'zeroToSixty'[] };

const flat = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

export function makeSlug(make: string): string {
  return make.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

/** "5.0L V8", "2.3L turbo 4-cyl" → { displ, cyl }. */
export function engineFromLabel(label: string | undefined): Engine | undefined {
  if (!label) return undefined;
  const displ = /(\d+(?:\.\d+)?)\s*L\b/i.exec(label);
  const cyl = /\b[VIHFWL]-?(\d{1,2})\b/i.exec(label) ?? /\b(\d{1,2})[- ]?cyl/i.exec(label);
  if (!displ && !cyl) return undefined;
  return { displ: displ ? Number(displ[1]) : undefined, cyl: cyl ? Number(cyl[1]) : undefined };
}

/**
 * The EPA row for this car. The model's first word must match; any more words ("GT3 RS") make a
 * better match, and extra words in the EPA's name ("Mach-E") a worse one. Without an engine to go
 * on, it takes the lowest output of the closest name: that's the base car.
 */
export function matchPower(rows: PowerRow[], model: string, year: number | null, engine?: Engine): PowerRow | null {
  const words = cleanModel(model).map(flat).filter(Boolean);
  if (!words.length || year == null) return null;
  for (const y of [year, year - 1, year + 1]) {
    let named = rows.filter((r) => r[0] === y && flat(r[1]).includes(words[0]));
    if (!named.length) continue;
    const score = (r: PowerRow) => words.slice(1).filter((w) => flat(r[1]).includes(w)).length * 100 - flat(r[1]).length;
    if (engine?.displ != null || engine?.cyl != null) {
      const same = named.filter((r) => (engine.displ == null || (r[2] != null && Math.abs(r[2] - engine.displ) <= 0.15)) && (engine.cyl == null || r[3] === engine.cyl));
      if (same.length) named = same;
    }
    const top = Math.max(...named.map(score));
    // Names that differ only by "2WD"/"4WD" or a door count are the same car.
    const closest = named.filter((r) => score(r) >= top - 4);
    return closest.reduce((a, b) => (b[4] < a[4] ? b : a));
  }
  return null;
}

/** 0–60 from power and weight, fitted to the known figures in car-performance.ts. */
export function estimateZeroToSixty(hp: number, weightLb: number, awd: boolean): number {
  const t = Math.exp(-0.5615 + 0.8729 * Math.log(weightLb / hp) - (awd ? 0.0713 : 0));
  return Math.round(t * 10) / 10;
}

/** Combines the sources. Published torque and 0–60 only count if they're for this engine's power. */
export function combineFacts(row: PowerRow | null, make: string, model: string, year: number | null, engine?: Engine): CarFacts {
  const known = lookupPerformance(make, model, year, engine);
  const out: CarFacts = {};
  const hp = row?.[4] ?? known?.hp;
  if (hp) out.hp = hp;
  const sameCar = known && (!row || known.hp == null || Math.abs(known.hp - row[4]) <= row[4] * 0.12);
  if (sameCar && known.torque) out.torque = known.torque;
  if (sameCar && known.zeroToSixty) out.zeroToSixty = known.zeroToSixty;
  if (!out.zeroToSixty && row?.[5]) {
    out.zeroToSixty = estimateZeroToSixty(row[4], row[5], Boolean(row[6]));
    out.estimated = ['zeroToSixty'];
  }
  if (sameCar || !known) {
    const top = lookupTopSpeed(make, model);
    if (top) out.topSpeedMph = top;
  }
  return out;
}
