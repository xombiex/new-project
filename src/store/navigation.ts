import * as Speech from 'expo-speech';
import { create } from 'zustand';

import { haptic } from '@/lib/haptics';
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
import { haversine } from '@/lib/geo';
import { routeFor, routeVia, type Place, type Route, type RouteMode } from '@/lib/places';
import { SITE_URL } from '@/lib/site';
import { supabase } from '@/lib/supabase';
import type { LocationSample } from '@/lib/trip-recorder';
import { useNav } from '@/store/nav';
import { useSettings } from '@/store/settings';
import { useTrips } from '@/store/trips';

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
  /** A stop on the way (a gas station), until you reach it. */
  via: { name: string; coord: [number, number] } | null;
  /** Stop somewhere on the way, then carry on to the destination. Returns an error, or null. */
  addStop: (stop: { name: string; coord: [number, number] }, from: [number, number]) => Promise<string | null>;
  removeStop: (from: [number, number]) => Promise<void>;
  /** Live "Share my ETA" link for this drive, once started. */
  shareUrl: string | null;
  /** Start sharing (or reuse the current link). Returns the link, or an error. */
  shareEta: () => Promise<{ url: string } | { error: string }>;
  toggleMute: () => void;
};

const REROUTE_COOLDOWN_MS = 10_000;
/** How often a shared ETA gets your new position. */
const SHARE_EVERY_MS = 10_000;
let shareToken: string | null = null;
let lastShareAt = 0;

/** Push position + arrival time to the shared ETA link (best effort). */
function pushShare(sample: LocationSample, remainingS: number) {
  if (!shareToken || Date.now() - lastShareAt < SHARE_EVERY_MS) return;
  lastShareAt = Date.now();
  void supabase.rpc('update_eta_share', {
    p_token: shareToken,
    p_lat: sample.lat,
    p_lng: sample.lng,
    p_heading: sample.heading,
    p_speed: sample.speed,
    p_eta_at: new Date(Date.now() + remainingS * 1000).toISOString(),
  });
}

/** Within this distance of a stop counts as having made it. */
const VIA_REACHED_M = 60;
/** Navigation ends itself this long after arrival. */
const AUTO_END_MS = 30_000;

let spoken = new Set<string>();
/** Steps we've already buzzed for. */
let buzzed = new Set<number>();
/** Buzz this far before a turn. */
const BUZZ_M = 200;
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
      // Still on the way to a stop: keep it in the new route.
      const via = get().via;
      const best = via ? await routeVia([from.lng, from.lat], via.coord, dest.coord) : await routeFor(mode, [from.lng, from.lat], dest.coord);
      if (best && get().active) {
        spoken = new Set();
        buzzed = new Set();
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
    const via = get().via;
    if (via && haversine([sample.lng, sample.lat], via.coord) < VIA_REACHED_M) {
      set({ via: null });
      say(`You've reached ${via.name}.`);
    }

    if (!prog.arrived && isOffRoute(prog.snap.offsetM, sample.accuracy)) {
      offRouteFixes++;
      if (offRouteFixes >= OFF_ROUTE_FIXES && Date.now() - lastReroute > REROUTE_COOLDOWN_MS) void reroute(sample);
      return; // keep showing the last good progress while off route
    }
    offRouteFixes = 0;
    set({ progress: prog });
    pushShare(sample, prog.remainingS);

    const speed = sample.speed != null && sample.speed >= 0 ? sample.speed : 0;
    const step = route.steps[prog.next];
    if (!prog.arrived && prog.toNextM <= BUZZ_M && !buzzed.has(prog.next) && step && step.type !== 'arrive') {
      buzzed.add(prog.next);
      haptic.turn();
    }

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
    via: null,
    shareUrl: null,

    shareEta: async () => {
      const { route, destination, progress: prog } = get();
      if (!get().active || !route || !destination) return { error: 'Start navigating first' };
      if (get().shareUrl) return { url: get().shareUrl! };
      const s = useTrips.getState().lastSample;
      const remainingS = prog?.remainingS ?? route.totalS;
      const { data, error } = await supabase.rpc('start_eta_share', {
        p_dest_name: destination.name,
        p_dest_lat: destination.coord[1],
        p_dest_lng: destination.coord[0],
        p_lat: s?.lat ?? null,
        p_lng: s?.lng ?? null,
        p_eta_at: new Date(Date.now() + remainingS * 1000).toISOString(),
      });
      if (error) return { error: error.message.includes('not authenticated') ? 'Sign in to share your ETA' : error.message };
      shareToken = data as string;
      lastShareAt = Date.now();
      const url = `${SITE_URL}/eta/${shareToken}`;
      set({ shareUrl: url });
      return { url };
    },

    addStop: async (stop, from) => {
      const dest = get().destination;
      if (!get().active || !dest) return 'Not navigating';
      try {
        const route = await routeVia(from, stop.coord, dest.coord);
        if (!route || !get().active) return 'Couldn’t find a route through there';
        spoken = new Set();
        buzzed = new Set();
        offRouteFixes = 0;
        lastReroute = Date.now();
        set({ via: stop, route: buildNavRoute(route.geometry, route.steps, route.durationS), progress: null, rerouting: false });
        say(`Adding a stop at ${stop.name}.`);
        return null;
      } catch (e) {
        return e instanceof Error ? e.message : 'Routing failed';
      }
    },

    removeStop: async (from) => {
      const dest = get().destination;
      set({ via: null });
      if (!get().active || !dest) return;
      const best = await routeFor(mode, from, dest.coord).catch(() => undefined);
      if (best && get().active) set({ route: buildNavRoute(best.geometry, best.steps, best.durationS), progress: null });
    },

    start: async (route, destination) => {
      await get().stop();
      spoken = new Set();
      buzzed = new Set();
      offRouteFixes = 0;
      mode = route.mode ?? 'fastest';
      const nav = buildNavRoute(route.geometry, route.steps, route.durationS);
      set({ active: true, route: nav, destination, progress: null, via: null });
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
      // Close the shared ETA link: "arrived" if you got there, otherwise just ended.
      if (shareToken) {
        void supabase.rpc('end_eta_share', { p_token: shareToken, p_arrived: Boolean(get().progress?.arrived) });
        shareToken = null;
      }
      set({ active: false, route: null, destination: null, progress: null, rerouting: false, via: null, shareUrl: null });
      // Done (ended, arrived, or the trip finished): drop the planned route too, or its line and
      // place card would pop straight back onto the map.
      useNav.getState().clear();
    },

    switchRoute: (route) => {
      if (!get().active) return;
      mode = route.mode ?? 'fastest';
      spoken = new Set();
      buzzed = new Set();
      offRouteFixes = 0;
      lastReroute = Date.now();
      set({ route: buildNavRoute(route.geometry, route.steps, route.durationS), progress: null, rerouting: false, via: null });
      say('Route changed.');
    },

    toggleMute: () => {
      const muted = !get().muted;
      if (muted) Speech.stop();
      set({ muted });
    },
  };
});
