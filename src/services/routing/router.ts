import { RoutingError, type RoutePlan, type RouteRequest, type RoutingProvider } from './types';

/**
 * Asks providers in order and returns the first answer. A provider that's down or hanging is
 * skipped; "no route" and "you're offline" are final, because the next provider would say the same.
 */
export function createRouter(providers: RoutingProvider[]) {
  return {
    providers,
    async route(request: RouteRequest): Promise<RoutePlan[]> {
      const able = providers.filter((p) => p.supports.includes(request.preference));
      if (able.length === 0) throw new RoutingError('unavailable', `no provider for ${request.preference}`);
      let last: unknown;
      for (const provider of able) {
        try {
          return await provider.route(request);
        } catch (e) {
          last = e;
          if (e instanceof RoutingError && e.kind !== 'unavailable') throw e;
        }
      }
      throw last instanceof RoutingError ? last : new RoutingError('unavailable');
    },
  };
}

export type Router = ReturnType<typeof createRouter>;
