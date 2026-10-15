import { create } from 'zustand';

import type { LngLat } from '@/lib/geo';
import { getRoutes, type Place, type Route } from '@/lib/places';

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
      const routes = await getRoutes(from, place.coord, ctrl.signal);
      if (!ctrl.signal.aborted) set({ routes, loading: false });
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
