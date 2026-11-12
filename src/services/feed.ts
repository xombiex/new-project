import { isDemo } from '@/lib/demo';
import { decodeCursor, nextCursor } from '@/lib/feed';
import type { LngLat } from '@/lib/geo';
import { supabase } from '@/lib/supabase';

import type { ActivityRow, CommentRow } from './database.types';
import { classify, fail, ok, type Page, type ProfileSummary, type Result } from './types';

/** Who a shared drive is shown to. Not shared at all means there is no activity. */
export type Audience = { friends: boolean; clubId: string | null };

export type Activity = {
  id: string;
  author: ProfileSummary;
  /** the full drive behind it; only ever set on your own */
  tripId: string | null;
  audience: Audience;
  /** the club's name, when it was shared with a club you're in */
  clubName: string | null;
  title: string | null;
  startedAt: string;
  distanceM: number;
  movingS: number;
  car: { label: string; body: string; paint: string } | null;
  /** trimmed, thinned pieces of the route */
  preview: LngLat[][];
  likeCount: number;
  commentCount: number;
  likedByMe: boolean;
  createdAt: string;
};

export type Comment = { id: string; activityId: string; author: ProfileSummary; body: string; createdAt: string };

export type FeedScope = { kind: 'home' } | { kind: 'club'; clubId: string } | { kind: 'user'; userId: string };

export const FEED_PAGE = 15;
export const COMMENT_PAGE = 30;
export const COMMENT_MAX = 500;

export interface FeedService {
  list(scope: FeedScope, cursor: string | null): Promise<Result<Page<Activity>>>;
  get(activityId: string): Promise<Result<Activity>>;
  /** Share a drive, or change who an already-shared drive is shown to. */
  share(input: { tripId: string; audience: Audience; title: string | null; preview: LngLat[][] }): Promise<Result<{ id: string }>>;
  unshare(activityId: string): Promise<Result<void>>;
  /** The activity for one of my own drives, if it's shared. */
  forTrip(tripId: string): Promise<Result<{ id: string; audience: Audience } | null>>;
  setLiked(activityId: string, liked: boolean): Promise<Result<void>>;
  comments(activityId: string, cursor: string | null): Promise<Result<Page<Comment>>>;
  addComment(activityId: string, body: string): Promise<Result<Comment>>;
  deleteComment(commentId: string): Promise<Result<void>>;
}

export function activityFromRow(r: ActivityRow): Activity {
  return {
    id: r.id,
    author: { id: r.user_id, username: r.username, display_name: r.display_name, avatar_color: r.avatar_color },
    tripId: r.trip_id,
    audience: { friends: r.to_friends, clubId: r.club_id },
    clubName: r.club_name,
    title: r.title,
    startedAt: r.started_at,
    distanceM: r.distance_m,
    movingS: r.moving_s,
    car: r.car_label ? { label: r.car_label, body: r.car_body ?? 'car', paint: r.car_paint ?? 'blue' } : null,
    preview: Array.isArray(r.preview) ? r.preview : [],
    likeCount: r.like_count,
    commentCount: r.comment_count,
    likedByMe: r.liked_by_me,
    createdAt: r.created_at,
  };
}

export function commentFromRow(r: CommentRow): Comment {
  return {
    id: r.id,
    activityId: r.activity_id,
    author: { id: r.user_id, username: r.username, display_name: r.display_name, avatar_color: r.avatar_color },
    body: r.body,
    createdAt: r.created_at,
  };
}

async function myId() {
  const { data } = await supabase.auth.getSession();
  return data.session?.user.id ?? null;
}

/** Runs a query and turns anything that goes wrong, thrown or returned, into a Result. */
async function attempt<T>(run: () => Promise<Result<T>>): Promise<Result<T>> {
  try {
    return await run();
  } catch (e) {
    return { ok: false, error: classify(e) };
  }
}

const live: FeedService = {
  list: (scope, cursor) =>
    attempt(async () => {
      const at = decodeCursor(cursor);
      const { data, error } = await supabase.rpc('activity_feed', {
        p_scope: scope.kind,
        p_club: scope.kind === 'club' ? scope.clubId : null,
        p_user: scope.kind === 'user' ? scope.userId : null,
        p_activity: null,
        p_before: at?.before ?? null,
        p_before_id: at?.id ?? null,
        p_limit: FEED_PAGE,
      });
      if (error) return { ok: false, error: classify(error) };
      const rows = (data ?? []) as ActivityRow[];
      return ok({ items: rows.map(activityFromRow), nextCursor: nextCursor(rows, FEED_PAGE) });
    }),

  get: (activityId) =>
    attempt(async () => {
      const { data, error } = await supabase.rpc('activity_feed', { p_scope: 'one', p_activity: activityId, p_limit: 1 });
      if (error) return { ok: false, error: classify(error) };
      const row = ((data ?? []) as ActivityRow[])[0];
      return row ? ok(activityFromRow(row)) : fail('not-found', "That drive isn't shared any more.");
    }),

  share: ({ tripId, audience, title, preview }) =>
    attempt(async () => {
      const { data, error } = await supabase.rpc('share_trip', { p_trip: tripId, p_to_friends: audience.friends, p_club: audience.clubId, p_title: title, p_preview: preview });
      if (error) {
        if (error.message.includes('drive not found')) return fail('not-found', "This drive hasn't finished saving to your account yet. Try again in a moment.");
        if (error.message.includes('not a club member')) return fail('forbidden', "You're not in that club any more.");
        return { ok: false, error: classify(error) };
      }
      return ok({ id: (data as { id: string }).id });
    }),

  unshare: (activityId) =>
    attempt(async () => {
      const { error } = await supabase.from('activities').delete().eq('id', activityId);
      return error ? { ok: false, error: classify(error) } : ok(undefined);
    }),

  forTrip: (tripId) =>
    attempt(async () => {
      const { data, error } = await supabase.from('activities').select('id, to_friends, club_id').eq('trip_id', tripId).maybeSingle();
      if (error) return { ok: false, error: classify(error) };
      return ok(data ? { id: data.id as string, audience: { friends: data.to_friends as boolean, clubId: data.club_id as string | null } } : null);
    }),

  setLiked: (activityId, liked) =>
    attempt(async () => {
      const uid = await myId();
      if (!uid) return fail('auth', 'Sign in to like a drive.');
      const { error } = liked
        ? // Liking twice is not an error: the like is there either way.
          await supabase.from('activity_likes').upsert({ activity_id: activityId, user_id: uid }, { onConflict: 'activity_id,user_id', ignoreDuplicates: true })
        : await supabase.from('activity_likes').delete().eq('activity_id', activityId).eq('user_id', uid);
      return error ? { ok: false, error: classify(error) } : ok(undefined);
    }),

  comments: (activityId, cursor) =>
    attempt(async () => {
      const at = decodeCursor(cursor);
      const { data, error } = await supabase.rpc('activity_comments_page', { p_activity: activityId, p_before: at?.before ?? null, p_before_id: at?.id ?? null, p_limit: COMMENT_PAGE });
      if (error) return { ok: false, error: classify(error) };
      const rows = (data ?? []) as CommentRow[];
      return ok({ items: rows.map(commentFromRow), nextCursor: nextCursor(rows, COMMENT_PAGE) });
    }),

  addComment: (activityId, body) =>
    attempt(async () => {
      const text = body.trim();
      if (!text) return fail('forbidden', 'Write something first.');
      if (text.length > COMMENT_MAX) return fail('forbidden', `Comments can be up to ${COMMENT_MAX} characters.`);
      const { data: auth } = await supabase.auth.getSession();
      const uid = auth.session?.user.id;
      if (!uid) return fail('auth', 'Sign in to comment.');
      const { data, error } = await supabase.from('activity_comments').insert({ activity_id: activityId, user_id: uid, body: text }).select('id, activity_id, user_id, body, created_at').single();
      if (error) return { ok: false, error: classify(error) };
      const { data: me } = await supabase.from('profiles').select('username, display_name, avatar_color').eq('id', uid).single();
      return ok(commentFromRow({ ...(data as Omit<CommentRow, 'username' | 'display_name' | 'avatar_color'>), username: me?.username ?? '', display_name: me?.display_name ?? 'You', avatar_color: me?.avatar_color ?? '#3B82F6' }));
    }),

  deleteComment: (commentId) =>
    attempt(async () => {
      const { error } = await supabase.from('activity_comments').delete().eq('id', commentId);
      return error ? { ok: false, error: classify(error) } : ok(undefined);
    }),
};

let chosen: FeedService | null = null;

/** The real feed, or the in-memory sample one in the screenshot demo. Chosen on first use. */
function pick(): FeedService {
  // Required here, not imported at the top: the demo feed is only ever loaded in the demo.
  chosen ??= isDemo() ? (require('./feed.demo') as typeof import('./feed.demo')).demoFeed() : live;
  return chosen;
}

export const feed: FeedService = {
  list: (...a) => pick().list(...a),
  get: (...a) => pick().get(...a),
  share: (...a) => pick().share(...a),
  unshare: (...a) => pick().unshare(...a),
  forTrip: (...a) => pick().forTrip(...a),
  setLiked: (...a) => pick().setLiked(...a),
  comments: (...a) => pick().comments(...a),
  addComment: (...a) => pick().addComment(...a),
  deleteComment: (...a) => pick().deleteComment(...a),
};
