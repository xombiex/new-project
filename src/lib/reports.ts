import { bearing, haversine, type LngLat } from '@/lib/geo';

export type ReportType = 'traffic' | 'hazard' | 'accident' | 'closure' | 'construction' | 'disabled' | 'police' | 'weather';

export const REPORT_TYPES: { value: ReportType; label: string; icon: string; color: string; spoken: string }[] = [
  { value: 'traffic', label: 'Traffic', icon: 'car-multiple', color: '#E5372B', spoken: 'Heavy traffic' },
  { value: 'accident', label: 'Crash', icon: 'car-emergency', color: '#DC2626', spoken: 'Crash' },
  { value: 'hazard', label: 'Hazard', icon: 'alert', color: '#F59E0B', spoken: 'Hazard' },
  { value: 'police', label: 'Police', icon: 'police-badge', color: '#2563EB', spoken: 'Police' },
  { value: 'closure', label: 'Closure', icon: 'road-variant', color: '#7C3AED', spoken: 'Road closure' },
  { value: 'construction', label: 'Roadwork', icon: 'cone', color: '#EA580C', spoken: 'Roadwork' },
  { value: 'disabled', label: 'Stalled car', icon: 'car-wrench', color: '#0891B2', spoken: 'Stalled vehicle' },
  { value: 'weather', label: 'Weather', icon: 'weather-pouring', color: '#0EA5E9', spoken: 'Bad weather' },
];

export function reportMeta(type: string) {
  return REPORT_TYPES.find((t) => t.value === type) ?? REPORT_TYPES[2];
}

export type RoadReport = {
  id: string;
  type: ReportType;
  lat: number;
  lng: number;
  created_at: string;
  expires_at: string;
  confirms: number;
  dismisses: number;
  mine: boolean;
  my_vote: boolean | null;
};

function angleDiff(a: number, b: number) {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

/** How far ahead to warn, scaled by speed (~45 s of driving, 300 m–1.5 km). */
export function alertDistance(speedMps: number) {
  return Math.min(1500, Math.max(300, speedMps * 45));
}

/**
 * Reports roughly ahead of the driver (within ±35° of heading and the alert distance),
 * nearest first. Without a reliable heading nothing counts as "ahead".
 */
export function reportsAhead(
  reports: RoadReport[],
  me: LngLat,
  heading: number | null,
  speedMps: number
): { report: RoadReport; distanceM: number }[] {
  if (heading == null || speedMps < 3) return [];
  const max = alertDistance(speedMps);
  return reports
    .map((r) => ({ report: r, distanceM: haversine(me, [r.lng, r.lat]) }))
    .filter(({ report, distanceM }) => distanceM <= max && distanceM > 20 && angleDiff(bearing(me, [report.lng, report.lat]), heading) <= 35)
    .sort((a, b) => a.distanceM - b.distanceM);
}
