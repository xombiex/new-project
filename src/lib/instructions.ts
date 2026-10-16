import type { LngLat, Units } from '@/lib/geo';

/** Subset of an OSRM v5 RouteStep that we use. */
export type OsrmStep = {
  distance: number;
  duration: number;
  name: string;
  ref?: string;
  destinations?: string;
  exits?: string;
  maneuver: { type: string; modifier?: string; location: LngLat; exit?: number };
};

const ORDINAL = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth'];

function road(step: OsrmStep): string {
  return step.name || step.ref || '';
}

function side(modifier?: string): 'left' | 'right' | null {
  if (!modifier) return null;
  if (modifier.includes('left')) return 'left';
  if (modifier.includes('right')) return 'right';
  return null;
}

/**
 * Plain-English instruction for a step, phrased so it can follow "In 500 feet, ".
 * Covers the OSRM maneuver types; unknown types fall back to the modifier.
 */
export function instructionFor(step: OsrmStep): string {
  const { type, modifier, exit } = step.maneuver;
  const name = road(step);
  const onto = name ? ` onto ${name}` : '';
  const mod = modifier ?? 'straight';
  const toward = step.destinations ? ` toward ${step.destinations.split(',')[0].trim()}` : '';

  switch (type) {
    case 'depart':
      return name ? `head out on ${name}` : 'head out';
    case 'arrive': {
      const s = side(modifier);
      return s ? `your destination is on the ${s}` : 'you have arrived at your destination';
    }
    case 'roundabout':
    case 'rotary':
      return exit ? `at the roundabout, take the ${ORDINAL[exit - 1] ?? `${exit}th`} exit${onto}` : `enter the roundabout${onto}`;
    case 'exit roundabout':
    case 'exit rotary':
      return `exit the roundabout${onto}`;
    case 'merge':
      return `merge${side(modifier) ? ` ${side(modifier)}` : ''}${onto}`;
    case 'on ramp':
      return `take the ramp${side(modifier) ? ` on the ${side(modifier)}` : ''}${onto}${toward}`;
    case 'off ramp':
      return `take the exit${step.exits ? ` ${step.exits.split(';')[0]}` : ''}${side(modifier) ? ` on the ${side(modifier)}` : ''}${toward || onto}`;
    case 'fork':
      return `keep ${side(modifier) ?? 'straight'} at the fork${onto}${toward}`;
    case 'end of road':
      return `turn ${side(modifier) ?? mod} at the end of the road${onto}`;
    case 'new name':
    case 'continue':
      if (mod === 'uturn') return `make a U-turn${onto}`;
      return mod === 'straight' ? `continue straight${onto}` : `keep ${side(modifier) ?? 'straight'}${onto}`;
    default:
      // turn, notification, use lane, …
      if (mod === 'uturn') return `make a U-turn${onto}`;
      if (mod === 'straight') return `continue straight${onto}`;
      return `turn ${mod}${onto}`;
  }
}

export function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Distance phrased for speech: "500 feet", "a quarter mile", "2 kilometers". */
export function spokenDistance(units: Units, meters: number): string {
  if (units === 'imperial') {
    const feet = meters * 3.28084;
    if (feet < 1000) return `${Math.max(100, Math.round(feet / 100) * 100)} feet`;
    const miles = meters / 1609.344;
    if (miles < 0.375) return 'a quarter mile';
    if (miles < 0.625) return 'half a mile';
    if (miles < 0.875) return 'three quarters of a mile';
    const m = Math.round(miles);
    return m === 1 ? '1 mile' : `${m} miles`;
  }
  if (meters < 950) return `${Math.max(50, Math.round(meters / 50) * 50)} meters`;
  const km = Math.round(meters / 1000);
  return km === 1 ? '1 kilometer' : `${km} kilometers`;
}

/** MaterialCommunityIcons name for a maneuver banner. */
export function maneuverIcon(type: string, modifier?: string): string {
  if (type === 'arrive') return 'flag-checkered';
  if (type === 'depart') return 'navigation-variant';
  if (type === 'roundabout' || type === 'rotary' || type.startsWith('exit ')) return 'rotate-right';
  if (type === 'merge') return 'call-merge';
  if (type === 'fork') return modifier?.includes('left') ? 'arrow-top-left' : 'arrow-top-right';
  switch (modifier) {
    case 'uturn':
      return 'arrow-u-left-top';
    case 'sharp left':
    case 'left':
      return 'arrow-left-top';
    case 'sharp right':
    case 'right':
      return 'arrow-right-top';
    case 'slight left':
      return 'arrow-top-left';
    case 'slight right':
      return 'arrow-top-right';
    default:
      return 'arrow-up';
  }
}
