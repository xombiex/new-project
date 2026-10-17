import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { type LngLat, simplifyIndices } from '@/lib/geo';
import { keepSpeedChanges } from '@/lib/speed-bands';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/store/auth';
import { useGarage } from '@/store/garage';
import { addSample, startTrip, type LocationSample, type TripState } from '@/lib/trip-recorder';

export type TripCar = { label: string; body: string; paint: string };

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
  /** m/s per path point; missing on drives recorded before speed coloring existed */
  speeds?: number[];
  /** seconds in each 10 km/h bucket (see lib/speed-bands) */
  speedHist?: number[];
  /** the garage car it was driven in, as it was named at the time */
  car?: TripCar | null;
  role?: 'driver' | 'passenger';
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
  setRole: (id: string, role: 'driver' | 'passenger') => void;
  pullFromCloud: () => Promise<void>;
};

/** Trips shorter than this are almost always accidental taps. */
const MIN_TRIP_M = 50;

/** Snapshot of the garage car on the map, so the trip remembers what it was driven in. */
function tripCar(): TripCar | null {
  const profile = useAuth.getState().profile;
  if (!profile) return null;
  const car = useGarage.getState().cars.find((c) => c.id === profile.primary_car_id);
  if (car) return { label: [car.year, car.make, car.model].filter(Boolean).join(' '), body: car.body, paint: car.paint };
  return null;
}

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
          // Simplify the route but keep each kept point's speed alongside it.
          ...(() => {
            const hasSpeeds = active.speeds?.length === active.path.length;
            const keep = hasSpeeds ? keepSpeedChanges(simplifyIndices(active.path), active.speeds) : simplifyIndices(active.path);
            return { path: keep.map((i) => active.path[i]), speeds: hasSpeeds ? keep.map((i) => Math.round(active.speeds[i] * 10) / 10) : undefined };
          })(),
          speedHist: active.speedHist?.map((s) => Math.round(s)),
          car: tripCar(),
          role: 'driver',
          synced: false,
        };
        set({ history: [trip, ...get().history] });
        void get().syncPending();
        return trip;
      },

      discard: () => set({ active: null, activeAuto: false }),

      setRole: (id, role) => {
        set({ history: get().history.map((t) => (t.id === id ? { ...t, role, synced: false } : t)) });
        void get().syncPending();
      },

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

      /** Merge the account's cloud history into this device (new devices, the web app). */
      pullFromCloud: async () => {
        const { data: auth } = await supabase.auth.getSession();
        if (!auth.session) return;
        const { data, error } = await supabase
          .from('trips')
          .select('id, name, notes, started_at, ended_at, distance_m, moving_s, max_speed_mps, path, speeds, speed_hist, car_label, car_body, car_paint, role')
          .eq('user_id', auth.session.user.id)
          .order('started_at', { ascending: false })
          .limit(1000);
        if (error || !data) {
          if (error) console.warn('Trip download failed', error.message);
          return;
        }
        const have = new Set(get().history.map((t) => t.id));
        const incoming: SavedTrip[] = data
          .filter((r) => !have.has(r.id))
          .map((r) => ({
            id: r.id,
            name: r.name,
            notes: r.notes,
            startedAt: Date.parse(r.started_at),
            endedAt: Date.parse(r.ended_at),
            distanceM: r.distance_m,
            movingS: r.moving_s,
            maxSpeedMps: r.max_speed_mps,
            path: r.path ?? [],
            speeds: r.speeds ?? undefined,
            speedHist: r.speed_hist ?? undefined,
            car: r.car_label ? { label: r.car_label, body: r.car_body ?? 'car', paint: r.car_paint ?? 'blue' } : null,
            role: r.role === 'passenger' ? 'passenger' : 'driver',
            synced: true,
          }));
        if (incoming.length) set({ history: [...get().history, ...incoming].sort((a, b) => b.startedAt - a.startedAt) });
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
            speeds: t.speeds ?? null,
            speed_hist: t.speedHist ?? null,
            car_label: t.car?.label ?? null,
            car_body: t.car?.body ?? null,
            car_paint: t.car?.paint ?? null,
            role: t.role ?? 'driver',
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
