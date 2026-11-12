import type { LngLat } from '@/lib/geo';

import { getJson } from './http';
import { RoutingError, type RoutePlan, type RouteRequest, type RouteStep, type RoutingProvider } from './types';

/** The answer shape of OSRM's route service. Valhalla can be asked to answer in it too. */
export type OsrmResponse = {
  code: string;
  routes?: { distance: number; duration: number; geometry: { coordinates: LngLat[] }; legs: { steps: RouteStep[] }[] }[];
};

/** OSRM's steps already are the shape the app uses; this checks the answer and flattens the legs. */
export function plansFromOsrm(json: OsrmResponse, provider: string): RoutePlan[] {
  if (json.code === 'NoRoute' || json.code === 'NoSegment') throw new RoutingError('no-route');
  if (json.code !== 'Ok' || !json.routes?.length) throw new RoutingError('unavailable', json.code);
  return json.routes.map((r) => ({
    distanceM: r.distance,
    durationS: r.duration,
    geometry: r.geometry.coordinates,
    steps: r.legs.flatMap((l) => l.steps),
    provider,
  }));
}

/** OSRM: quick, and offers alternatives. It only knows the fastest way. */
export function osrmProvider(baseUrl: string): RoutingProvider {
  return {
    name: 'osrm',
    supports: ['fastest'],
    async route({ from, to, via = [], alternatives = 0, signal }: RouteRequest) {
      const coords = [from, ...via, to].map((c) => `${c[0]},${c[1]}`).join(';');
      // OSRM can't offer alternatives on a route with stops.
      const alt = alternatives > 0 && via.length === 0 ? `&alternatives=${alternatives}` : '';
      const json = await getJson<OsrmResponse>(`${baseUrl}/route/v1/driving/${coords}?overview=full&geometries=geojson&steps=true${alt}`, signal);
      return plansFromOsrm(json, 'osrm');
    },
  };
}
