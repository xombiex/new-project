import { CLIP_MIN_M, routeLength, trimClipRoute } from '@/lib/clip-route';
import { previewForShare } from '@/lib/feed';
import type { LngLat } from '@/lib/geo';
import { hideZones, type PrivacyZone } from '@/lib/privacy';
import { useSettings } from '@/store/settings';
import { useTrips, type SavedTrip } from '@/store/trips';

import { feed, type Audience } from './feed';
import { fail, type Result } from './types';

/**
 * What of a drive's route is safe to show other people: privacy zones removed, 250 m cut from
 * each end, then thinned to a sketch. `tooShort` means nothing worth showing is left.
 */
export function sharedRoute(path: LngLat[], zones: PrivacyZone[]): { preview: LngLat[][]; tooShort: boolean } {
  const segments = trimClipRoute(hideZones(path, zones));
  if (routeLength(segments) < CLIP_MIN_M) return { preview: [], tooShort: true };
  return { preview: previewForShare(segments), tooShort: false };
}

/** Share one of this device's saved drives (or change who sees it). Uploads the drive first if it hasn't been yet. */
export async function shareDrive(trip: SavedTrip, audience: Audience): Promise<Result<{ id: string }>> {
  const { preview, tooShort } = sharedRoute(trip.path, useSettings.getState().privacyZones);
  if (tooShort) return fail('forbidden', "This drive is too short to share: once both ends are cut off for privacy, there's nothing left to show.");
  if (!trip.synced) {
    await useTrips.getState().syncPending();
    if (!useTrips.getState().history.find((t) => t.id === trip.id)?.synced) return fail('offline', "Couldn't save this drive to your account yet. Check your connection and try again.");
  }
  return feed.share({ tripId: trip.id, audience, title: trip.name, preview });
}

/** After a drive is saved: share it with friends if the person has turned that on. Quiet on failure. */
export async function autoShareIfOn(trip: SavedTrip): Promise<void> {
  if (!useSettings.getState().autoShare || trip.role === 'passenger') return;
  const res = await shareDrive(trip, { friends: true, clubId: null });
  if (!res.ok && res.error.kind !== 'forbidden' && res.error.kind !== 'auth') console.warn('Auto share failed', res.error.message);
}
