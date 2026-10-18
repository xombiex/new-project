import { Platform } from 'react-native';

/**
 * Demo mode for App Store screenshots and the landing page: `?demo=<shot>` on the web app in
 * development builds only (never in production bundles). It fills the stores with sample people,
 * cars and drives so screens look lived-in without real accounts or network calls.
 */
export const DEMO: string | null =
  __DEV__ && Platform.OS === 'web' && typeof location !== 'undefined' ? new URLSearchParams(location.search).get('demo') : null;

export function isDemo() {
  return DEMO !== null;
}

/** A route up North Florida Ave, Tampa, used by several shots. */
export const DEMO_ROUTE: [number, number][] = Array.from({ length: 60 }, (_, i) => [-82.4572 - i * 0.00011 + Math.sin(i / 6) * 0.0003, 27.9445 + i * 0.00042]);

/** Dev web builds: expose stores to the browser console for testing (never in production). */
export async function exposeStoresForTesting() {
  if (!__DEV__ || Platform.OS !== 'web' || typeof window === 'undefined') return;
  const [{ useNav }, { useNavigation }, { useTrips }] = await Promise.all([import('@/store/nav'), import('@/store/navigation'), import('@/store/trips')]);
  (window as unknown as { __convoy: unknown }).__convoy = { useNav, useNavigation, useTrips };
}

/** Fill the stores. Called once from the root layout when demo mode is on. */
export async function seedDemo() {
  if (!DEMO) return;
  const [{ useSettings }, { usePro }, { useAuth }, { useGarage }, { useTrips }, { useDrive }, { useFriends }, { useCameras }] = await Promise.all([
    import('@/store/settings'),
    import('@/store/pro'),
    import('@/store/auth'),
    import('@/store/garage'),
    import('@/store/trips'),
    import('@/store/drive'),
    import('@/store/friends'),
    import('@/store/cameras'),
  ]);
  const params = new URLSearchParams(location.search);
  const theme = (params.get('theme') ?? 'auto') as 'auto' | 'neon' | 'blocks';
  const me = DEMO_ROUTE[40];

  useSettings.setState({ onboarded: true, units: 'imperial', mapTheme: theme, map3d: true, lastCoord: me, speedCameraAlerts: true, showAlprCameras: true });
  usePro.setState({ simulated: ['pro', 'cosmetics'] });

  const profile = { id: 'demo-me', username: 'alex', display_name: 'Alex', avatar_color: '#1E9BFF', vehicle: 'sport', vehicle_color: 'red', primary_car_id: 'car-1', leaderboard: true } as const;
  useAuth.setState({ ready: true, session: { user: { id: 'demo-me' } } as never, profile: profile as never, profileLoading: false });

  const now = new Date().toISOString();
  useGarage.setState({
    loaded: true,
    cars: [
      { id: 'car-1', user_id: 'demo-me', make: 'Porsche', model: '911 GT3 RS', year: 2024, nickname: null, body: 'sport', paint: 'red', created_at: now },
      { id: 'car-2', user_id: 'demo-me', make: 'Toyota', model: 'Tacoma', year: 2021, nickname: 'Trail rig', body: 'pickup', paint: 'white', created_at: now },
      { id: 'car-3', user_id: 'demo-me', make: 'Ford', model: 'Mustang', year: 1967, nickname: null, body: 'classic', paint: 'blue', created_at: now },
    ],
  });

  // A finished drive with speed detail (for the trip screen) plus some history for Stats.
  // City-street speeds (the ads should never show speeding).
  const speeds = DEMO_ROUTE.map((_, i) => 6 + 11 * Math.abs(Math.sin(i / 9)));
  const hist = new Array(26).fill(0);
  for (const s of speeds) hist[Math.min(25, Math.floor((s * 3.6) / 10))] += 9;
  const start = Date.now() - 3 * 3600_000;
  useTrips.setState({
    history: [
      {
        id: 'demo-trip',
        name: null,
        notes: null,
        startedAt: start,
        endedAt: start + 9 * 60_000,
        distanceM: 2_950,
        movingS: 8 * 60,
        maxSpeedMps: 17.4,
        path: DEMO_ROUTE,
        speeds,
        speedHist: hist,
        car: { label: '2024 Porsche 911 GT3 RS', body: 'sport', paint: 'red' },
        role: 'driver',
        synced: true,
      },
    ],
  });

  // Friends in a convoy around you, with live speeds.
  const friend = (id: string, name: string, color: string, vehicle: string, paint: string, k: number, speed: number, dLng = 0) => ({
    profile: { id, username: name.toLowerCase(), display_name: name, avatar_color: color, vehicle, vehicle_color: paint },
    position: { lat: DEMO_ROUTE[k][1], lng: DEMO_ROUTE[k][0] + dLng, heading: 340, speed, accuracy: 5, t: Date.now() },
    online: true,
  });
  if (DEMO === 'drive' || DEMO === 'neon' || DEMO === 'blocks') {
    useDrive.setState({
      drive: { id: 'demo-drive', code: 'TACO42', name: 'Taco run', owner_id: 'demo-me' } as never,
      status: 'live',
      members: {
        'f-1': friend('f-1', 'Abby', '#8E5CFF', 'suv', 'white', 46, 16.1),
        'f-2': friend('f-2', 'Marco', '#2DBE60', 'pickup', 'orange', 43, 13.9, 0.0011),
        'f-3': friend('f-3', 'Jess', '#FF8A00', 'hatch', 'yellow', 48, 12.1, -0.0006),
      } as never,
    });
  }

  useFriends.setState({
    friendships: [
      { other: { id: 'f-1', username: 'abby', display_name: 'Abby', avatar_color: '#8E5CFF', vehicle: 'suv', vehicle_color: 'white' }, status: 'accepted', outgoing: false },
      { other: { id: 'f-2', username: 'marco', display_name: 'Marco', avatar_color: '#2DBE60', vehicle: 'pickup', vehicle_color: 'orange' }, status: 'accepted', outgoing: true },
      { other: { id: 'f-3', username: 'jess', display_name: 'Jess', avatar_color: '#FF8A00', vehicle: 'hatch', vehicle_color: 'yellow' }, status: 'accepted', outgoing: false },
    ] as never,
    presence: { 'f-1': Date.now(), 'f-2': Date.now() - 2 * 3600_000, 'f-3': Date.now() - 60_000 },
  });

  if (DEMO === 'neon') {
    const cam = { id: 1, kind: 'alpr' as const, coord: DEMO_ROUTE[47], operator: 'Flock Safety' };
    useCameras.setState({ cameras: [cam], ahead: { camera: cam, distanceM: 290 } });
  }

  // Keep "you" moving gently so the speedometer and car stay live.
  let i = 36;
  const tick = () => {
    const [lng, lat] = DEMO_ROUTE[i];
    useTrips.setState({ lastSample: { lat, lng, speed: 14.3, heading: 340, accuracy: 4, timestamp: Date.now() } });
    i = Math.min(i + 1, 42);
  };
  tick();
  setInterval(tick, 1000);
  if (DEMO === 'drive' || DEMO === 'neon' || DEMO === 'blocks') {
    const { startTrip } = await import('@/lib/trip-recorder');
    useTrips.setState({ active: { ...startTrip(Date.now() - 12 * 60_000), distanceM: 7_400, movingS: 11 * 60, maxSpeedMps: 15.2 } });
  }
}

/** Leaderboard rows for the friends shot. */
export const DEMO_LEADERBOARD = [
  { user_id: 'f-2', display_name: 'Marco', avatar_color: '#2DBE60', distance_m: 312_000, drives: 14, drive_days: 6, is_me: false },
  { user_id: 'demo-me', display_name: 'Alex', avatar_color: '#1E9BFF', distance_m: 248_500, drives: 11, drive_days: 5, is_me: true },
  { user_id: 'f-1', display_name: 'Abby', avatar_color: '#8E5CFF', distance_m: 187_300, drives: 9, drive_days: 4, is_me: false },
  { user_id: 'f-3', display_name: 'Jess', avatar_color: '#FF8A00', distance_m: 96_400, drives: 6, drive_days: 3, is_me: false },
];
