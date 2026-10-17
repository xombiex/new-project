import type { Session } from '@supabase/supabase-js';
import { create } from 'zustand';

import { isDemo } from '@/lib/demo';
import { unregisterPush } from '@/lib/notifications';
import { supabase } from '@/lib/supabase';
import type { Paint, Vehicle } from '@/lib/vehicles';

export type Profile = {
  id: string;
  username: string;
  display_name: string;
  avatar_color: string;
  vehicle: Vehicle;
  vehicle_color: Paint;
  /** Garage car shown on the map (its body/paint are mirrored into vehicle/vehicle_color) */
  primary_car_id?: string | null;
  /** appears on friends' leaderboards */
  leaderboard?: boolean;
};

type AuthState = {
  ready: boolean;
  session: Session | null;
  profile: Profile | null;
  /** true while the signed-in user's profile is being fetched */
  profileLoading: boolean;
  init: () => () => void;
  loadProfile: () => Promise<void>;
  saveProfile: (p: Pick<Profile, 'username' | 'display_name' | 'avatar_color' | 'vehicle' | 'vehicle_color'>) => Promise<string | null>;
  setLeaderboard: (on: boolean) => Promise<void>;
  signOut: () => Promise<void>;
};

export const useAuth = create<AuthState>()((set, get) => ({
  ready: false,
  session: null,
  profile: null,
  profileLoading: false,

  init: () => {
    if (isDemo()) return () => {};
    supabase.auth.getSession().then(async ({ data }) => {
      set({ session: data.session });
      if (data.session) await get().loadProfile();
      set({ ready: true });
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      const changedUser = session?.user.id !== get().session?.user.id;
      set({ session });
      if (!session) set({ profile: null });
      else if (changedUser) {
        set({ profileLoading: true });
        void get().loadProfile();
      }
    });
    return () => data.subscription.unsubscribe();
  },

  loadProfile: async () => {
    const uid = get().session?.user.id;
    if (!uid) return;
    set({ profileLoading: true });
    const { data, error } = await supabase
      .from('profiles')
      .select('id, username, display_name, avatar_color, vehicle, vehicle_color, primary_car_id, leaderboard')
      .eq('id', uid)
      .maybeSingle();
    if (error) console.warn('Profile load failed', error.message);
    set({ profile: data ?? null, profileLoading: false });
  },

  /** Returns an error message, or null on success. */
  saveProfile: async (p) => {
    const uid = get().session?.user.id;
    if (!uid) return 'Not signed in';
    const row = { id: uid, ...p, username: p.username.trim().toLowerCase(), display_name: p.display_name.trim() };
    const { data, error } = await supabase
      .from('profiles')
      .upsert(row)
      .select('id, username, display_name, avatar_color, vehicle, vehicle_color, primary_car_id, leaderboard')
      .single();
    if (error) {
      if (error.code === '23505') return 'That username is taken';
      if (error.code === '23514') return 'Usernames are 3–20 lowercase letters, numbers or underscores';
      if (error.message.includes('style pack')) return 'That vehicle icon is part of the Style Pack';
      return error.message;
    }
    set({ profile: data });
    return null;
  },

  setLeaderboard: async (on) => {
    const uid = get().session?.user.id;
    if (!uid) return;
    set({ profile: get().profile ? { ...get().profile!, leaderboard: on } : null });
    await supabase.from('profiles').update({ leaderboard: on }).eq('id', uid);
  },

  signOut: async () => {
    await unregisterPush();
    await supabase.auth.signOut();
    set({ session: null, profile: null });
  },
}));
