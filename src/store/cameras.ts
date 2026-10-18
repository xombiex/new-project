import * as Speech from 'expo-speech';
import { create } from 'zustand';

import { CAMERA_LABEL, cameraAhead, fetchCamerasAround, type Camera, type CameraKind } from '@/lib/cameras';
import { haversine, type LngLat } from '@/lib/geo';
import { haptic } from '@/lib/haptics';
import { spokenDistance } from '@/lib/instructions';
import { onLocation } from '@/lib/location';
import { supabase } from '@/lib/supabase';
import { useNavigation } from '@/store/navigation';
import { useSettings } from '@/store/settings';

/** Load cameras this far around you; reload once you've moved half of it. */
const RADIUS_M = 8000;
const RETRY_MS = 30_000;
const MAX_CAMERAS = 5000;
/** Community reports change faster than OpenStreetMap: recheck every couple of minutes. */
const COMMUNITY_MS = 120_000;
/** Ask "is there a camera here?" when you pass within this distance of an unconfirmed report. */
const PROMPT_M = 120;

export type ScoutStats = { points: number; weight: number; verified: number; pending: number; votes: number };

type CommunityRow = {
  id: string;
  kind: CameraKind;
  lat: number;
  lng: number;
  direction: number | null;
  status: 'pending' | 'verified';
  present: number;
  gone: number;
  mine: boolean;
  my_vote: boolean | null;
};

type CamerasState = {
  /** everything drawn on the map: OpenStreetMap (minus ones drivers retired) + community reports */
  cameras: Camera[];
  /** the camera you're approaching right now, for the Drive screen banner */
  ahead: { camera: Camera; distanceM: number } | null;
  /** an unconfirmed report you're passing: "is there a camera here?" */
  prompt: Camera | null;
  refresh: (me: LngLat) => Promise<void>;
  /** Returns a message to show the reporter. */
  report: (kind: CameraKind, at: LngLat, heading: number | null) => Promise<{ ok: boolean; message: string }>;
  vote: (camera: Camera, present: boolean) => Promise<void>;
  dismissPrompt: () => void;
  scout: () => Promise<ScoutStats | null>;
};

let osm: Camera[] = [];
let community: Camera[] = [];
let retired = new Set<number | string>();
let fetchedAt: LngLat | null = null;
let communityAt: { at: LngLat; time: number } | null = null;
let loading = false;
let failedAt = 0;
const warned = new Set<number | string>();
const prompted = new Set<number | string>();
let promptTimer: ReturnType<typeof setTimeout> | null = null;

const toCamera = (r: CommunityRow): Camera => ({
  id: `c-${r.id}`,
  kind: r.kind,
  coord: [r.lng, r.lat],
  direction: r.direction ?? undefined,
  source: 'community',
  status: r.status,
  mine: r.mine,
  myVote: r.my_vote,
  votes: { present: r.present, gone: r.gone },
});

function publish() {
  useCameras.setState({ cameras: [...osm.filter((c) => !retired.has(c.id)), ...community] });
}

async function loadCommunity(me: LngLat, force = false) {
  if (!force && communityAt && Date.now() - communityAt.time < COMMUNITY_MS && haversine(communityAt.at, me) < RADIUS_M / 2) return;
  communityAt = { at: me, time: Date.now() };
  const { data, error } = await supabase.rpc('community_cameras_near', { p_lat: me[1], p_lng: me[0], p_radius_km: RADIUS_M / 1000 });
  if (error || !data) return;
  const json = data as { cameras: CommunityRow[]; retired_osm: number[] };
  community = json.cameras.map(toCamera);
  retired = new Set(json.retired_osm);
  publish();
}

function friendlyError(message: string) {
  if (message.includes('not authenticated')) return 'Sign in to report cameras.';
  if (message.includes('report limit')) return 'That’s a lot of cameras for one day. Try again tomorrow.';
  return message;
}

export const useCameras = create<CamerasState>()((set, get) => ({
  cameras: [],
  ahead: null,
  prompt: null,

  refresh: async (me) => {
    void loadCommunity(me);
    if (loading || Date.now() - failedAt < RETRY_MS) return;
    if (fetchedAt && haversine(fetchedAt, me) < RADIUS_M / 2) return;
    loading = true;
    try {
      const fresh = await fetchCamerasAround(me, RADIUS_M);
      // Merge with what we already have (driving across areas), newest area wins, capped.
      const byId = new Map(osm.map((c) => [c.id, c]));
      for (const c of fresh) byId.set(c.id, { ...c, source: 'osm' });
      osm = [...byId.values()].slice(-MAX_CAMERAS);
      publish();
      fetchedAt = me;
    } catch {
      failedAt = Date.now();
    } finally {
      loading = false;
    }
  },

  report: async (kind, at, heading) => {
    const { data, error } = await supabase.rpc('report_camera', { p_kind: kind, p_lat: at[1], p_lng: at[0], p_direction: heading });
    if (error) return { ok: false, message: friendlyError(error.message) };
    await loadCommunity(at, true);
    const r = data as { status: string; existing: boolean };
    const what = CAMERA_LABEL[kind].toLowerCase();
    if (r.status === 'known') return { ok: true, message: `That ${what} is already on the map. Thanks for looking out!` };
    if (r.status === 'verified') return { ok: true, message: `Confirmed! The ${what} is now on the map for everyone.` };
    if (r.existing) return { ok: true, message: `Someone already reported a ${what} here. Your confirmation counts.` };
    return { ok: true, message: `Thanks, scout! The ${what} shows up for everyone once a couple more drivers confirm it.` };
  },

  vote: async (camera, present) => {
    if (get().prompt?.id === camera.id) get().dismissPrompt();
    prompted.add(camera.id);
    // Optimistic: "gone" hides it for you right away.
    if (!present) {
      if (camera.source === 'community') community = community.filter((c) => c.id !== camera.id);
      else retired.add(camera.id);
      publish();
    }
    const { error } =
      camera.source === 'community'
        ? await supabase.rpc('vote_camera', { p_id: String(camera.id).replace(/^c-/, ''), p_present: present })
        : await supabase.rpc('vote_osm_camera', { p_osm_id: camera.id, p_present: present });
    if (error) console.warn('Camera vote failed', error.message);
    if (communityAt) await loadCommunity(communityAt.at, true);
  },

  dismissPrompt: () => {
    if (promptTimer) clearTimeout(promptTimer);
    promptTimer = null;
    set({ prompt: null });
  },

  scout: async () => {
    const { data, error } = await supabase.rpc('my_scout_stats');
    return error ? null : (data as ScoutStats);
  },
}));

/** Which kinds the user wants on the map and alerted. */
export function cameraKinds(): CameraKind[] {
  const { speedCameraAlerts, showAlprCameras } = useSettings.getState();
  return [...(speedCameraAlerts ? (['speed', 'redlight'] as const) : []), ...(showAlprCameras ? (['alpr'] as const) : [])];
}

/** Camera Scout ranks: points needed, and how much your votes count. */
export const SCOUT_RANKS = [
  { name: 'Rookie', min: 0, weight: 1 },
  { name: 'Spotter', min: 10, weight: 1 },
  { name: 'Scout', min: 50, weight: 1.5 },
  { name: 'Ranger', min: 150, weight: 2 },
  { name: 'Legend', min: 400, weight: 2.5 },
] as const;

export function scoutRank(points: number) {
  let i = 0;
  while (i < SCOUT_RANKS.length - 1 && points >= SCOUT_RANKS[i + 1].min) i++;
  return { ...SCOUT_RANKS[i], next: i < SCOUT_RANKS.length - 1 ? SCOUT_RANKS[i + 1] : null };
}

// Load cameras around you, give one heads-up per camera on the road ahead, and ask about
// unconfirmed reports as you pass them.
onLocation((samples) => {
  const s = samples[samples.length - 1];
  if (!s) return;
  const me: LngLat = [s.lng, s.lat];
  const kinds = cameraKinds();
  if (kinds.length === 0) {
    if (useCameras.getState().ahead) useCameras.setState({ ahead: null });
    return;
  }
  void useCameras.getState().refresh(me);

  const speed = s.speed != null && s.speed >= 0 ? s.speed : 0;
  const all = useCameras.getState().cameras;

  // Passing an unconfirmed report (not yours, not voted on): ask once, then let it go.
  const st = useCameras.getState();
  if (!st.prompt) {
    const near = all.find(
      (c) => c.status === 'pending' && !c.mine && c.myVote == null && !prompted.has(c.id) && kinds.includes(c.kind) && haversine(me, c.coord) < PROMPT_M
    );
    if (near) {
      prompted.add(near.id);
      haptic.tap();
      useCameras.setState({ prompt: near });
      promptTimer = setTimeout(() => useCameras.getState().dismissPrompt(), 12_000);
    }
  } else if (haversine(me, st.prompt.coord) > 400) {
    st.dismissPrompt();
  }

  const ahead = cameraAhead(all, me, s.heading, speed, kinds);
  const prev = useCameras.getState().ahead;
  if (ahead?.camera.id !== prev?.camera.id || (ahead && prev && Math.abs(ahead.distanceM - prev.distanceM) > 25)) {
    useCameras.setState({ ahead });
  }
  if (!ahead || warned.has(ahead.camera.id)) return;
  warned.add(ahead.camera.id);
  haptic.warning();
  const { reportAlerts, units } = useSettings.getState();
  if (!reportAlerts || useNavigation.getState().muted) return;
  const what = CAMERA_LABEL[ahead.camera.kind];
  Speech.speak(`${what} ahead, in ${spokenDistance(units, ahead.distanceM)}.`, { language: 'en-US' });
});
