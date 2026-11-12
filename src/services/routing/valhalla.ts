import { getJson } from './http';
import { plansFromOsrm, type OsrmResponse } from './osrm';
import type { RouteRequest, RoutingProvider } from './types';

/**
 * Valhalla: slower than OSRM, but it can find the shortest way and stay off highways. It is asked
 * to answer in OSRM's format, which is a detail of this file and nowhere else.
 */
export function valhallaProvider(baseUrl: string): RoutingProvider {
  return {
    name: 'valhalla',
    supports: ['fastest', 'shortest', 'no-highways'],
    async route({ from, to, via = [], preference, alternatives = 0, signal }: RouteRequest) {
      const auto = preference === 'shortest' ? { shortest: true } : preference === 'no-highways' ? { use_highways: 0 } : {};
      const body = {
        locations: [from, ...via, to].map((c) => ({ lon: c[0], lat: c[1] })),
        costing: 'auto',
        costing_options: { auto },
        ...(alternatives > 0 && via.length === 0 ? { alternates: alternatives } : {}),
        format: 'osrm',
        shape_format: 'geojson',
      };
      const json = await getJson<OsrmResponse>(`${baseUrl}/route?json=${encodeURIComponent(JSON.stringify(body))}`, signal);
      return plansFromOsrm(json, 'valhalla');
    },
  };
}
