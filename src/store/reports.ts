import * as Speech from 'expo-speech';
import { create } from 'zustand';

import { haversine, type LngLat } from '@/lib/geo';
import { spokenDistance } from '@/lib/instructions';
import { onLocation } from '@/lib/location';
import { reportMeta, reportsAhead, type ReportType, type RoadReport } from '@/lib/reports';
import { supabase } from '@/lib/supabase';
import { useNavigation } from '@/store/navigation';
import { useSettings } from '@/store/settings';

type ReportsState = {
  reports: RoadReport[];
  /** Fetch reports around a point (skips if we fetched nearby recently). */
  refresh: (center: LngLat, force?: boolean) => Promise<void>;
  /** Returns an error message, or null. */
  create: (type: ReportType, at: LngLat) => Promise<string | null>;
  vote: (id: string, stillThere: boolean) => Promise<void>;
};

const REFETCH_DISTANCE_M = 3000;
const REFETCH_MS = 120_000;

let lastFetch: { at: LngLat; time: number } | null = null;
const warned = new Set<string>();

function errorText(message: string) {
  if (message.includes('report limit')) return 'You have reached the report limit for now. Try again later.';
  if (message.includes('not authenticated')) return 'Sign in to report.';
  return message;
}

export const useReports = create<ReportsState>()((set, get) => ({
  reports: [],

  refresh: async (center, force = false) => {
    const fresh =
      lastFetch &&
      Date.now() - lastFetch.time < REFETCH_MS &&
      haversine(lastFetch.at, center) < REFETCH_DISTANCE_M;
    if (fresh && !force) return;
    lastFetch = { at: center, time: Date.now() };
    const { data, error } = await supabase.rpc('reports_near', { p_lat: center[1], p_lng: center[0], p_radius_km: 30 });
    if (error) {
      console.warn('Reports load failed', error.message);
      return;
    }
    set({ reports: data as RoadReport[] });
  },

  create: async (type, at) => {
    const { error } = await supabase.rpc('create_report', { p_type: type, p_lat: at[1], p_lng: at[0] });
    if (error) return errorText(error.message);
    await get().refresh(at, true);
    return null;
  },

  vote: async (id, stillThere) => {
    // Optimistic: hide a dismissed report immediately.
    if (!stillThere) set({ reports: get().reports.filter((r) => r.id !== id) });
    const { error } = await supabase.rpc('vote_report', { p_id: id, p_still_there: stillThere });
    if (error) console.warn('Vote failed', error.message);
    if (lastFetch) await get().refresh(lastFetch.at, true);
  },
}));

// Keep reports fresh while moving, and warn once about each report on the road ahead.
onLocation((samples) => {
  const s = samples[samples.length - 1];
  const me: LngLat = [s.lng, s.lat];
  void useReports.getState().refresh(me);

  const { reportAlerts, units } = useSettings.getState();
  if (!reportAlerts) return;
  const speed = s.speed != null && s.speed >= 0 ? s.speed : 0;
  const ahead = reportsAhead(useReports.getState().reports, me, s.heading, speed).find((a) => !warned.has(a.report.id));
  if (!ahead) return;
  warned.add(ahead.report.id);
  if (useNavigation.getState().muted) return;
  Speech.speak(`${reportMeta(ahead.report.type).spoken} reported ahead, in ${spokenDistance(units, ahead.distanceM)}.`, {
    language: 'en-US',
  });
});
