import { create } from 'zustand';

import type { LngLat } from '@/lib/geo';
import { camerasOnRoute, fetchCamerasInBox, routesBox } from '@/lib/cameras';
import { getRoutes, type Place, type Route } from '@/lib/places';
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

export const useNav = create<NavState>()((set) => ({
  destination: null,
  routes: [],
  selected: 0,
  loading: false,
  error: null,

  planTo: async (place, from) => {
    inflight?.abort();
    const ctrl = new AbortController();
    inflight = ctrl;
    set({ destination: place, routes: [], selected: 0, loading: true, error: null });
    try {
      let routes = await getRoutes(from, place.coord, ctrl.signal);
      if (ctrl.signal.aborted) return;
      set({ routes, loading: false });
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
      set({ routes, selected: 0 });
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
