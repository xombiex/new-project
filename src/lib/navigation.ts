import { haversine, type LngLat, type Units } from '@/lib/geo';
import { capitalize, instructionFor, maneuverIcon, spokenDistance, type OsrmStep } from '@/lib/instructions';

/** One painted lane at a maneuver: its arrows, and whether it leads where you're going. */
export type Lane = { indications: string[]; valid: boolean };

export type NavStep = {
  text: string;
  icon: string;
  type: string;
  name: string;
  location: LngLat;
  /** meters along the route where this maneuver happens */
  along: number;
  /** turn lanes at this maneuver, left to right (only where OpenStreetMap has them) */
  lanes?: Lane[];
  modifier?: string;
};

/** Rotation for a lane arrow drawn as an up arrow (degrees, clockwise). */
const LANE_ANGLE: Record<string, number> = {
  'sharp left': -135,
  left: -90,
  'slight left': -45,
  straight: 0,
  none: 0,
  'slight right': 45,
  right: 90,
  'sharp right': 135,
};

/**
 * Which arrow to draw for a lane: the one matching your maneuver if the lane is valid, otherwise
 * its first arrow. Returns null for u-turn lanes (drawn with their own icon).
 */
export function laneArrow(lane: Lane, modifier?: string): { angle: number; uturn: boolean } {
  const pick = (lane.valid && modifier && lane.indications.find((i) => i === modifier)) || (lane.valid && lane.indications.find((i) => i !== 'none' && i !== 'uturn')) || lane.indications[0] || 'straight';
  return { angle: LANE_ANGLE[pick] ?? 0, uturn: pick === 'uturn' };
}

function lanesOf(s: OsrmStep): Lane[] | undefined {
  const lanes = s.intersections?.[0]?.lanes;
  // A single lane, or lanes with no arrows painted, tell the driver nothing.
  if (!lanes || lanes.length < 2 || lanes.every((l) => l.indications.every((i) => i === 'none'))) return undefined;
  if (lanes.every((l) => l.valid)) return undefined;
  return lanes.map((l) => ({ indications: l.indications, valid: l.valid }));
}

export type NavRoute = {
  geometry: LngLat[];
  /** cumulative meters along `geometry` at each vertex */
  cumulative: number[];
  steps: NavStep[];
  totalM: number;
  totalS: number;
};

const EARTH = 6_371_008.8;
const rad = (d: number) => (d * Math.PI) / 180;

/** Nearest point on segment a→b to p, using a local flat projection around p. */
function projectOnSegment(p: LngLat, a: LngLat, b: LngLat): { t: number; dist: number } {
  const k = Math.cos(rad(p[1]));
  const ax = (a[0] - p[0]) * k;
  const ay = a[1] - p[1];
  const bx = (b[0] - p[0]) * k;
  const by = b[1] - p[1];
  const dx = bx - ax;
  const dy = by - ay;
  const len = dx * dx + dy * dy;
  const t = len === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len));
  const x = ax + t * dx;
  const y = ay + t * dy;
  return { t, dist: rad(Math.hypot(x, y)) * EARTH };
}

export type Snap = { segment: number; along: number; offsetM: number };

/**
 * Snap a position to the route. Searches forward from the last known segment first so
 * routes that double back on themselves don't make progress jump backwards.
 */
export function snap(route: Pick<NavRoute, 'geometry' | 'cumulative'>, p: LngLat, fromSegment = 0): Snap {
  const { geometry: g, cumulative: c } = route;
  const search = (from: number, to: number): Snap => {
    let best: Snap = { segment: from, along: c[from] ?? 0, offsetM: Infinity };
    for (let i = from; i < Math.min(to, g.length - 1); i++) {
      const { t, dist } = projectOnSegment(p, g[i], g[i + 1]);
      if (dist < best.offsetM) best = { segment: i, along: c[i] + t * (c[i + 1] - c[i]), offsetM: dist };
    }
    return best;
  };
  const near = search(Math.max(0, fromSegment - 3), fromSegment + 150);
  return near.offsetM <= 60 ? near : (() => {
    const all = search(0, g.length);
    return all.offsetM < near.offsetM ? all : near;
  })();
}

export function buildNavRoute(geometry: LngLat[], osrmSteps: OsrmStep[], durationS: number): NavRoute {
  const cumulative = [0];
  for (let i = 1; i < geometry.length; i++) cumulative.push(cumulative[i - 1] + haversine(geometry[i - 1], geometry[i]));
  const route = { geometry, cumulative };
  let seg = 0;
  const steps = osrmSteps.map((s) => {
    const snapped = snap(route, s.maneuver.location, seg);
    seg = snapped.segment;
    return {
      text: capitalize(instructionFor(s)),
      icon: maneuverIcon(s.maneuver.type, s.maneuver.modifier),
      type: s.maneuver.type,
      name: s.name || s.ref || '',
      location: s.maneuver.location,
      along: snapped.along,
      modifier: s.maneuver.modifier,
      lanes: lanesOf(s),
    };
  });
  return { geometry, cumulative, steps, totalM: cumulative.at(-1) ?? 0, totalS: durationS };
}

export type NavProgress = {
  snap: Snap;
  /** index into steps of the next maneuver */
  next: number;
  toNextM: number;
  remainingM: number;
  remainingS: number;
  arrived: boolean;
};

/** Within this distance of the end counts as arrived. */
export const ARRIVE_M = 30;

export function progress(route: NavRoute, p: LngLat, lastSegment: number): NavProgress {
  const s = snap(route, p, lastSegment);
  // Next maneuver = first one still ahead (5 m slack so we don't flip early).
  let next = route.steps.findIndex((st, i) => i > 0 && st.along > s.along + 5);
  if (next === -1) next = route.steps.length - 1;
  const remainingM = Math.max(0, route.totalM - s.along);
  return {
    snap: s,
    next,
    toNextM: Math.max(0, route.steps[next].along - s.along),
    remainingM,
    remainingS: route.totalM > 0 ? (route.totalS * remainingM) / route.totalM : 0,
    arrived: remainingM <= ARRIVE_M || haversine(p, route.geometry.at(-1)!) <= ARRIVE_M,
  };
}

/**
 * Prompt distances scale with speed: on the highway you hear about an exit a mile out,
 * in town a few hundred feet out. Returns the tiers in meters, far → now.
 */
export function promptTiers(speedMps: number): { far: number; prepare: number; now: number } {
  const now = Math.max(30, speedMps * 4);
  if (speedMps > 22) return { far: 3200, prepare: 800, now };
  if (speedMps > 13) return { far: 1600, prepare: 400, now };
  return { far: 800, prepare: 150, now };
}

export type Announcement = { key: string; text: string };

/**
 * Decides what (if anything) to say now. `spoken` holds keys already announced so each
 * tier is said at most once per maneuver; skipped tiers are marked so they aren't said late.
 */
export function announce(
  route: NavRoute,
  prog: NavProgress,
  speedMps: number,
  units: Units,
  spoken: Set<string>
): Announcement | null {
  if (prog.arrived) {
    const key = 'arrived';
    return spoken.has(key) ? null : { key, text: 'You have arrived at your destination.' };
  }
  const step = route.steps[prog.next];
  const tiers = promptTiers(speedMps);
  const d = prog.toNextM;
  const k = (tier: string) => `${prog.next}:${tier}`;

  if (d <= tiers.now) {
    if (spoken.has(k('now'))) return null;
    spoken.add(k('prepare'));
    spoken.add(k('far'));
    return { key: k('now'), text: `${step.text}.` };
  }
  if (d <= tiers.prepare * 1.2) {
    if (spoken.has(k('prepare'))) return null;
    spoken.add(k('far'));
    return { key: k('prepare'), text: `In ${spokenDistance(units, d)}, ${step.text.charAt(0).toLowerCase()}${step.text.slice(1)}.` };
  }
  if (d <= tiers.far * 1.1 && d > tiers.prepare * 2) {
    if (spoken.has(k('far'))) return null;
    return { key: k('far'), text: `In ${spokenDistance(units, d)}, ${step.text.charAt(0).toLowerCase()}${step.text.slice(1)}.` };
  }
  return null;
}

/** Consecutive off-route fixes needed before rerouting (filters single bad fixes). */
export const OFF_ROUTE_FIXES = 3;

export function isOffRoute(offsetM: number, accuracyM: number | null): boolean {
  return offsetM > Math.max(45, (accuracyM ?? 10) * 1.5);
}
