import AsyncStorage from '@react-native-async-storage/async-storage';
import type { RealtimeChannel } from '@supabase/supabase-js';
import * as Speech from 'expo-speech';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { analyzeConvoy } from '@/lib/convoy';
import { haversine } from '@/lib/geo';
import { isDemo } from '@/lib/demo';
import { haptic } from '@/lib/haptics';
import { addReason, onLocation, removeReason } from '@/lib/location';
import { notify } from '@/lib/notifications';
import { CALL_COOLDOWN_MS, quickCall, type QuickCallKind } from '@/lib/quick-calls';
import { supabase } from '@/lib/supabase';
import type { LocationSample } from '@/lib/trip-recorder';
import type { Profile } from '@/store/auth';
import type { Place } from '@/lib/places';
import { useNav } from '@/store/nav';
import { useNavigation } from '@/store/navigation';
import { useNotificationSettings } from '@/store/notification-settings';
import { useTrips } from '@/store/trips';

export type GroupDrive = {
  id: string;
  code: string;
  name: string;
  owner_id: string;
  destination_name: string | null;
  dest_lat: number | null;
  dest_lng: number | null;
  /** where the leader asked everyone to gather (a gas station ahead, usually) */
  regroup_name: string | null;
  regroup_lat: number | null;
  regroup_lng: number | null;
  regroup_at: string | null;
  status: 'active' | 'ended';
  club_id: string | null;
};

export type MemberPosition = {
  lat: number;
  lng: number;
  heading: number | null;
  speed: number | null;
  accuracy: number | null;
  /** epoch ms when the sender took the fix */
  t: number;
};

export type Member = {
  profile: Profile;
  position: MemberPosition | null;
  online: boolean;
};

type ConnectionStatus = 'idle' | 'connecting' | 'live' | 'reconnecting';

type DriveState = {
  drive: GroupDrive | null;
  members: Record<string, Member>;
  status: ConnectionStatus;
  sharing: boolean;
  /** member id → epoch ms they reached the destination */
  arrived: Record<string, number>;
  /** recent quick calls ("Need gas", "Cop ahead"…), newest last */
  calls: { id: string; from: string; name: string; kind: QuickCallKind; at: number }[];
  /** One-tap call to the whole convoy. Returns false if you just sent one. */
  /** 'wait' while on cooldown, 'offline' with no live connection to the drive. */
  sendCall: (kind: QuickCallKind) => 'sent' | 'wait' | 'offline';
  create: (name: string, destination?: { name: string; lat: number; lng: number }) => Promise<string | null>;
  join: (code: string) => Promise<string | null>;
  /** Start (owner/admin) or join (member) a club drive — no code needed. */
  startClubDrive: (clubId: string, eventId?: string) => Promise<string | null>;
  joinClubDrive: (driveId: string) => Promise<string | null>;
  resume: () => Promise<void>;
  setSharing: (on: boolean) => void;
  setDestination: (destination: { name: string; lat: number; lng: number } | null) => Promise<string | null>;
  /** Leader only: ask everyone to gather somewhere (null clears it). */
  setRegroup: (spot: { name: string; lat: number; lng: number } | null) => Promise<string | null>;
  leave: () => Promise<void>;
};

/** Broadcast at most this often, unless the driver has moved far. */
const SEND_INTERVAL_MS = 2000;
const SEND_FORCE_DISTANCE_M = 40;

let channel: RealtimeChannel | null = null;
let lastCallAt = 0;
let stopListening: (() => void) | null = null;
let lastSent: LocationSample | null = null;
let myId: string | null = null;
let monitor: ReturnType<typeof setInterval> | null = null;
let behindBefore = new Set<string>();

/** Within this distance of the group destination counts as arrived. */
const ARRIVED_M = 150;
const MONITOR_MS = 10_000;

function rpcError(message: string) {
  if (message.includes('drive not found')) return 'No active drive with that code';
  if (message.includes('drive is full')) return 'That drive is full';
  if (message.includes('not a club member')) return 'Only club members can join this drive';
  if (message.includes('too many active drives')) return 'You already have 3 active drives — end one first';
  return message;
}

export const useDrive = create<DriveState>()(
  persist(
    (set, get) => {
      async function loadRoster(driveId: string) {
        const { data, error } = await supabase
          .from('group_members')
          .select('profiles(id, username, display_name, avatar_color, vehicle, vehicle_color)')
          .eq('drive_id', driveId);
        if (error) {
          console.warn('Roster load failed', error.message);
          return;
        }
        const members = { ...get().members };
        for (const row of data as unknown as { profiles: Profile | null }[]) {
          const p = row.profiles;
          if (!p) continue;
          const prev = members[p.id] as Member | undefined;
          members[p.id] = { position: prev?.position ?? null, online: prev?.online ?? false, profile: p };
        }
        set({ members });
      }

      function updateMember(id: string, patch: Partial<Member>) {
        const existing = get().members[id];
        if (!existing) {
          // Someone joined after we loaded the roster.
          const driveId = get().drive?.id;
          if (driveId) void loadRoster(driveId);
          return;
        }
        set({ members: { ...get().members, [id]: { ...existing, ...patch } } });
      }

      function send(sample: LocationSample) {
        if (!channel || !get().sharing) return;
        const due =
          !lastSent ||
          sample.timestamp - lastSent.timestamp >= SEND_INTERVAL_MS ||
          haversine([lastSent.lng, lastSent.lat], [sample.lng, sample.lat]) >= SEND_FORCE_DISTANCE_M;
        if (!due) return;
        lastSent = sample;
        const position: MemberPosition = {
          lat: sample.lat,
          lng: sample.lng,
          heading: sample.heading,
          speed: sample.speed,
          accuracy: sample.accuracy,
          t: sample.timestamp,
        };
        void channel.send({ type: 'broadcast', event: 'pos', payload: { ...position, from: myId } });
        if (myId) updateMember(myId, { position });
      }

      async function connect(drive: GroupDrive) {
        await disconnect();
        const { data: auth } = await supabase.auth.getSession();
        const uid = auth.session?.user.id;
        if (!uid) return;
        myId = uid;

        set({ drive, status: 'connecting', members: {} });
        await loadRoster(drive.id);
        await supabase.realtime.setAuth(auth.session!.access_token);

        const ch = supabase.channel(`drive:${drive.id}`, {
          config: { private: true, broadcast: { self: false }, presence: { key: uid } },
        });
        channel = ch;

        ch.on('broadcast', { event: 'pos' }, ({ payload }) => {
          // Only drive members can send on this channel (enforced by RLS on realtime.messages),
          // but `from` is client-supplied, so only accept it for someone on the roster.
          const { from, ...position } = payload as MemberPosition & { from?: string };
          if (from && get().members[from]) updateMember(from, { position, online: true });
        })
          .on('broadcast', { event: 'drive' }, () => {
            void refreshDrive(drive.id);
          })
          .on('broadcast', { event: 'call' }, ({ payload }) => {
            const { from, kind } = payload as { from?: string; kind?: string };
            const member = from ? get().members[from] : undefined;
            const call = kind ? quickCall(kind) : undefined;
            if (!member || !call) return;
            const name = member.profile.display_name.split(' ')[0];
            addCall({ from: from!, name, kind: call.kind });
            haptic.warning();
            // Read it out (unless voice is muted), so the driver doesn't have to look.
            if (!useNavigation.getState().muted) Speech.speak(`${name} ${call.spoken}.`, { language: 'en-US' });
          })
          .on('broadcast', { event: 'arrived' }, ({ payload }) => {
            const from = (payload as { from?: string }).from;
            if (from && get().members[from]) set({ arrived: { ...get().arrived, [from]: Date.now() } });
          })
          .on('presence', { event: 'sync' }, () => {
            const online = new Set(Object.keys(ch.presenceState()));
            const members = { ...get().members };
            for (const id of Object.keys(members)) members[id] = { ...members[id], online: online.has(id) };
            set({ members });
            if ([...online].some((id) => !members[id])) {
              haptic.tap(); // someone new joined the drive
              void loadRoster(drive.id);
            }
          })
          .subscribe(async (status, err) => {
            if (channel !== ch) return;
            if (status === 'SUBSCRIBED') {
              set({ status: 'live' });
              await ch.track({ at: Date.now() });
            } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
              // supabase-js retries automatically; surface it so the UI can show "reconnecting".
              set({ status: 'reconnecting' });
              if (err) console.warn('Drive channel error', err.message);
            } else if (status === 'CLOSED') {
              set({ status: 'idle' });
            }
          });

        stopListening = onLocation((samples) => send(samples[samples.length - 1]));
        if (get().sharing) await addReason('drive');
        behindBefore = new Set();
        monitor = setInterval(checkGroup, MONITOR_MS);
      }

      /** Periodic group checks: did I arrive? did anyone fall behind? */
      function checkGroup() {
        const { drive, members, arrived } = get();
        const me = useTrips.getState().lastSample;
        if (!drive || !myId) return;
        const dest = drive.dest_lat != null && drive.dest_lng != null ? ([drive.dest_lng, drive.dest_lat] as [number, number]) : null;

        if (dest && me && !arrived[myId] && haversine([me.lng, me.lat], dest) <= ARRIVED_M) {
          set({ arrived: { ...arrived, [myId]: Date.now() } });
          void channel?.send({ type: 'broadcast', event: 'arrived', payload: { from: myId } });
          void notify({ type: 'arrived', drive_id: drive.id });
        }

        const views = analyzeConvoy(
          Object.entries(members)
            .filter(([id]) => !get().arrived[id])
            .map(([id, m]) => ({ id, online: m.online, position: m.position })),
          me ? [me.lng, me.lat] : null,
          dest,
          Date.now()
        );
        const behind = new Set(views.filter((v) => v.behind && v.id !== myId).map((v) => v.id));
        const fresh = [...behind].filter((id) => !behindBefore.has(id));
        behindBefore = behind;
        // Spoken rather than shown, so nobody looks at the phone to read it.
        if (fresh.length && useNotificationSettings.getState().prefs.drive_activity && !useNavigation.getState().muted) {
          const names = fresh.map((id) => members[id]?.profile.display_name).filter(Boolean).join(' and ');
          Speech.speak(`${names} ${fresh.length === 1 ? 'has' : 'have'} fallen behind.`, { language: 'en-US' });
        }
      }

      async function refreshDrive(id: string) {
        const { data } = await supabase.from('group_drives').select('*').eq('id', id).maybeSingle();
        if (!data || data.status === 'ended') {
          await disconnect();
          set({ drive: null, members: {} });
        } else set({ drive: data });
      }

      async function disconnect() {
        stopListening?.();
        stopListening = null;
        if (monitor) clearInterval(monitor);
        monitor = null;
        lastSent = null;
        if (channel) {
          const ch = channel;
          channel = null;
          await ch.untrack().catch(() => {});
          await supabase.removeChannel(ch);
        }
        await removeReason('drive');
        set({ status: 'idle' });
      }

      function addCall(c: { from: string; name: string; kind: QuickCallKind }) {
        const at = Date.now();
        set({ calls: [...get().calls.filter((x) => at - x.at < 60_000), { ...c, id: `${c.from}-${at}`, at }].slice(-5) });
      }

      return {
        calls: [],
        sendCall: (kind) => {
          if (Date.now() - lastCallAt < CALL_COOLDOWN_MS) return 'wait';
          // The demo drive has no live channel: just show the call here.
          if (!isDemo() && (!channel || !myId)) return 'offline';
          lastCallAt = Date.now();
          if (channel && myId) void channel.send({ type: 'broadcast', event: 'call', payload: { from: myId, kind } });
          addCall({ from: myId ?? 'me', name: 'You', kind });
          haptic.tap();
          return 'sent';
        },
        drive: null,
        members: {},
        status: 'idle',
        sharing: true,
        arrived: {},

        create: async (name, destination) => {
          const { data, error } = await supabase.rpc('create_drive', {
            p_name: name.trim(),
            p_destination_name: destination?.name ?? null,
            p_dest_lat: destination?.lat ?? null,
            p_dest_lng: destination?.lng ?? null,
          });
          if (error) return rpcError(error.message);
          set({ arrived: {} });
          await connect(data as GroupDrive);
          return null;
        },

        join: async (code) => {
          const { data, error } = await supabase.rpc('join_drive', { p_code: code });
          if (error) return rpcError(error.message);
          set({ arrived: {} });
          await connect(data as GroupDrive);
          void notify({ type: 'member_joined', drive_id: (data as GroupDrive).id });
          return null;
        },

        startClubDrive: async (clubId, eventId) => {
          const { data, error } = await supabase.rpc('start_club_drive', { p_club: clubId, p_event: eventId ?? null });
          if (error) return rpcError(error.message);
          set({ arrived: {} });
          await connect(data as GroupDrive);
          return null;
        },

        joinClubDrive: async (driveId) => {
          const { data, error } = await supabase.rpc('join_club_drive', { p_drive: driveId });
          if (error) return rpcError(error.message);
          set({ arrived: {} });
          await connect(data as GroupDrive);
          void notify({ type: 'member_joined', drive_id: driveId });
          return null;
        },

        /** Reconnect to the persisted drive after an app restart. */
        resume: async () => {
          const drive = get().drive;
          if (!drive || channel || isDemo()) return;
          const { data } = await supabase.from('group_drives').select('*').eq('id', drive.id).maybeSingle();
          if (data && data.status === 'active') await connect(data);
          else set({ drive: null, members: {} });
        },

        setSharing: (on) => {
          set({ sharing: on });
          if (!channel) return;
          if (on) void addReason('drive');
          else void removeReason('drive');
        },

        setDestination: async (destination) => {
          const drive = get().drive;
          if (!drive) return 'Not in a drive';
          const { data, error } = await supabase
            .from('group_drives')
            .update({
              destination_name: destination?.name ?? null,
              dest_lat: destination?.lat ?? null,
              dest_lng: destination?.lng ?? null,
            })
            .eq('id', drive.id)
            .select('*')
            .single();
          if (error) return error.message;
          set({ drive: data });
          void channel?.send({ type: 'broadcast', event: 'drive', payload: {} });
          return null;
        },

        setRegroup: async (spot) => {
          const drive = get().drive;
          if (!drive) return 'Not in a drive';
          const { data, error } = await supabase
            .from('group_drives')
            .update({
              regroup_name: spot?.name.slice(0, 80) ?? null,
              regroup_lat: spot?.lat ?? null,
              regroup_lng: spot?.lng ?? null,
              regroup_at: spot ? new Date().toISOString() : null,
            })
            .eq('id', drive.id)
            .select('*')
            .single();
          if (error) return error.message;
          set({ drive: data });
          void channel?.send({ type: 'broadcast', event: 'drive', payload: {} });
          if (spot) void notify({ type: 'regroup', drive_id: drive.id });
          return null;
        },

        leave: async () => {
          const drive = get().drive;
          const { data } = await supabase.auth.getSession();
          await disconnect();
          if (drive && data.session) {
            if (drive.owner_id === data.session.user.id) {
              await supabase.from('group_drives').update({ status: 'ended' }).eq('id', drive.id);
            } else {
              await supabase.from('group_members').delete().eq('drive_id', drive.id).eq('user_id', data.session.user.id);
            }
          }
          set({ drive: null, members: {} });
        },
      };
    },
    {
      name: 'convoy-drive',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: ({ drive, sharing, arrived }) => ({ drive, sharing, arrived }),
    }
  )
);

/**
 * Where the convoy is headed right now, as a place you can route to: the regroup point while one
 * is set, otherwise the group destination.
 */
export function groupStop(drive: GroupDrive | null): (Place & { kind: 'regroup' | 'destination' }) | null {
  if (!drive) return null;
  if (drive.regroup_name && drive.regroup_lat != null && drive.regroup_lng != null) {
    const coord: [number, number] = [drive.regroup_lng, drive.regroup_lat];
    return { kind: 'regroup', id: `regroup-${drive.id}-${coord.join()}`, name: drive.regroup_name, detail: 'Regroup point', coord, category: 'Regroup point' };
  }
  if (drive.dest_lat != null && drive.dest_lng != null) {
    const coord: [number, number] = [drive.dest_lng, drive.dest_lat];
    return { kind: 'destination', id: `destination-${drive.id}-${coord.join()}`, name: drive.destination_name ?? 'Convoy destination', detail: 'Convoy destination', coord, category: 'Convoy destination' };
  }
  return null;
}

// When the convoy's stop is set or changes (the leader picks a destination or regroup point, or
// you join a drive that has one), open the route to it on the Drive tab with the Go button, so
// nobody has to search for it. Not while you're navigating or looking at another place, and not
// for a stop you already had when the app started.
let lastStop: string | null = null;
let ready = false;
const markStop = () => {
  lastStop = groupStop(useDrive.getState().drive)?.id ?? null;
  ready = true;
};
if (useDrive.persist.hasHydrated()) markStop();
else useDrive.persist.onFinishHydration(markStop);

useDrive.subscribe((state) => {
  if (!ready) return;
  const stop = groupStop(state.drive);
  const id = stop?.id ?? null;
  if (id === lastStop) return;
  lastStop = id;
  if (!stop || useNavigation.getState().active) return;
  const shown = useNav.getState().destination;
  // Replace an older convoy stop, but don't take over a place they're looking at themselves.
  if (shown && !/^(regroup|destination)-/.test(shown.id)) return;
  const s = useTrips.getState().lastSample;
  if (s) void useNav.getState().planTo(stop, [s.lng, s.lat]);
});
