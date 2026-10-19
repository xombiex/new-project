import { create } from 'zustand';

import type { LngLat } from '@/lib/geo';
import { camerasOnRoute, fetchCamerasInBox, routesBox } from '@/lib/cameras';
import { haversine } from '@/lib/geo';
import { getRouteOptions, sameRoute, type Place, type Route } from '@/lib/places';
import { useSettings } from '@/store/settings';

type NavState = {
  destination: Place | null;
  routes: Route[];
  selected: number;
  loading: boolean;
  error: string | null;
  planTo: (place: Place, from: LngLat) => Promise<void>;
  select: (index: number) => void;
  clear: () => void;
};

let inflight: AbortController | null = null;

/**
 * Recently planned routes, so picking the same place again (say, after ending navigation) is
 * instant instead of asking every router again. Reused only from about the same starting spot.
 */
const CACHE_MS = 5 * 60_000;
const CACHE_FROM_M = 150;
let recent: { placeId: string; from: LngLat; at: number; routes: Route[] }[] = [];

function cached(placeId: string, from: LngLat): Route[] | null {
  recent = recent.filter((r) => Date.now() - r.at < CACHE_MS);
  return recent.find((r) => r.placeId === placeId && haversine(r.from, from) < CACHE_FROM_M)?.routes ?? null;
}

function remember(placeId: string, from: LngLat, routes: Route[]) {
  recent = [{ placeId, from, at: Date.now(), routes }, ...recent.filter((r) => r.placeId !== placeId)].slice(0, 8);
}

export const useNav = create<NavState>()((set, get) => ({
  destination: null,
  routes: [],
  selected: 0,
  loading: false,
  error: null,

  planTo: async (place, from) => {
    inflight?.abort();
    const ctrl = new AbortController();
    inflight = ctrl;
    const hit = cached(place.id, from);
    if (hit) {
      set({ destination: place, routes: hit, selected: 0, loading: false, error: null });
      return;
    }
    set({ destination: place, routes: [], selected: 0, loading: true, error: null });
    /** Keep the route they picked selected when the list grows or reorders. */
    const keepSelection = (next: Route[]) => {
      const current = get().routes[get().selected];
      const i = current ? next.findIndex((r) => sameRoute(r, current)) : -1;
      return i >= 0 ? i : 0;
    };
    try {
      let routes = await getRouteOptions(from, place.coord, ctrl.signal, (fastest) => {
        // Draw the fastest route right away; the other kinds join in a moment.
        if (!ctrl.signal.aborted && get().routes.length === 0) set({ routes: fastest, selected: 0 });
      });
      if (ctrl.signal.aborted) return;
      set({ routes, selected: keepSelection(routes), loading: false });
      remember(place.id, from, routes);
      // Then count cameras along each option (best effort; routing works without it).
      const { showAlprCameras, avoidAlprCameras, speedCameraAlerts } = useSettings.getState();
      if (!showAlprCameras && !avoidAlprCameras && !speedCameraAlerts) return;
      const cams = await fetchCamerasInBox(routesBox(routes.map((r) => r.geometry)), ctrl.signal).catch(() => null);
      if (!cams || ctrl.signal.aborted) return;
      routes = routes.map((r) => ({ ...r, cameras: camerasOnRoute(r.geometry, cams) }));
      if (avoidAlprCameras) {
        // Fewest license-plate cameras first; among equals, the fastest. Order is shown to the user.
        routes = [...routes].sort((a, b) => a.cameras!.alpr - b.cameras!.alpr || a.durationS - b.durationS);
      }
      set({ routes, selected: keepSelection(routes) });
      remember(place.id, from, routes);
    } catch (e) {
      if (!ctrl.signal.aborted) set({ loading: false, error: e instanceof Error ? e.message : 'Routing failed' });
    }
  },

  select: (selected) => set({ selected }),

  clear: () => {
    inflight?.abort();
    set({ destination: null, routes: [], selected: 0, loading: false, error: null });
  },
}));
