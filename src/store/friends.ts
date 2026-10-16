import { create } from 'zustand';

import { onLocation } from '@/lib/location';
import { notify } from '@/lib/notifications';
import { inZone } from '@/lib/privacy';
import { supabase } from '@/lib/supabase';
import type { LocationSample } from '@/lib/trip-recorder';
import type { Profile } from '@/store/auth';
import { useSettings } from '@/store/settings';

export type Friendship = {
  other: Profile;
  status: 'pending' | 'accepted' | 'blocked';
  /** true when the current user sent the request */
  outgoing: boolean;
};

export type FriendLocation = {
  user_id: string;
  lat: number;
  lng: number;
  heading: number | null;
  speed_mps: number | null;
  updated_at: string;
};

type FriendsState = {
  friendships: Friendship[];
  locations: Record<string, FriendLocation>;
  /** epoch ms until which my last-known location is visible to friends; null = not sharing */
  shareUntil: number | null;
  loading: boolean;
  refresh: () => Promise<void>;
  request: (username: string) => Promise<string | null>;
  respond: (otherId: string, status: 'accepted' | 'blocked') => Promise<void>;
  remove: (otherId: string) => Promise<void>;
  startSharing: (hours: number) => Promise<string | null>;
  stopSharing: () => Promise<void>;
};

/** Friends see a last-known position, not a live stream — one write per minute is plenty. */
const UPLOAD_INTERVAL_MS = 60_000;

let lastUpload = 0;
let stopUploads: (() => void) | null = null;

const PROFILE_COLS = 'id, username, display_name, avatar_color, vehicle';

async function myId() {
  const { data } = await supabase.auth.getSession();
  return data.session?.user.id ?? null;
}

async function upload(sample: LocationSample, shareUntil: number) {
  const uid = await myId();
  if (!uid) return;
  const { error } = await supabase.from('user_locations').upsert({
    user_id: uid,
    lat: sample.lat,
    lng: sample.lng,
    heading: sample.heading,
    speed_mps: sample.speed != null && sample.speed >= 0 ? sample.speed : null,
    accuracy_m: sample.accuracy,
    updated_at: new Date(sample.timestamp).toISOString(),
    share_until: new Date(shareUntil).toISOString(),
  });
  if (error) console.warn('Location share failed', error.message);
}

export const useFriends = create<FriendsState>()((set, get) => {
  function listen() {
    stopUploads?.();
    stopUploads = onLocation((samples) => {
      const until = get().shareUntil;
      if (!until || until < Date.now()) {
        stopUploads?.();
        stopUploads = null;
        set({ shareUntil: null });
        return;
      }
      if (Date.now() - lastUpload < UPLOAD_INTERVAL_MS) return;
      const sample = samples[samples.length - 1];
      // Inside a privacy zone friends keep seeing the last position from outside it.
      if (inZone([sample.lng, sample.lat], useSettings.getState().privacyZones)) return;
      lastUpload = Date.now();
      void upload(sample, until);
    });
  }

  return {
    friendships: [],
    locations: {},
    shareUntil: null,
    loading: false,

    refresh: async () => {
      const uid = await myId();
      if (!uid) return;
      set({ loading: true });
      const [{ data: rows, error }, { data: mine }] = await Promise.all([
        supabase
          .from('friendships')
          .select(`requester_id, addressee_id, status, requester:profiles!friendships_requester_id_fkey(${PROFILE_COLS}), addressee:profiles!friendships_addressee_id_fkey(${PROFILE_COLS})`),
        supabase.from('user_locations').select('share_until').eq('user_id', uid).maybeSingle(),
      ]);
      if (error) {
        console.warn('Friends load failed', error.message);
        set({ loading: false });
        return;
      }
      const friendships: Friendship[] = (rows as any[]).map((r) => {
        const outgoing = r.requester_id === uid;
        return { other: outgoing ? r.addressee : r.requester, status: r.status, outgoing };
      });
      // RLS only returns rows for friends who are actively sharing with us.
      const { data: locs } = await supabase
        .from('user_locations')
        .select('user_id, lat, lng, heading, speed_mps, updated_at')
        .neq('user_id', uid);
      const until = mine?.share_until ? Date.parse(mine.share_until) : null;
      set({
        friendships,
        locations: Object.fromEntries((locs ?? []).map((l) => [l.user_id, l])),
        shareUntil: until && until > Date.now() ? until : null,
        loading: false,
      });
      if (get().shareUntil && !stopUploads) listen();
    },

    request: async (username) => {
      const uid = await myId();
      if (!uid) return 'Not signed in';
      const { data: target } = await supabase
        .from('profiles')
        .select('id')
        .eq('username', username.trim().toLowerCase())
        .maybeSingle();
      if (!target) return 'No user with that username';
      if (target.id === uid) return "That's you";
      const { error } = await supabase.from('friendships').insert({ requester_id: uid, addressee_id: target.id });
      if (error) return error.code === '23505' ? 'Request already sent' : error.message;
      void notify({ type: 'friend_request', to: target.id });
      await get().refresh();
      return null;
    },

    respond: async (otherId, status) => {
      const uid = await myId();
      if (!uid) return;
      await supabase.from('friendships').update({ status }).eq('requester_id', otherId).eq('addressee_id', uid);
      if (status === 'accepted') void notify({ type: 'friend_accepted', to: otherId });
      await get().refresh();
    },

    remove: async (otherId) => {
      const uid = await myId();
      if (!uid) return;
      await supabase
        .from('friendships')
        .delete()
        .or(`and(requester_id.eq.${uid},addressee_id.eq.${otherId}),and(requester_id.eq.${otherId},addressee_id.eq.${uid})`);
      await get().refresh();
    },

    startSharing: async (hours) => {
      const until = Date.now() + hours * 3600_000;
      set({ shareUntil: until });
      lastUpload = 0;
      listen();
      return null;
    },

    stopSharing: async () => {
      stopUploads?.();
      stopUploads = null;
      set({ shareUntil: null });
      const uid = await myId();
      // Remove the row entirely rather than just expiring it — nothing lingers server-side.
      if (uid) await supabase.from('user_locations').delete().eq('user_id', uid);
    },
  };
});
