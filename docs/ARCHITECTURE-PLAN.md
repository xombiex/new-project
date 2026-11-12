# Convoy: architecture review and build plan

Written 2026-11-11 from a read of the repo at `651c40e` and the live Supabase project. Nothing in
this document has been implemented yet. It covers the five briefs: lead architect, social,
design, backend, and navigation.

Checked while writing: `tsc --noEmit` clean, `vitest` 155 tests in 30 files passing, Supabase
security and performance advisors, every RLS policy, every index.

---

## 1. Existing architecture

| Layer | What's there |
|---|---|
| App | Expo SDK 58, Expo Router, React Native 0.88, React Native Web. One codebase for iOS, Android and the website. |
| Screens | `src/app`: 5 tabs (map, convoy, friends, garage, stats) and 24 other routes. |
| State | 15 Zustand stores in `src/store`. Stores are also the data layer: they call Supabase directly. |
| Logic | `src/lib`: 60 pure modules, 30 with tests. No UI imports. |
| Map | MapLibre native on phones, maplibre-gl on web, three.js layer for 3D cars. Phones show the web map in a WebView for 3D, with a native fallback. |
| Backend | Supabase: 28 tables, all with RLS on. About 40 RPCs. 4 Edge Functions: `stripe`, `revenuecat-webhook`, `notify`, `cameras`. |
| Web extras | Vercel functions in `api/` (roads proxy, link previews), static pages in `web/`, admin portal in `admin/`. |
| Payments | Stripe on web, RevenueCat on phones, both writing the `entitlements` table through server-side webhooks. |
| Third parties | Photon (search), OSRM and Valhalla (routes), Overpass (roads, cameras), Open-Meteo and NWS (weather), Expo push. |

What is in good shape and should not be rewritten:

- Navigation maths (`lib/navigation.ts`): route snapping, next-turn distance, off-route test, arrival, voice prompts, lanes. Tested.
- Trip recording, stats, speed bands, privacy zones. Tested.
- Entitlements: clients can only read their own rows; only webhooks and admin RPCs write them.
- Admin RPCs: all 16 check for an admin inside the function.
- Push pipeline: tokens, per-type preferences, dedupe and per-sender rate limit in `notify`.

## 2. Feature inventory

Status against the briefs. "Have" means built and working, "Part" means some of it exists.

### Navigation brief

| Task | Status | Notes |
|---|---|---|
| Route calculation | Have | OSRM, with Valhalla for shortest and no-highways |
| Alternative routes | Have | Up to 3 alternatives, tagged fastest / shortest / fewest turns / twisty |
| Routing preferences | Have | `RouteMode` |
| Maneuver parsing | Have | `lib/instructions.ts`, including lanes |
| GPS-to-route matching | Have | `snap()` |
| Next-turn distance | Have | `progress()` |
| Deviation detection | Have | 3 fixes off route, accuracy-aware |
| Rerouting with debounce | Have | 10 s cooldown |
| Arrival detection | Have | 30 m |
| Hazard reports on map | Have | `road_reports`, votes, expiry |
| Provider abstraction | **Missing** | Photon, OSRM and Valhalla are called straight from `lib/places.ts`. Valhalla is made to answer in OSRM's format, and `OsrmStep` leaks into the navigation types. |
| Geocoding cache | **Missing** | Routes are cached 5 minutes; searches are not |
| Offline and failure states | Part | A failed reroute only logs a warning; the driver sees nothing |
| Provider fallback | **Missing** | One public server each; when it is down, routing is down |

### Social brief

| Task | Status | Notes |
|---|---|---|
| Friend requests | Have | Request, accept, remove |
| Blocking | Part | Only the person receiving a request can block, and it can be undone by the blocked person (see 3.1) |
| Clubs and membership | Have | Create, join by code, roles, events, paid tickets |
| Group drive interactions | Have | Roster, quick calls, regroup points |
| Notification preferences | Have | 5 toggles |
| Push notifications | Have | 7 types |
| Activity feed | **Missing** | Drives are visible only to their owner. There is nothing to feed from. |
| Likes and comments | **Missing** | |
| Following | **Missing** | Decision below: not building it |
| Club activity feed | **Missing** | |
| Cursor pagination | **Missing** | Drives load 1000 at once, inbox 100 |
| Reporting users or content | **Missing** | "Reports" today means road hazards |
| Driving lockout for social | **Missing** | |

### Backend brief

| Task | Status | Notes |
|---|---|---|
| Activity and GPS persistence | Have | `trips`, path and speeds stored as JSON on the row |
| Social relationships | Part | Friends only |
| Road reports and confirmations | Have | |
| Clubs, group drives | Have | |
| Notification records | Part | `messages` is an inbox for admin announcements only |
| Entitlement validation | Have | |
| Vehicle maintenance and fuel | **Missing** | |
| Likes, comments | **Missing** | |
| TypeScript database types | **Missing** | Row shapes are hand-written in each store |
| Security tests | **Missing** | No test exercises an RLS policy |

### Design brief

| Item | Status | Notes |
|---|---|---|
| Colour tokens | Have | `constants/theme.ts`, light and dark |
| Spacing and radius tokens | Have | |
| Type scale | **Missing** | 20 different font sizes set by hand, from 9 to 56 |
| Accessibility labels | Part | 66 labels across 92 pressable elements |
| Loading, empty, error states | Part | No shared component; each screen does its own or none |

## 3. Technical debt and risks

Ordered by how much they matter. **Status on 2026-11-12:** security items 1, 2 and 3 are fixed and
live (migrations `20261112000100` to `20261112000500`, checked by `supabase/tests/rls.sql`).
Item 4 is a dashboard switch still to be flipped. Phases 1 to 3 of section 7 are built; phase 4
(maintenance and fuel log, the design pass over existing screens) is not.

### 3.1 Security

1. **A blocked person can unblock themselves.** Blocking sets `friendships.status = 'blocked'`, but the
   policy "either side removes" lets the blocked requester delete that row and send a new request.
   Blocks also only work one way round. Fix: a separate `blocks` table that only the blocker can
   touch, checked by `are_friends`, friend requests, profile search and the feed.
2. **Drive join codes have no attempt limit.** `join_drive` takes a 6-character code and joining
   shows every member's live position. Fix: count failed attempts per user and lock out.
3. **No way to report a person or their content**, which the app stores require once there are
   comments.
4. Leaked-password protection is off in Supabase Auth. One switch in the dashboard.
5. Every signed-in user can read every profile row. Acceptable today (username, colours, car),
   but any private field added to `profiles` would leak. New private fields go in a separate table.

Not problems, despite the advisor listing them: the 40 "security definer" RPCs are the intended
API and check the caller; the 8 tables with RLS on and no policy are deliberately reachable only
through RPCs.

### 3.2 Structure

1. **Stores are the service layer.** Supabase calls sit inside Zustand stores, so they cannot be
   tested without a store and screens cannot share a query. New features get services in
   `src/services`; existing stores move over only when they are touched.
2. **Two screens over 550 lines** (`(tabs)/index.tsx` 774, `profile.tsx` 621, `convoy.tsx` 567)
   mix layout and logic. Three files call Supabase from UI: `profile.tsx`, `sign-in.tsx`,
   `leaderboard.tsx`.
3. **No generated database types**, so a renamed column fails at runtime instead of at build.
4. **Routing depends on free public servers** (`router.project-osrm.org`, `photon.komoot.io`)
   whose usage policies do not allow production apps at volume. This is a launch risk, not only
   a code-quality one.
5. `trips.path` as JSON means the feed cannot show a route preview without downloading the whole
   drive. Fix by storing a small preview line on the activity row, not by moving points to their
   own table.

### 3.3 Smaller

- Three foreign keys without an index, three unused indexes, two tables with overlapping read
  policies (advisor findings; cheap to fix in one migration).
- 20 Expo patch versions behind.
- Nothing has been run on a real phone since the WebView map and clips were added.

## 4. Decisions

- **No following.** Friends are mutual and gate live location. A one-way follow would mean a
  second privacy model for the same data. Friends plus clubs give the feed enough to show.
- **Drives stay private unless shared.** Existing drives are not exposed. Each drive gets a
  visibility of `private`, `friends` or `club`; the user picks a default once. Shared drives
  always have both ends trimmed and privacy zones removed, using the same code clips use.
- **Social is locked while driving.** Feed, comments and likes are unavailable while navigation
  or a recording is moving above walking pace. Notifications for likes and comments are held
  until the drive ends.
- **GPS points stay on the trip row.** No per-point table: it would multiply row counts by
  thousands for no feature that needs it.
- **No new dependencies** are needed for any of this.

## 5. Shared types and service contracts

New code goes through these. Files live in `src/services`; each has one Supabase implementation
and can be faked in tests.

```ts
// src/services/types.ts
export type Result<T> = { ok: true; data: T } | { ok: false; error: ServiceError };
export type ServiceError = { kind: 'offline' | 'auth' | 'forbidden' | 'not-found' | 'rate-limited' | 'server'; message: string };
export type Page<T> = { items: T[]; nextCursor: string | null };
export type Visibility = 'private' | 'friends' | 'club';

export type Activity = {
  id: string;
  author: ProfileSummary;
  tripId: string;
  visibility: Visibility;
  clubId: string | null;
  title: string | null;
  startedAt: string;
  distanceM: number;
  movingS: number;
  car: TripCar | null;
  preview: LngLat[];        // trimmed, simplified, at most 200 points
  likeCount: number;
  commentCount: number;
  likedByMe: boolean;
};

export type Comment = { id: string; activityId: string; author: ProfileSummary; body: string; createdAt: string };

export interface FeedService {
  friendsFeed(cursor: string | null, limit?: number): Promise<Result<Page<Activity>>>;
  clubFeed(clubId: string, cursor: string | null, limit?: number): Promise<Result<Page<Activity>>>;
  share(tripId: string, visibility: Visibility, clubId?: string): Promise<Result<Activity>>;
  unshare(activityId: string): Promise<Result<void>>;
  setLiked(activityId: string, liked: boolean): Promise<Result<void>>;
  comments(activityId: string, cursor: string | null): Promise<Result<Page<Comment>>>;
  addComment(activityId: string, body: string): Promise<Result<Comment>>;
  deleteComment(commentId: string): Promise<Result<void>>;
}

export interface SafetyService {
  block(userId: string): Promise<Result<void>>;
  unblock(userId: string): Promise<Result<void>>;
  blocked(): Promise<Result<ProfileSummary[]>>;
  report(target: { kind: 'user' | 'activity' | 'comment'; id: string }, reason: string): Promise<Result<void>>;
}
```

```ts
// src/services/routing.ts  (no OSRM names past this boundary)
export type Maneuver = { type: string; modifier?: string; location: LngLat; distanceM: number; durationS: number; roadName?: string; lanes?: Lane[] };
export type RoutePlan = { geometry: LngLat[]; distanceM: number; durationS: number; maneuvers: Maneuver[]; provider: string };
export type RoutePreference = 'fastest' | 'shortest' | 'no-highways';

export interface RoutingProvider {
  readonly name: string;
  readonly supports: readonly RoutePreference[];
  route(from: LngLat, to: LngLat, opts: { preference: RoutePreference; alternatives?: number; via?: LngLat[]; signal?: AbortSignal }): Promise<Result<RoutePlan[]>>;
}

export interface GeocodingProvider {
  readonly name: string;
  search(query: string, opts: { near?: LngLat; signal?: AbortSignal }): Promise<Result<Place[]>>;
}
```

`OsrmProvider`, `ValhallaProvider` and `PhotonProvider` wrap the existing fetches. A small
`withFallback(primary, secondary)` tries the second provider when the first fails. Twisty stays
where it is: it is a choice among returned routes, not a provider feature.

## 6. Database migration plan

Six migrations, each additive and safe to apply on its own. None changes or drops an existing
column.

| # | Migration | Contents |
|---|---|---|
| 1 | `safety_blocks` | `blocks(blocker_id, blocked_id)`, only the blocker reads or writes. `private.is_blocked(a, b)` either direction. `are_friends` and the friend-request insert policy check it. Existing `blocked` friendship rows are copied in. `join_drive` gets a failed-attempt counter. |
| 2 | `activities` | `activities(id, user_id, trip_id unique, visibility, club_id, title, started_at, distance_m, moving_s, car_*, preview jsonb, like_count, comment_count, created_at)`. Read policy: owner, or friend when `friends`, or club member when `club`, and never when blocked. Index `(user_id, created_at desc)` and `(club_id, created_at desc)`. RPC `share_trip` builds the row server-side from the caller's own trip. |
| 3 | `activity_social` | `activity_likes(activity_id, user_id)`, `activity_comments(id, activity_id, user_id, body ≤ 500, created_at)`. Readable only by people who can read the activity. Counts kept by trigger. Comment rate limit: 20 per 10 minutes. RPCs `friends_feed(cursor, limit)` and `club_feed(club, cursor, limit)` using keyset pagination on `(created_at, id)`. |
| 4 | `content_reports` | `content_reports(id, reporter_id, target_kind, target_id, reason, status, created_at)`, insert-only for users, 10 per day. `admin_list_content_reports`, `admin_resolve_content_report`, `admin_remove_comment`. |
| 5 | `garage_records` | `car_maintenance(id, car_id, user_id, kind, done_at, odometer_km, cost_cents, notes)` and `car_fuel(id, car_id, user_id, filled_at, litres, cost_cents, odometer_km, full_tank)`. Owner-only policies. |
| 6 | `advisor_cleanup` | The three missing indexes, drop the three unused ones, merge the overlapping read policies. Two new notification toggles: `likes`, `comments`. |

After migration 3: generate `src/services/database.types.ts` from the live schema and use it in
the new services.

Security tests: a script in `scripts/rls-tests` that signs in as three seeded test users
(friends A and B, stranger C) against a Supabase branch and asserts what each can and cannot
read or write. It covers private drives, friend-only drives, blocks in both directions, live
location, entitlements, and admin RPCs.

## 7. Work assignments

Four work streams matching the briefs. Order matters: each phase is reviewed, type-checked,
tested and checked on web before the next starts.

| Phase | Stream | Work | Depends on |
|---|---|---|---|
| 1 | Backend | Migrations 1 and 6, RLS test script, leaked-password switch (owner) | nothing |
| 1 | Navigation | Provider interfaces, wrap the three providers, fallback, search cache, visible "can't reach routing" and "offline" states, tests | nothing |
| 1 | Design | Type scale and tokens, shared `LoadingState` / `EmptyState` / `ErrorState`, screen audit with screenshots | nothing |
| 2 | Backend | Migrations 2, 3, 4, generated types | phase 1 backend |
| 2 | Social | `SafetyService`, block and report UI, blocked list in settings | migration 1 |
| 3 | Social | `FeedService`, feed tab, activity cards, likes and comments with optimistic updates, share sheet with privacy indicator, driving lockout, club feed | phase 2 |
| 3 | Backend | `notify` types for like and comment, held while the recipient is driving | phase 2 |
| 4 | Backend + Design | Migration 5, maintenance and fuel log in the garage | phase 1 design |
| 4 | Design | Apply tokens and state components to existing screens; split the three oversized screens; accessibility labels on every control | phase 3 |
| 4 | Social | Cursor pagination for the drives list and inbox | phase 1 |

The four streams in phase 1 do not touch the same files and can run in parallel. From phase 2
on, backend lands first.

## 8. Integration and testing

Every phase must pass all of these before it counts as done:

1. `npm run typecheck` and `npm test` clean.
2. New logic has unit tests; each service is tested against a fake and its error kinds.
3. RLS test script passes on a Supabase branch before a migration reaches production.
4. Supabase security advisor shows no new findings.
5. Web build runs and the changed screens are checked in a browser at phone and desktop widths, light and dark.
6. Each new screen shows a loading, an empty and an error state, each seen at least once.
7. Entry in `src/data/changelog.json` for anything users can see.

Known gap that this plan does not close: there is no automated test on a phone. The Android test
build has to be installed and checked by hand after phases 3 and 4.

A feature is reported as complete only when its tests have run and it has been seen working.
