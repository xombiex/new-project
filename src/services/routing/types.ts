import type { LngLat } from '@/lib/geo';

/**
 * One maneuver on a route, as the rest of the app sees it. Every provider turns its own answer
 * into this, so navigation, voice prompts and the map never know which router was asked.
 */
export type RouteStep = {
  /** metres covered by this step */
  distance: number;
  /** seconds this step takes */
  duration: number;
  /** road name, empty when unnamed */
  name: string;
  /** road number, e.g. "I-80" */
  ref?: string;
  /** what the signs say, e.g. "San Francisco" */
  destinations?: string;
  /** exit number or name on a ramp */
  exits?: string;
  maneuver: { type: string; modifier?: string; location: LngLat; exit?: number };
  /** intersections along the step; the first is the maneuver itself, with its turn lanes when mapped */
  intersections?: { lanes?: { valid: boolean; indications: string[] }[] }[];
};

/** A route as a provider returns it: the line, how long, and the maneuvers. */
export type RoutePlan = {
  distanceM: number;
  durationS: number;
  geometry: LngLat[];
  steps: RouteStep[];
  /** which provider answered, for logs and attribution */
  provider: string;
};

/** What a driver can ask a router to optimise for. Not every provider supports every one. */
export type RoutePreference = 'fastest' | 'shortest' | 'no-highways';

export type RouteRequest = {
  from: LngLat;
  to: LngLat;
  /** places to pass through, in order */
  via?: LngLat[];
  preference: RoutePreference;
  /** how many extra routes to ask for, when the provider can offer them */
  alternatives?: number;
  signal?: AbortSignal;
};

export interface RoutingProvider {
  readonly name: string;
  readonly supports: readonly RoutePreference[];
  /** Best route first. Throws a RoutingError when it can't answer. */
  route(request: RouteRequest): Promise<RoutePlan[]>;
}

export type RoutingErrorKind =
  /** this device has no connection */
  | 'offline'
  /** the provider didn't answer, or answered with a server error */
  | 'unavailable'
  /** the provider answered: there is no way to drive between those places */
  | 'no-route'
  /** the caller cancelled */
  | 'aborted';

const MESSAGE: Record<RoutingErrorKind, string> = {
  offline: "You're offline. Routes need a connection.",
  unavailable: "The route service isn't answering. Try again in a moment.",
  'no-route': 'No driving route found',
  aborted: 'Cancelled',
};

export class RoutingError extends Error {
  readonly kind: RoutingErrorKind;
  constructor(kind: RoutingErrorKind, detail?: string) {
    super(MESSAGE[kind]);
    this.name = 'RoutingError';
    this.kind = kind;
    if (detail) this.cause = detail;
  }
}

/** The kind of a routing or search failure, whatever was thrown. */
export function routingErrorKind(e: unknown): RoutingErrorKind {
  return e instanceof RoutingError ? e.kind : 'unavailable';
}
