import { afterEach, describe, expect, it, vi } from 'vitest';

import { rerouteWaitMs, shouldReroute } from '@/lib/navigation';
import { createGeocoder, placeFromPhoton, type GeocodingProvider } from '@/services/geocoding';

import { getJson } from './http';
import { osrmProvider, plansFromOsrm } from './osrm';
import { createRouter } from './router';
import { RoutingError, routingErrorKind, type RoutePlan, type RoutingProvider } from './types';
import { valhallaProvider } from './valhalla';

const A: [number, number] = [-122.4, 37.77];
const B: [number, number] = [-122.27, 37.8];

const okBody = {
  code: 'Ok',
  routes: [
    {
      distance: 1000,
      duration: 90,
      geometry: { coordinates: [A, B] },
      legs: [
        { steps: [{ distance: 600, duration: 50, name: 'Bay St', maneuver: { type: 'depart', location: A } }] },
        { steps: [{ distance: 400, duration: 40, name: '', maneuver: { type: 'arrive', location: B } }] },
      ],
    },
  ],
};

function stubFetch(impl: (url: string, init?: RequestInit) => Promise<unknown>) {
  const spy = vi.fn(impl);
  vi.stubGlobal('fetch', spy);
  return spy;
}
const json = (body: unknown, status = 200) => Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) });

afterEach(() => vi.unstubAllGlobals());

describe('reading a router answer', () => {
  it('joins the steps of every leg into one list', () => {
    const [plan] = plansFromOsrm(okBody, 'osrm');
    expect(plan.steps.map((s) => s.maneuver.type)).toEqual(['depart', 'arrive']);
    expect(plan).toMatchObject({ distanceM: 1000, durationS: 90, provider: 'osrm' });
  });

  it('tells "no way to drive there" apart from a broken answer', () => {
    expect(() => plansFromOsrm({ code: 'NoRoute' }, 'osrm')).toThrowError(expect.objectContaining({ kind: 'no-route' }));
    expect(() => plansFromOsrm({ code: 'InvalidQuery' }, 'osrm')).toThrowError(expect.objectContaining({ kind: 'unavailable' }));
    expect(() => plansFromOsrm({ code: 'Ok', routes: [] }, 'osrm')).toThrowError(expect.objectContaining({ kind: 'unavailable' }));
  });
});

describe('providers', () => {
  it('OSRM asks for alternatives only on a route without stops', async () => {
    const spy = stubFetch(() => json(okBody));
    const osrm = osrmProvider('https://osrm.test');
    await osrm.route({ from: A, to: B, preference: 'fastest', alternatives: 3 });
    await osrm.route({ from: A, to: B, via: [[-122.3, 37.78]], preference: 'fastest', alternatives: 3 });
    expect(spy.mock.calls[0][0]).toContain('alternatives=3');
    expect(spy.mock.calls[1][0]).not.toContain('alternatives');
    expect(spy.mock.calls[1][0]).toContain('-122.4,37.77;-122.3,37.78;-122.27,37.8');
  });

  it('Valhalla turns a preference into its own costing options', async () => {
    const spy = stubFetch(() => json(okBody));
    const valhalla = valhallaProvider('https://valhalla.test');
    await valhalla.route({ from: A, to: B, preference: 'no-highways' });
    await valhalla.route({ from: A, to: B, preference: 'shortest' });
    const sent = (i: number) => JSON.parse(decodeURIComponent(String(spy.mock.calls[i][0]).split('json=')[1]));
    expect(sent(0).costing_options.auto).toEqual({ use_highways: 0 });
    expect(sent(1).costing_options.auto).toEqual({ shortest: true });
  });
});

describe('getJson', () => {
  it('reports a server error as unavailable', async () => {
    stubFetch(() => json({}, 503));
    await expect(getJson('https://x.test')).rejects.toMatchObject({ kind: 'unavailable' });
  });

  it('reports a dropped connection as offline when the device says so', async () => {
    stubFetch(() => Promise.reject(new TypeError('Failed to fetch')));
    vi.stubGlobal('navigator', { onLine: false });
    await expect(getJson('https://x.test')).rejects.toMatchObject({ kind: 'offline' });
  });

  it('gives up on a server that never answers', async () => {
    stubFetch((_url, init) => new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('aborted')))));
    await expect(getJson('https://x.test', undefined, 20)).rejects.toMatchObject({ kind: 'unavailable' });
  });

  it('reports a cancel as a cancel, not a failure', async () => {
    const ctrl = new AbortController();
    stubFetch((_url, init) => new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('aborted')))));
    const pending = getJson('https://x.test', ctrl.signal);
    ctrl.abort();
    await expect(pending).rejects.toMatchObject({ kind: 'aborted' });
  });
});

describe('router', () => {
  const plan: RoutePlan = { distanceM: 1, durationS: 1, geometry: [A, B], steps: [], provider: 'second' };
  const provider = (name: string, supports: RoutingProvider['supports'], route: RoutingProvider['route']): RoutingProvider => ({ name, supports, route });

  it('uses the next provider when the first is down', async () => {
    const first = vi.fn(() => Promise.reject(new RoutingError('unavailable')));
    const router = createRouter([provider('first', ['fastest'], first), provider('second', ['fastest'], () => Promise.resolve([plan]))]);
    await expect(router.route({ from: A, to: B, preference: 'fastest' })).resolves.toEqual([plan]);
    expect(first).toHaveBeenCalledOnce();
  });

  it("doesn't ask a second provider when there is no route or no connection", async () => {
    for (const kind of ['no-route', 'offline', 'aborted'] as const) {
      const second = vi.fn(() => Promise.resolve([plan]));
      const router = createRouter([provider('first', ['fastest'], () => Promise.reject(new RoutingError(kind))), provider('second', ['fastest'], second)]);
      await expect(router.route({ from: A, to: B, preference: 'fastest' })).rejects.toMatchObject({ kind });
      expect(second).not.toHaveBeenCalled();
    }
  });

  it('only asks providers that support the preference', async () => {
    const fastOnly = vi.fn(() => Promise.resolve([plan]));
    const router = createRouter([provider('first', ['fastest'], fastOnly), provider('second', ['shortest'], () => Promise.resolve([plan]))]);
    await router.route({ from: A, to: B, preference: 'shortest' });
    expect(fastOnly).not.toHaveBeenCalled();
    await expect(createRouter([]).route({ from: A, to: B, preference: 'fastest' })).rejects.toMatchObject({ kind: 'unavailable' });
  });

  it('treats anything unexpected as the service being unavailable', () => {
    expect(routingErrorKind(new Error('boom'))).toBe('unavailable');
    expect(routingErrorKind(new RoutingError('offline'))).toBe('offline');
  });
});

describe('search', () => {
  const place = { id: 'N1', name: 'Shell', detail: '', coord: A };

  it('remembers an answer and forgets it after ten minutes', async () => {
    let now = 0;
    const search = vi.fn(() => Promise.resolve([place]));
    const geocoder = createGeocoder({ name: 'fake', search } satisfies GeocodingProvider, () => now);
    await geocoder.search('Shell ', A);
    await geocoder.search('shell', A);
    expect(search).toHaveBeenCalledOnce();
    now = 11 * 60_000;
    await geocoder.search('shell', A);
    expect(search).toHaveBeenCalledTimes(2);
  });

  it('asks again from somewhere else, and never remembers a failure', async () => {
    const search = vi.fn<GeocodingProvider['search']>(() => Promise.resolve([place]));
    const geocoder = createGeocoder({ name: 'fake', search });
    await geocoder.search('shell', A);
    await geocoder.search('shell', [-121.5, 38.5]);
    expect(search).toHaveBeenCalledTimes(2);
    search.mockRejectedValueOnce(new RoutingError('unavailable'));
    await expect(geocoder.search('chevron', A)).rejects.toMatchObject({ kind: 'unavailable' });
    await geocoder.search('chevron', A);
    expect(search).toHaveBeenCalledTimes(4);
  });

  it('skips the server for a query too short to mean anything', async () => {
    const search = vi.fn(() => Promise.resolve([place]));
    expect(await createGeocoder({ name: 'fake', search }).search('sh')).toEqual([]);
    expect(search).not.toHaveBeenCalled();
  });

  it('names a place from what the map knows about it', () => {
    const p = placeFromPhoton({ geometry: { coordinates: A }, properties: { osm_id: 5, osm_type: 'N', osm_key: 'amenity', osm_value: 'fuel', name: 'Shell', housenumber: '12', street: 'Bay St', city: 'Oakland', state: 'CA', country: 'USA' } });
    expect(p).toMatchObject({ id: 'N5', name: 'Shell', detail: '12 Bay St, Oakland, CA, USA', category: 'Fuel' });
    expect(placeFromPhoton({ geometry: { coordinates: A }, properties: { osm_id: 6, osm_type: 'W', housenumber: '12', street: 'Bay St', city: 'Oakland' } }).name).toBe('12 Bay St');
  });
});

describe('when to ask for a new route', () => {
  it('waits longer after each failure, up to a minute', () => {
    expect([0, 1, 2, 3, 9].map(rerouteWaitMs)).toEqual([10_000, 20_000, 40_000, 60_000, 60_000]);
  });

  it('needs three fixes off the route and the wait to have passed', () => {
    expect(shouldReroute(2, 60_000, 0)).toBe(false);
    expect(shouldReroute(3, 5_000, 0)).toBe(false);
    expect(shouldReroute(3, 11_000, 0)).toBe(true);
    expect(shouldReroute(5, 11_000, 1)).toBe(false);
  });
});
