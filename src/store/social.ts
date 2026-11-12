import { create } from 'zustand';

import { isDrivingNow, withLike } from '@/lib/feed';
import { notify } from '@/lib/notifications';
import { feed, type Activity } from '@/services/feed';
import { useNavigation } from '@/store/navigation';
import { useTrips } from '@/store/trips';

/** What this device knows about an activity that's newer than the list it was loaded in. */
type Overlay = { likedByMe: boolean; likeCount: number; commentCount: number };

type SocialState = {
  overlays: Record<string, Overlay>;
  /** activities unshared, removed or hidden by a block since they were loaded */
  gone: Record<string, true>;
  /** "I'm a passenger" for the drive in progress: unlocks the feed while moving */
  passenger: boolean;
  /** Like or unlike. Shows at once; put back if the server refuses. Returns an error to show, or null. */
  toggleLike: (activity: Activity) => Promise<string | null>;
  commentsChanged: (activity: Activity, delta: number) => void;
  hide: (activityId: string) => void;
  setPassenger: (passenger: boolean) => void;
};

/** The like state we last asked the server for, per activity, while a request is in the air. */
const inFlight = new Map<string, boolean>();

const base = (a: Activity, o?: Overlay): Overlay => o ?? { likedByMe: a.likedByMe, likeCount: a.likeCount, commentCount: a.commentCount };

export const useSocial = create<SocialState>()((set, get) => ({
  overlays: {},
  gone: {},
  passenger: false,

  toggleLike: async (activity) => {
    const id = activity.id;
    const before = base(activity, get().overlays[id]);
    const want = !before.likedByMe;
    set((s) => ({ overlays: { ...s.overlays, [id]: withLike(before, want) } }));
    // Tapped again before the first answer came back: the request already out will settle it.
    if (inFlight.has(id)) {
      inFlight.set(id, want);
      return null;
    }
    inFlight.set(id, want);
    let sent = want;
    for (;;) {
      const res = await feed.setLiked(id, sent);
      if (!res.ok) {
        inFlight.delete(id);
        // Back to what the server has: the state before this run of taps.
        set((s) => ({ overlays: { ...s.overlays, [id]: before } }));
        return res.error.message;
      }
      const latest = inFlight.get(id)!;
      if (latest === sent) break;
      sent = latest;
    }
    inFlight.delete(id);
    if (sent && !before.likedByMe) void notify({ type: 'activity_like', activity_id: id });
    return null;
  },

  commentsChanged: (activity, delta) =>
    set((s) => {
      const o = base(activity, s.overlays[activity.id]);
      return { overlays: { ...s.overlays, [activity.id]: { ...o, commentCount: Math.max(0, o.commentCount + delta) } } };
    }),

  hide: (activityId) => set((s) => ({ gone: { ...s.gone, [activityId]: true } })),

  setPassenger: (passenger) => set({ passenger }),
}));

/** An activity with this device's newer likes and comment counts applied. */
export function useLiveActivity(activity: Activity): Activity {
  const o = useSocial((s) => s.overlays[activity.id]);
  return o ? { ...activity, ...o } : activity;
}

/**
 * True while the feed, likes and comments should be closed because this person is driving:
 * navigating, or recording a drive and moving. See lib/feed isDrivingNow.
 */
export function useDrivingLock(): boolean {
  const navigating = useNavigation((s) => s.active);
  const recording = useTrips((s) => Boolean(s.active));
  const speedMps = useTrips((s) => s.lastSample?.speed);
  const passenger = useSocial((s) => s.passenger);
  return isDrivingNow({ navigating, recording, speedMps, passenger });
}
