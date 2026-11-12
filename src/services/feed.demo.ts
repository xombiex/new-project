import { nextCursor } from '@/lib/feed';
import type { LngLat } from '@/lib/geo';

import { COMMENT_PAGE, FEED_PAGE, type Activity, type Comment, type FeedService } from './feed';
import { fail, ok, type ProfileSummary } from './types';

/**
 * A feed that lives in memory. It backs the screenshot demo, and tests use it as a stand-in for
 * the server: same rules for paging, likes and comments, and it can be told to fail.
 */
export function createMemoryFeed(seed: { me: ProfileSummary; activities: Activity[]; comments?: Comment[] }) {
  let activities = [...seed.activities];
  let comments = [...(seed.comments ?? [])];
  let n = 0;
  const state = {
    /** make the next call fail, as if the connection dropped */
    failNext: false as boolean,
    calls: [] as string[],
  };
  const guard = (name: string) => {
    state.calls.push(name);
    if (state.failNext) {
      state.failNext = false;
      return fail('offline', "Can't reach Convoy. Check your connection and try again.");
    }
    return null;
  };
  const page = <T extends { id: string; createdAt: string }>(all: T[], cursor: string | null, size: number) => {
    const sorted = [...all].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
    const start = cursor ? sorted.findIndex((x) => `${x.createdAt}|${x.id}` === cursor) + 1 : 0;
    const items = sorted.slice(start, start + size);
    return { items, nextCursor: nextCursor(items.map((x) => ({ id: x.id, created_at: x.createdAt })), size) };
  };

  const service: FeedService = {
    list: async (scope, cursor) =>
      guard('list') ??
      ok(page(activities.filter((a) => (scope.kind === 'club' ? a.audience.clubId === scope.clubId : scope.kind === 'user' ? a.author.id === scope.userId : true)), cursor, FEED_PAGE)),
    get: async (id) => {
      const a = activities.find((x) => x.id === id);
      return guard('get') ?? (a ? ok(a) : fail('not-found', "That drive isn't shared any more."));
    },
    share: async ({ tripId, audience, title, preview }) => {
      const failed = guard('share');
      if (failed) return failed;
      const existing = activities.find((a) => a.tripId === tripId);
      const id = existing?.id ?? `demo-shared-${++n}`;
      const now = new Date().toISOString();
      const next: Activity = { ...(existing ?? { id, author: seed.me, tripId, clubName: null, startedAt: now, distanceM: 0, movingS: 0, car: null, likeCount: 0, commentCount: 0, likedByMe: false, createdAt: now }), audience, title, preview };
      activities = [next, ...activities.filter((a) => a.id !== id)];
      return ok({ id });
    },
    unshare: async (id) => {
      const failed = guard('unshare');
      if (failed) return failed;
      activities = activities.filter((a) => a.id !== id);
      return ok(undefined);
    },
    forTrip: async (tripId) => {
      const a = activities.find((x) => x.tripId === tripId);
      return guard('forTrip') ?? ok(a ? { id: a.id, audience: a.audience } : null);
    },
    setLiked: async (id, liked) => {
      const failed = guard(`setLiked:${liked}`);
      if (failed) return failed;
      activities = activities.map((a) => (a.id === id && a.likedByMe !== liked ? { ...a, likedByMe: liked, likeCount: a.likeCount + (liked ? 1 : -1) } : a));
      return ok(undefined);
    },
    comments: async (id, cursor) => guard('comments') ?? ok(page(comments.filter((c) => c.activityId === id), cursor, COMMENT_PAGE)),
    addComment: async (activityId, body) => {
      const failed = guard('addComment');
      if (failed) return failed;
      const c: Comment = { id: `demo-comment-${++n}`, activityId, author: seed.me, body: body.trim(), createdAt: new Date().toISOString() };
      comments = [c, ...comments];
      activities = activities.map((a) => (a.id === activityId ? { ...a, commentCount: a.commentCount + 1 } : a));
      return ok(c);
    },
    deleteComment: async (id) => {
      const failed = guard('deleteComment');
      if (failed) return failed;
      comments = comments.filter((c) => c.id !== id);
      return ok(undefined);
    },
  };
  return { service, state, snapshot: () => ({ activities, comments }) };
}

const wiggle = (lng: number, lat: number, n: number, bend: number): LngLat[] => Array.from({ length: n }, (_, i) => [lng + i * 0.004 + Math.sin(i / bend) * 0.012, lat + i * 0.0025 + Math.cos(i / (bend * 1.7)) * 0.01]);

const hoursAgo = (h: number) => new Date(Date.now() - h * 3600_000).toISOString();

/** Sample feed for the screenshot demo (`?demo=…` in development). */
export function demoFeed(): FeedService {
  const me: ProfileSummary = { id: 'demo-me', username: 'alex', display_name: 'Alex', avatar_color: '#1E9BFF' };
  const marco: ProfileSummary = { id: 'demo-marco', username: 'marco', display_name: 'Marco', avatar_color: '#22C55E' };
  const abby: ProfileSummary = { id: 'demo-abby', username: 'abby', display_name: 'Abby', avatar_color: '#A855F7' };
  const jo: ProfileSummary = { id: 'demo-jo', username: 'jo', display_name: 'Jo', avatar_color: '#F59E0B' };
  const make = (id: string, author: ProfileSummary, h: number, title: string | null, km: number, min: number, car: Activity['car'], bend: number, likes: number, commentCount: number, extra: Partial<Activity> = {}): Activity => ({
    id,
    author,
    tripId: author.id === me.id ? 'trip-1' : null,
    audience: { friends: true, clubId: null },
    clubName: null,
    title,
    startedAt: hoursAgo(h + 1),
    distanceM: km * 1000,
    movingS: min * 60,
    car,
    preview: [wiggle(-82.6, 27.9, 60, bend)],
    likeCount: likes,
    commentCount,
    likedByMe: false,
    createdAt: hoursAgo(h),
    ...extra,
  });
  return createMemoryFeed({
    me,
    activities: [
      make('demo-a1', marco, 2, 'Skyway at sunrise', 68.4, 52, { label: '2024 Porsche 911 GT3 RS', body: 'super', paint: 'blue' }, 5, 4, 2, { likedByMe: true }),
      make('demo-a2', abby, 9, 'Back roads to Brooksville', 112.2, 104, { label: '1994 Mazda Miata', body: 'classic', paint: 'red' }, 3, 7, 1, { audience: { friends: false, clubId: 'demo-club' }, clubName: 'Bay Area Touge' }),
      make('demo-a3', me, 26, null, 23.5, 31, { label: '2021 Toyota Tacoma', body: 'pickup', paint: 'silver' }, 8, 2, 0),
      make('demo-a4', jo, 50, 'Coffee run, long way round', 41.0, 47, null, 4, 0, 0),
    ],
    comments: [
      { id: 'demo-c1', activityId: 'demo-a1', author: abby, body: 'That bridge at sunrise is unreal. Next time wake me up.', createdAt: hoursAgo(1.5) },
      { id: 'demo-c2', activityId: 'demo-a1', author: jo, body: 'How was traffic on the way back?', createdAt: hoursAgo(1) },
      { id: 'demo-c3', activityId: 'demo-a2', author: marco, body: 'Saving this route.', createdAt: hoursAgo(8) },
    ],
  }).service;
}
