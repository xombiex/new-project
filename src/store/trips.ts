import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { simplifyPath, type LngLat } from '@/lib/geo';
import { supabase } from '@/lib/supabase';
import { addSample, startTrip, type LocationSample, type TripState } from '@/lib/trip-recorder';

export type SavedTrip = {
  id: string;
  name: string | null;
  notes: string | null;
  startedAt: number;
  endedAt: number;
  distanceM: number;
  movingS: number;
  maxSpeedMps: number;
  path: LngLat[];
  /** true once uploaded to the user's cloud history */
  synced: boolean;
};

type TripsState = {
  /** Trip currently being recorded, if any. */
  active: TripState | null;
  /** true when the active trip was started by drive detection (so it may also end itself) */
  activeAuto: boolean;
  /** Latest fix regardless of recording, for the speedometer. */
  lastSample: LocationSample | null;
  history: SavedTrip[];
  ingest: (samples: LocationSample[]) => void;
  start: (auto?: boolean) => void;
  finish: () => SavedTrip | null;
  discard: () => void;
  rename: (id: string, name: string, notes?: string | null) => void;
  remove: (id: string) => void;
  syncPending: () => Promise<void>;
};

/** Trips shorter than this are almost always accidental taps. */
const MIN_TRIP_M = 50;

export const useTrips = create<TripsState>()(
  persist(
    (set, get) => ({
      active: null,
      activeAuto: false,
      lastSample: null,
      history: [],

      ingest: (samples) => {
        if (samples.length === 0) return;
        const sorted = [...samples].sort((a, b) => a.timestamp - b.timestamp);
        const { active } = get();
        set({
          lastSample: sorted[sorted.length - 1],
          active: active ? sorted.reduce(addSample, active) : null,
        });
      },

      start: (auto = false) => set({ active: startTrip(Date.now()), activeAuto: auto }),

      finish: () => {
        const { active } = get();
        if (!active) return null;
        set({ active: null, activeAuto: false });
        if (active.distanceM < MIN_TRIP_M) return null;
        const trip: SavedTrip = {
          id: Crypto.randomUUID(),
          name: null,
          notes: null,
          startedAt: active.startedAt,
          endedAt: active.last?.timestamp ?? Date.now(),
          distanceM: active.distanceM,
          movingS: Math.round(active.movingS),
          maxSpeedMps: active.maxSpeedMps,
          path: simplifyPath(active.path),
          synced: false,
        };
        set({ history: [trip, ...get().history] });
        void get().syncPending();
        return trip;
      },

      discard: () => set({ active: null, activeAuto: false }),

      rename: (id, name, notes) => {
        set({
          history: get().history.map((t) =>
            t.id === id ? { ...t, name: name || null, notes: notes === undefined ? t.notes : notes, synced: false } : t
          ),
        });
        void get().syncPending();
      },

      remove: (id) => {
        const trip = get().history.find((t) => t.id === id);
        set({ history: get().history.filter((t) => t.id !== id) });
        if (trip?.synced) void supabase.from('trips').delete().eq('id', id);
      },

      /** Upload unsynced trips when signed in. Safe to call repeatedly; failures retry next time. */
      syncPending: async () => {
        const { data } = await supabase.auth.getSession();
        if (!data.session) return;
        const pending = get().history.filter((t) => !t.synced);
        if (pending.length === 0) return;
        const { error } = await supabase.from('trips').upsert(
          pending.map((t) => ({
            id: t.id,
            name: t.name,
            notes: t.notes,
            started_at: new Date(t.startedAt).toISOString(),
            ended_at: new Date(t.endedAt).toISOString(),
            distance_m: t.distanceM,
            moving_s: t.movingS,
            max_speed_mps: t.maxSpeedMps,
            path: t.path,
          }))
        );
        if (error) {
          console.warn('Trip sync failed', error.message);
          return;
        }
        const ids = new Set(pending.map((t) => t.id));
        set({ history: get().history.map((t) => (ids.has(t.id) ? { ...t, synced: true } : t)) });
      },
    }),
    {
      name: 'convoy-trips',
      storage: createJSONStorage(() => AsyncStorage),
      // The live sample is transient; the in-progress trip survives app restarts.
      partialize: ({ active, activeAuto, history }) => ({ active, activeAuto, history }),
    }
  )
);
