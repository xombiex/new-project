import { create } from 'zustand';

import { supabase } from '@/lib/supabase';
import type { Profile } from '@/store/auth';
import type { GroupDrive } from '@/store/drive';

export type Club = {
  id: string;
  name: string;
  description: string | null;
  color: string;
  owner_id: string;
  invite_code: string;
};

export type ClubRole = 'owner' | 'admin' | 'member';

export type ClubEvent = {
  id: string;
  club_id: string;
  title: string;
  description: string | null;
  starts_at: string;
  meet_name: string | null;
  meet_lat: number | null;
  meet_lng: number | null;
  dest_name: string | null;
  dest_lat: number | null;
  dest_lng: number | null;
  price_cents: number;
  currency: string;
  capacity: number | null;
  drive_id: string | null;
};

export type RsvpStatus = 'going' | 'interested' | 'not_going';
export type Rsvp = { user_id: string; status: RsvpStatus; paid: boolean; profile: Profile };

export type ClubDetail = {
  club: Club;
  role: ClubRole | null;
  members: { profile: Profile; role: ClubRole }[];
  events: ClubEvent[];
  drives: GroupDrive[];
  payouts: { charges_enabled: boolean } | null;
};

export type NewEvent = Omit<ClubEvent, 'id' | 'drive_id' | 'currency'>;

const PROFILE = 'id, username, display_name, avatar_color, vehicle, vehicle_color';

function rpcError(message: string) {
  if (message.includes('club plan required')) return 'Creating a club needs the Convoy Clubs plan';
  if (message.includes('club limit')) return 'You can own up to 3 clubs';
  if (message.includes('club not found')) return 'No club with that code';
  if (message.includes('club is full')) return 'That club is full';
  if (message.includes('event is full')) return 'This event is full';
  return message;
}

async function uid() {
  const { data } = await supabase.auth.getSession();
  return data.session?.user.id ?? null;
}

type ClubsState = {
  mine: (Club & { role: ClubRole })[];
  loadMine: () => Promise<void>;
  create: (name: string, color: string, description: string | null) => Promise<{ club?: Club; error?: string }>;
  join: (code: string) => Promise<{ club?: Club; error?: string }>;
  load: (id: string) => Promise<ClubDetail | null>;
  leave: (clubId: string) => Promise<void>;
  createEvent: (e: NewEvent) => Promise<{ id?: string; error?: string }>;
  deleteEvent: (id: string) => Promise<void>;
  loadEvent: (id: string) => Promise<{ event: ClubEvent; club: Club; role: ClubRole | null; rsvps: Rsvp[] } | null>;
  rsvp: (eventId: string, status: RsvpStatus) => Promise<string | null>;
};

export const useClubs = create<ClubsState>()((set, get) => ({
  mine: [],

  loadMine: async () => {
    const me = await uid();
    if (!me) return;
    const { data, error } = await supabase
      .from('club_members')
      .select('role, clubs(id, name, description, color, owner_id, invite_code)')
      .eq('user_id', me);
    if (error) {
      console.warn('Clubs load failed', error.message);
      return;
    }
    set({
      mine: (data as unknown as { role: ClubRole; clubs: Club | null }[])
        .filter((r) => r.clubs)
        .map((r) => ({ ...r.clubs!, role: r.role })),
    });
  },

  create: async (name, color, description) => {
    const { data, error } = await supabase.rpc('create_club', { p_name: name, p_color: color, p_description: description });
    if (error) return { error: rpcError(error.message) };
    await get().loadMine();
    return { club: data as Club };
  },

  join: async (code) => {
    const { data, error } = await supabase.rpc('join_club', { p_code: code });
    if (error) return { error: rpcError(error.message) };
    await get().loadMine();
    return { club: data as Club };
  },

  load: async (id) => {
    const me = await uid();
    const [club, members, events, drives, payouts] = await Promise.all([
      supabase.from('clubs').select('id, name, description, color, owner_id, invite_code').eq('id', id).maybeSingle(),
      supabase.from('club_members').select(`role, profiles(${PROFILE})`).eq('club_id', id),
      supabase
        .from('club_events')
        .select('*')
        .eq('club_id', id)
        .gte('starts_at', new Date(Date.now() - 6 * 3_600_000).toISOString())
        .order('starts_at'),
      supabase.from('group_drives').select('*').eq('club_id', id).eq('status', 'active'),
      supabase.from('club_payouts').select('charges_enabled').eq('club_id', id).maybeSingle(),
    ]);
    if (!club.data) return null;
    const roster = ((members.data ?? []) as unknown as { role: ClubRole; profiles: Profile | null }[])
      .filter((m) => m.profiles)
      .map((m) => ({ profile: m.profiles!, role: m.role }))
      .sort((a, b) => ['owner', 'admin', 'member'].indexOf(a.role) - ['owner', 'admin', 'member'].indexOf(b.role));
    return {
      club: club.data,
      role: roster.find((m) => m.profile.id === me)?.role ?? null,
      members: roster,
      events: (events.data ?? []) as ClubEvent[],
      drives: (drives.data ?? []) as GroupDrive[],
      payouts: payouts.data ?? null,
    };
  },

  leave: async (clubId) => {
    const me = await uid();
    if (!me) return;
    await supabase.from('club_members').delete().eq('club_id', clubId).eq('user_id', me);
    await get().loadMine();
  },

  createEvent: async (e) => {
    const me = await uid();
    const { data, error } = await supabase
      .from('club_events')
      .insert({ ...e, created_by: me })
      .select('id')
      .single();
    if (error) return { error: rpcError(error.message) };
    return { id: data.id };
  },

  deleteEvent: async (id) => {
    await supabase.from('club_events').delete().eq('id', id);
  },

  loadEvent: async (id) => {
    const me = await uid();
    const { data: event } = await supabase.from('club_events').select('*').eq('id', id).maybeSingle();
    if (!event) return null;
    const [club, rsvps, role] = await Promise.all([
      supabase.from('clubs').select('id, name, description, color, owner_id, invite_code').eq('id', event.club_id).single(),
      supabase.from('event_rsvps').select(`user_id, status, paid, profiles(${PROFILE})`).eq('event_id', id),
      supabase.from('club_members').select('role').eq('club_id', event.club_id).eq('user_id', me ?? '').maybeSingle(),
    ]);
    return {
      event: event as ClubEvent,
      club: club.data as Club,
      role: (role.data?.role as ClubRole) ?? null,
      rsvps: ((rsvps.data ?? []) as unknown as (Omit<Rsvp, 'profile'> & { profiles: Profile | null })[])
        .filter((r) => r.profiles)
        .map(({ profiles, ...r }) => ({ ...r, profile: profiles! })),
    };
  },

  rsvp: async (eventId, status) => {
    const me = await uid();
    if (!me) return 'Not signed in';
    const { error } = await supabase
      .from('event_rsvps')
      .upsert({ event_id: eventId, user_id: me, status, updated_at: new Date().toISOString() });
    return error ? rpcError(error.message) : null;
  },
}));
