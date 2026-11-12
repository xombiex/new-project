import type { LngLat } from '@/lib/geo';

/**
 * Row shapes for the tables and functions the services read, written to match the migrations in
 * supabase/migrations. Kept by hand for now: the full generated file needs a Supabase login
 * (`npm run types:db`). When a column changes, change it here in the same commit.
 */

/** One row from the `activity_feed` function. */
export type ActivityRow = {
  id: string;
  user_id: string;
  username: string;
  display_name: string;
  avatar_color: string;
  /** null unless the activity is the caller's own */
  trip_id: string | null;
  to_friends: boolean;
  /** null unless the caller is in the club */
  club_id: string | null;
  club_name: string | null;
  title: string | null;
  started_at: string;
  distance_m: number;
  moving_s: number;
  car_label: string | null;
  car_body: string | null;
  car_paint: string | null;
  preview: LngLat[][];
  like_count: number;
  comment_count: number;
  liked_by_me: boolean;
  created_at: string;
};

/** One row from the `activity_comments_page` function. */
export type CommentRow = {
  id: string;
  activity_id: string;
  user_id: string;
  username: string;
  display_name: string;
  avatar_color: string;
  body: string;
  created_at: string;
};

/** `messages`: the inbox. Announcements from the team, and notices about likes and comments. */
export type MessageRow = {
  id: string;
  kind: 'announcement' | 'like' | 'comment';
  title: string;
  body: string;
  actor_id: string | null;
  activity_id: string | null;
  created_at: string;
  read_at: string | null;
};

export type ContentReportReason = 'spam' | 'harassment' | 'dangerous' | 'inappropriate' | 'other';
export type ContentReportKind = 'user' | 'activity' | 'comment';

/** `car_maintenance`: one job done on a car. */
export type MaintenanceRow = {
  id: string;
  car_id: string;
  user_id: string;
  kind: string;
  done_on: string;
  odometer_km: number | null;
  cost_cents: number | null;
  notes: string | null;
  created_at: string;
};

/** `car_fuel`: one fill-up. */
export type FuelRow = {
  id: string;
  car_id: string;
  user_id: string;
  filled_on: string;
  litres: number;
  cost_cents: number | null;
  odometer_km: number | null;
  full_tank: boolean;
  created_at: string;
};
