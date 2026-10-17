import { create } from 'zustand';

import { supabase } from '@/lib/supabase';
import type { Paint, Vehicle } from '@/lib/vehicles';
import { useAuth } from '@/store/auth';

export type Car = {
  id: string;
  user_id: string;
  make: string;
  model: string;
  year: number | null;
  nickname: string | null;
  body: Vehicle;
  paint: Paint;
  created_at: string;
};

export type CarInput = Pick<Car, 'make' | 'model' | 'year' | 'nickname' | 'body' | 'paint'>;

const COLS = 'id, user_id, make, model, year, nickname, body, paint, created_at';

/** Server rule messages → something a person can act on. */
function friendly(message: string): string {
  if (message.includes('garage full')) return 'Free garages hold 3 cars. Convoy Pro makes it unlimited.';
  if (message.includes('style pack')) return 'That body style is part of the Style Pack.';
  if (message.includes('violates check constraint')) return 'Make and model need 1–40 characters, and the year must be real.';
  return message;
}

type GarageState = {
  cars: Car[];
  loaded: boolean;
  load: () => Promise<void>;
  /** Create (no id) or update a car. Returns an error message, or null. */
  save: (input: CarInput, id?: string) => Promise<string | null>;
  remove: (id: string) => Promise<void>;
  /** Make this the car friends see on the map. */
  setPrimary: (car: Car) => Promise<string | null>;
  /** A friend's garage (read-only; RLS lets friends see each other's cars). */
  forUser: (userId: string) => Promise<Car[]>;
};

/** Mirror the main car onto the profile, which is what the map and friends read. */
async function syncProfile(car: Car): Promise<string | null> {
  const uid = useAuth.getState().session?.user.id;
  if (!uid) return 'Not signed in';
  const { error } = await supabase
    .from('profiles')
    .update({ vehicle: car.body, vehicle_color: car.paint, primary_car_id: car.id })
    .eq('id', uid);
  if (error) return friendly(error.message);
  await useAuth.getState().loadProfile();
  return null;
}

export const useGarage = create<GarageState>()((set, get) => ({
  cars: [],
  loaded: false,

  load: async () => {
    const uid = useAuth.getState().session?.user.id;
    if (!uid) {
      set({ cars: [], loaded: true });
      return;
    }
    const { data, error } = await supabase.from('cars').select(COLS).eq('user_id', uid).order('created_at');
    if (error) console.warn('Garage load failed', error.message);
    set({ cars: (data as Car[] | null) ?? [], loaded: true });
  },

  save: async (input, id) => {
    const row = {
      make: input.make.trim(),
      model: input.model.trim(),
      year: input.year,
      nickname: input.nickname?.trim() || null,
      body: input.body,
      paint: input.paint,
    };
    const query = id ? supabase.from('cars').update(row).eq('id', id) : supabase.from('cars').insert(row);
    const { data, error } = await query.select(COLS).single();
    if (error) return friendly(error.message);
    const car = data as Car;
    set({ cars: id ? get().cars.map((c) => (c.id === id ? car : c)) : [...get().cars, car] });
    // The first car goes on the map; editing the main car updates the map too.
    const profile = useAuth.getState().profile;
    if (!profile?.primary_car_id || profile.primary_car_id === car.id) return syncProfile(car);
    return null;
  },

  remove: async (id) => {
    await supabase.from('cars').delete().eq('id', id);
    const cars = get().cars.filter((c) => c.id !== id);
    set({ cars });
    // Deleted the main car: the next one takes its place on the map.
    if (useAuth.getState().profile?.primary_car_id === id && cars[0]) await syncProfile(cars[0]);
    else if (useAuth.getState().profile?.primary_car_id === id) await useAuth.getState().loadProfile();
  },

  setPrimary: (car) => syncProfile(car),

  forUser: async (userId) => {
    const { data } = await supabase.from('cars').select(COLS).eq('user_id', userId).order('created_at');
    return (data as Car[] | null) ?? [];
  },
}));
