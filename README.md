# Convoy

Group drives, live location sharing and a real-time speedometer, for iOS and Android.

## What works (MVP)

| Feature | Notes |
|---|---|
| Live map + speedometer | MPH or km/h, GPS accuracy indicator, "signal lost" state |
| Trip recording | Time, distance, moving time, average and top speed, route. Works signed out and runs in the background |
| Trip history | Week/month/all-time totals, per-trip map, rename, notes, share, delete; backed up to your account when signed in |
| Search + routing | Address/place search, driving routes with alternatives, ETA |
| Accounts + profiles | Email/password, username, map color |
| Friends | Requests by username, accept/block/remove, time-boxed last-known location sharing (1h / 8h / 24h) |
| Group drives | Create, join by 6-character code, live shared map (~2s updates), member speed and distance, "fell behind" / "signal lost" / offline status, shared destination, pause sharing, leave/end |

Not built yet: turn-by-turn voice guidance, road reports, push notifications, automatic trip detection, live traffic.

## Stack (all free tiers)

| Need | Service | Cost |
|---|---|---|
| App | Expo SDK 58 + Expo Router, TypeScript, Zustand | Free |
| Map | MapLibre React Native + [OpenFreeMap](https://openfreemap.org) tiles | Free, no key |
| Search | [Photon](https://photon.komoot.io) (OpenStreetMap) | Free, fair-use |
| Routing | [OSRM](https://project-osrm.org) public server | Free, fair-use (demo server) |
| Backend | Supabase: Auth, Postgres with RLS, Realtime | Free tier (pauses after 7 idle days) |

Search and routing URLs are env vars, so moving to a self-hosted or paid instance is a config change (see `.env.example`).

**Before a public launch:** the public OSRM server is meant for light use only. Switch `EXPO_PUBLIC_OSRM_URL` to a self-hosted OSRM, OpenRouteService (free key, 2,000 routes/day), or a paid router. Supabase Pro ($25/mo) removes the idle pause.

**Store accounts:** Apple Developer $99/yr, Google Play $25 one-time.

## Running it

The map and background location are native modules, so this needs a **development build**. Expo Go won't work.

```bash
npm install
npx expo run:android      # Android Studio / emulator or USB device
npx expo run:ios          # macOS + Xcode only
```

No Mac? Build iOS in the cloud with EAS (free tier: limited builds/month):

```bash
npm install -g eas-cli
eas build --profile development --platform ios
```

After the first build, `npm start` serves JS changes to the installed dev app.

`npm run web` renders the UI in a browser for layout work. The map is a placeholder there, since MapLibre has no web renderer.

### Checks

```bash
npm test           # unit tests (trip math, convoy status)
npm run typecheck
```

### Supabase

The project is already provisioned. `.env` holds the public URL and publishable key (safe to ship; access control is enforced by row-level security). The schema lives in `supabase/migrations/`.

For quick testing, turn off **Authentication → Providers → Email → Confirm email** in the Supabase dashboard. The free tier only sends a few confirmation emails per hour. Turn it back on (with custom SMTP) before launch.

## Architecture

```
src/
  app/                 screens (Expo Router)
    (tabs)/            Drive, Convoy, Friends, Trips, Profile
    search.tsx         place search (route or group destination)
    trip/[id].tsx      trip detail
  components/          UI kit, speedometer, map (native + web placeholder)
  lib/
    location.ts        single owner of GPS: foreground watch vs background task
    trip-recorder.ts   pure trip math (filters jitter, glitches, gaps)  ← tested
    convoy.ts          member status / fell-behind logic                 ← tested
    places.ts          Photon search + OSRM routing
  store/               Zustand stores (trips, drive, friends, auth, nav, settings)
supabase/migrations/   database schema + RLS
```

**Location modes:** features register a reason (`map`, `trip`, `drive`) and `lib/location.ts` picks the cheapest GPS mode. GPS is off when nothing needs it, a foreground watch runs while a map is on screen, and background updates (with a persistent notification) run only during a trip or group drive.

**Privacy model:**
- Group positions go over a private Supabase Realtime channel (`drive:<id>`). RLS on `realtime.messages` limits it to drive members, and positions are never written to the database.
- Friends see one last-known row (`user_locations`), only while `share_until` is in the future, and the row is deleted when you stop sharing.
- Trips are private to their owner.
