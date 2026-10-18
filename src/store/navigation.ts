import * as Speech from 'expo-speech';
import { create } from 'zustand';

import { addReason, onLocation, removeReason } from '@/lib/location';
import {
  announce,
  buildNavRoute,
  isOffRoute,
  OFF_ROUTE_FIXES,
  progress,
  type NavProgress,
  type NavRoute,
} from '@/lib/navigation';
import { routeFor, type Place, type Route, type RouteMode } from '@/lib/places';
import type { LocationSample } from '@/lib/trip-recorder';
import { useNav } from '@/store/nav';
import { useSettings } from '@/store/settings';

type NavState = {
  active: boolean;
  route: NavRoute | null;
  destination: Place | null;
  progress: NavProgress | null;
  muted: boolean;
  rerouting: boolean;
  start: (route: Route, destination: Place) => Promise<void>;
  stop: () => Promise<void>;
  /** Change to another route mid-drive (keeps the trip and destination). */
  switchRoute: (route: Route) => void;
  toggleMute: () => void;
};

const REROUTE_COOLDOWN_MS = 10_000;
/** Navigation ends itself this long after arrival. */
const AUTO_END_MS = 30_000;

let spoken = new Set<string>();
let offRouteFixes = 0;
let lastReroute = 0;
let stopListening: (() => void) | null = null;
let endTimer: ReturnType<typeof setTimeout> | null = null;
/** The kind of route picked (fastest / shortest / no highways), kept when rerouting. */
let mode: RouteMode = 'fastest';

function say(text: string) {
  if (useNavigation.getState().muted) return;
  Speech.stop();
  Speech.speak(text, { language: 'en-US', rate: 1.0 });
}

export const useNavigation = create<NavState>()((set, get) => {
  async function reroute(from: LocationSample) {
    const dest = get().destination;
    if (!dest || get().rerouting) return;
    lastReroute = Date.now();
    set({ rerouting: true });
    say('Rerouting.');
    try {
      const best = await routeFor(mode, [from.lng, from.lat], dest.coord);
      if (best && get().active) {
        spoken = new Set();
        offRouteFixes = 0;
        set({ route: buildNavRoute(best.geometry, best.steps, best.durationS), progress: null });
      }
    } catch (e) {
      console.warn('Reroute failed', e);
    } finally {
      set({ rerouting: false });
    }
  }

  function onSample(sample: LocationSample) {
    const { route, progress: prev } = get();
    if (!route) return;
    const prog = progress(route, [sample.lng, sample.lat], prev?.snap.segment ?? 0);

    if (!prog.arrived && isOffRoute(prog.snap.offsetM, sample.accuracy)) {
      offRouteFixes++;
      if (offRouteFixes >= OFF_ROUTE_FIXES && Date.now() - lastReroute > REROUTE_COOLDOWN_MS) void reroute(sample);
      return; // keep showing the last good progress while off route
    }
    offRouteFixes = 0;
    set({ progress: prog });

    const speed = sample.speed != null && sample.speed >= 0 ? sample.speed : 0;
    const a = announce(route, prog, speed, useSettings.getState().units, spoken);
    if (a) {
      spoken.add(a.key);
      say(a.text);
    }
    if (prog.arrived && !endTimer) endTimer = setTimeout(() => void get().stop(), AUTO_END_MS);
  }

  return {
    active: false,
    route: null,
    destination: null,
    progress: null,
    muted: false,
    rerouting: false,

    start: async (route, destination) => {
      await get().stop();
      spoken = new Set();
      offRouteFixes = 0;
      mode = route.mode ?? 'fastest';
      const nav = buildNavRoute(route.geometry, route.steps, route.durationS);
      set({ active: true, route: nav, destination, progress: null });
      stopListening = onLocation((samples) => onSample(samples[samples.length - 1]));
      await addReason('nav');
      const first = nav.steps[1];
      say(`Starting route to ${destination.name}.${first ? ` ${nav.steps[0].text}, then ${first.text.charAt(0).toLowerCase()}${first.text.slice(1)}.` : ''}`);
    },

    stop: async () => {
      stopListening?.();
      stopListening = null;
      if (endTimer) clearTimeout(endTimer);
      endTimer = null;
      Speech.stop();
      if (get().active) await removeReason('nav');
      set({ active: false, route: null, destination: null, progress: null, rerouting: false });
      // Done (ended, arrived, or the trip finished): drop the planned route too, or its line and
      // place card would pop straight back onto the map.
      useNav.getState().clear();
    },

    switchRoute: (route) => {
      if (!get().active) return;
      mode = route.mode ?? 'fastest';
      spoken = new Set();
      offRouteFixes = 0;
      lastReroute = Date.now();
      set({ route: buildNavRoute(route.geometry, route.steps, route.durationS), progress: null, rerouting: false });
      say('Route changed.');
    },

    toggleMute: () => {
      const muted = !get().muted;
      if (muted) Speech.stop();
      set({ muted });
    },
  };
});
