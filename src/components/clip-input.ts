import { useMemo } from 'react';

import { CLIP_MIN_M, routeLength, trimClipRoute } from '@/lib/clip-route';
import { formatDistance, formatDuration, speedIn, speedUnitLabel } from '@/lib/geo';
import { hideZones } from '@/lib/privacy';
import { formatDayOrdinal } from '@/lib/time';
import { averageSpeedMps } from '@/lib/trip-recorder';
import { useAuth } from '@/store/auth';
import { useSettings } from '@/store/settings';
import { useTrips } from '@/store/trips';

/** What a clip shows for one saved drive. Everything that leaves the phone in the video comes from here. */
export function useClipDetails(id: string | undefined) {
  const trip = useTrips((s) => s.history.find((t) => t.id === id));
  const units = useSettings((s) => s.units);
  const privacyZones = useSettings((s) => s.privacyZones);
  const profile = useAuth((s) => s.profile);

  return useMemo(() => {
    if (!trip) return null;
    const unit = speedUnitLabel(units);
    const segments = trimClipRoute(hideZones(trip.path, privacyZones));
    return {
      tooShort: routeLength(segments) < CLIP_MIN_M,
      details: {
        segments,
        title: trip.name ?? formatDayOrdinal(trip.startedAt),
        subtitle: new Date(trip.startedAt).toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' }),
        stats: [
          { label: 'Distance', value: formatDistance(units, trip.distanceM) },
          { label: 'Time', value: formatDuration((trip.endedAt - trip.startedAt) / 1000) },
          { label: `Avg ${unit}`, value: String(Math.round(speedIn(units, averageSpeedMps(trip)))) },
        ],
        topSpeed: { value: String(Math.round(speedIn(units, trip.maxSpeedMps))), unit: unit.toUpperCase() },
        vehicle: trip.car?.body ?? profile?.vehicle,
        paint: trip.car?.paint ?? profile?.vehicle_color,
        flame: profile?.flame_style,
        trail: profile?.trail_style,
      },
    };
  }, [trip, units, privacyZones, profile]);
}

export type ClipDetails = NonNullable<ReturnType<typeof useClipDetails>>['details'];
