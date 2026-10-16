# Convoy

Group drives, live location sharing, turn-by-turn navigation and a real-time speedometer, for iOS and Android.

## Features

| Area | What it does | Free / paid |
|---|---|---|
| Drive | Live map, big speedometer, trip recording, voice turn-by-turn navigation with rerouting | Free |
| Road reports | 2-tap reports (crash, hazard, police, closure…), map pins, still-there voting, spoken alerts ahead | Free |
| Drives | Heat-trail map of every drive, sort/filter, route thumbnails, trip detail | Free |
| Trip extras | Share cards (Night/Day free; Neon/Minimal Pro), replay (Pro), GPX export (Pro) | Mixed |
| Stats | Weekly chart, streaks, achievements (free); monthly/yearly charts + personal records (Pro) | Mixed |
| Friends | Requests, time-boxed last-known location sharing, privacy zones | Free |
| Group drives | Live shared map, fell-behind alerts, arrivals, invites by push. Hosts: 6 people free, 50 with Pro, 100 for club drives | Mixed |
| Clubs | Permanent clubs, scheduled events, RSVPs, one-tap club drives, event reminders, paid tickets | Clubs plan |
| Look | Light / dark / system, glow colors, map styles, vehicle icons | Style pack or Pro |
| Auto-detect | Optional: records drives automatically (low-power background location) | Free |
| Gear | Curated driving gear with affiliate links | Free |

Not included: live traffic (no legitimate free source; community reports cover incidents).

## Money

| Product | Suggested price | RevenueCat entitlement |
|---|---|---|
| Convoy Pro | $3.99 / month or $29.99 / year | `pro` (includes `cosmetics`) |
| Convoy Clubs | $14.99 / month | `club` (includes `pro`) |
| Style Pack | $2.99 one-time | `cosmetics` |
| Event tickets | Set by organizer | Stripe Connect, Convoy keeps `PLATFORM_FEE_PERCENT` (default 5%) |
| Gear | — | Amazon Associates commission |

Joining drives is always free, since every drive pulls in new users.

## Stack and running costs

| Need | Service | Cost |
|---|---|---|
| App | Expo SDK 58, Expo Router, TypeScript, Zustand | Free |
| Map | MapLibre + OpenFreeMap tiles | Free, no key |
| Search / routing | Photon / OSRM public servers | Free (fair use). Switch via env vars before launch |
| Backend | Supabase: Auth, Postgres + RLS, Realtime, Edge Functions, pg_cron | Free tier, then $25/mo Pro |
| Purchases | RevenueCat | Free until $2.5k/mo revenue |
| Push | Expo push service | Free |
| Tickets | Stripe Connect | Stripe fees per transaction |

## Running it

Background location, maps, purchases and push are native, so this needs a **development build**. Expo Go won't work.

```bash
npm install
npx expo run:android      # emulator or USB device
npx expo run:ios          # macOS + Xcode
```

No Mac: `npm i -g eas-cli && eas build --profile development --platform ios`.

`npm run web` renders the UI in a browser (real map via maplibre-gl, no GPS or purchases) for layout work.

```bash
npm test           # 47 unit tests: trip math, convoy, stats, navigation, reports, auto-detect, GPX, privacy
npm run typecheck
```

## Turning the paid / connected parts on

Everything works without these; each section lights up when its keys exist.

### 1. Push notifications
1. `eas init` (adds the EAS project id that push tokens need).
2. Android: `eas credentials` → add FCM V1 service account key. iOS: EAS sets up APNs during the build.

### 2. In-app purchases (RevenueCat)
1. Create the products in App Store Connect and Google Play (table above).
2. In RevenueCat: add both apps, create entitlements `pro`, `club`, `cosmetics`, and offerings `default` (Pro monthly + yearly), `clubs`, `cosmetics`.
3. Put the public SDK keys in `.env`: `EXPO_PUBLIC_REVENUECAT_IOS_KEY`, `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY`.
4. In Supabase → Edge Functions → Secrets add `REVENUECAT_SECRET_KEY` (RevenueCat secret API key) and `REVENUECAT_WEBHOOK_AUTH` (any long random string).
5. In RevenueCat → Integrations → Webhooks: URL `https://qdcdveoidmnwqnabfuvd.supabase.co/functions/v1/revenuecat-webhook`, Authorization header = the same random string.

In development builds, Profile → "Developer: simulate purchases" unlocks features locally without buying. Server-enforced limits still need a real purchase.

### 3. Paid event tickets (Stripe Connect)
1. Enable Connect (Express) in Stripe.
2. Supabase secrets: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, optional `PLATFORM_FEE_PERCENT`.
3. Stripe webhooks → endpoint `https://qdcdveoidmnwqnabfuvd.supabase.co/functions/v1/stripe`:
   - `checkout.session.completed` (your account)
   - `account.updated` (enable "Listen to events on connected accounts")

Club owners then tap "Set up payouts" on their club page. Refunds are handled in the Stripe dashboard.

### 4. Affiliate links
`EXPO_PUBLIC_AMAZON_TAG=yourtag-20` in `.env`. The disclosure line appears automatically.

### 5. Email confirmation
For testing, Supabase → Authentication → Email → turn off "Confirm email". Turn it back on with custom SMTP before launch.

## Architecture

```
src/
  app/                    screens (Expo Router)
    (tabs)/               Drive · Convoy · Friends · Drives · Stats
    profile, paywall, privacy-zones, share/[id], trip/[id], report, invite,
    club/new, club/[id], event/new, event/[id], gear, stripe-return
  components/             UI kit, glass panels, map (native + web), speedometer, charts, share card
  lib/
    location.ts           single GPS owner: off / foreground / precise background / low-power background
    trip-recorder.ts      trip math (jitter, glitches, gaps)                   ← tested
    navigation.ts         snapping, prompts, off-route, arrival                ← tested
    instructions.ts       OSRM steps → spoken English                          ← tested
    convoy.ts             fell-behind / signal-lost logic                      ← tested
    stats.ts, achievements.ts                                                  ← tested
    reports.ts            reports-ahead detection                              ← tested
    auto-trip.ts          drive start/stop detection                           ← tested
    gpx.ts, privacy.ts, replay.ts                                              ← tested
    purchases.ts          RevenueCat wrapper (web stub)
    notifications.ts      push registration, quiet-while-driving, notify()
    payments.ts           Stripe checkout / payouts via edge function
  store/                  Zustand stores
supabase/
  migrations/             schema, RLS, functions, cron
  functions/              revenuecat-webhook · notify · stripe
```

### Security model
- Every table has row-level security. Users read their own data, friends see shared locations, members see their drives and clubs.
- Anything that grants something (entitlements, paid tickets, report votes, club creation, drive size) is decided on the server: SQL functions or edge functions, never the client.
- Live group positions travel over private Realtime channels and are never stored. Road reports never expose who posted them.
- Edge functions verify callers (user JWT, RevenueCat auth header, Stripe signature, or a vault-stored cron secret) and validate every id.
