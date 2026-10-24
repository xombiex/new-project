import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View, useWindowDimensions, Platform, Share } from 'react-native';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { convoyStop, ConvoyRoster, rosterEntries } from '@/components/drive/convoy-roster';
import { GasChooser, NavBanner, NavFooter, RouteChooser } from '@/components/drive/nav-overlay';
import { QuickCallBanner, QuickCallButton } from '@/components/drive/quick-calls';
import { PlaceCard } from '@/components/drive/place-card';
import { SpeedDial } from '@/components/drive/speed-dial';
import { SpeedLimitSign } from '@/components/drive/speed-limit-sign';
import { Glass } from '@/components/glass';
import { LocationPrompt } from '@/components/location-prompt';
import { ConvoyMap, type MapLine, type MapMarker, type MapPerson } from '@/components/map/convoy-map';
import { useMapLook } from '@/components/map/use-map-look';
import { Speedometer } from '@/components/speedometer';
import { ThemedText } from '@/components/themed-text';
import { Button, Stat } from '@/components/ui';
import { BottomTabInset, Radius, Spacing } from '@/constants/theme';
import { useNwsAlert } from '@/hooks/use-nws-alert';
import { useRouteWeather } from '@/hooks/use-route-weather';
import { useSpeedLimit } from '@/hooks/use-speed-limit';
import { useTheme } from '@/hooks/use-theme';
import { CAMERA_COLOR, CAMERA_LABEL, type Camera } from '@/lib/cameras';
import { formatDistance, formatDuration, speedIn, speedLabel, speedUnitLabel, haversine } from '@/lib/geo';
import { addReason, removeReason } from '@/lib/location';
import { useCompassHeading } from '@/lib/compass';
import { haptic } from '@/lib/haptics';
import { followPitch, followZoom, splitRoute } from '@/lib/nav-camera';
import { getRouteOptions, type Route } from '@/lib/places';
import { reportMeta } from '@/lib/reports';
import { limitMps } from '@/lib/speed-limit';
import { formatAgo } from '@/lib/time';
import { averageSpeedMps } from '@/lib/trip-recorder';
import { vehicleIcon } from '@/lib/vehicles';
import { gasAlong, type GasStop } from '@/lib/gas-along';
import { NWS_COLOR, nwsIcon, type NwsAlert } from '@/lib/nws-alerts';
import { describeAlert, WEATHER_ICON } from '@/lib/weather';
import { useAuth } from '@/store/auth';
import { useCameras } from '@/store/cameras';
import { groupStop, useDrive } from '@/store/drive';
import { useNav } from '@/store/nav';
import { useNavigation } from '@/store/navigation';
import { useReports } from '@/store/reports';
import { useSettings } from '@/store/settings';
import { useTrips } from '@/store/trips';

/** A fix older than this means we've lost GPS (tunnel, parking garage). */
const STALE_MS = 10_000;
/** Members who haven't reported in this long are drawn dimmed. */
const MEMBER_STALE_MS = 60_000;

const KEEP_AWAKE_TAG = 'convoy-drive';

/**
 * Screen stays on during a trip. Not `useKeepAwake`: on the web its cleanup throws if the wake
 * lock hadn't been granted yet (e.g. leaving the tab right away), surfacing as an uncaught error.
 */
function KeepAwake() {
  useEffect(() => {
    void activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => {});
    return () => {
      void Promise.resolve()
        .then(() => deactivateKeepAwake(KEEP_AWAKE_TAG))
        .catch(() => {});
    };
  }, []);
  return null;
}

export default function DriveScreen() {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { units, keepScreenOn } = useSettings();
  const { active, lastSample, start, finish, discard } = useTrips();
  const nav = useNav();
  const navigating = useNavigation((s) => s.active);
  const navRoute = useNavigation((s) => s.route);
  const navProgress = useNavigation((s) => s.progress);
  const navDestination = useNavigation((s) => s.destination);
  const via = useNavigation((s) => s.via);
  const muted = useNavigation((s) => s.muted);
  /** Gas-ahead list (null = closed; stops null = loading). */
  const [gas, setGas] = useState<{ stops: GasStop[] | null; error: string | null } | null>(null);
  /** Mid-drive route picker (null = closed; routes null = loading). */
  const [choosing, setChoosing] = useState<{ routes: Route[] | null; error: string | null } | null>(null);
  useEffect(() => {
    if (!navigating) {
      setChoosing(null);
      setGas(null);
    }
  }, [navigating]);
  const reports = useReports((s) => s.reports);
  const allCameras = useCameras((s) => s.cameras);
  const cameraAheadNow = useCameras((s) => s.ahead);
  const cameraPrompt = useCameras((s) => s.prompt);
  const speedCameraAlerts = useSettings((s) => s.speedCameraAlerts);
  const showAlprCameras = useSettings((s) => s.showAlprCameras);
  const map3d = useSettings((s) => s.map3d);
  const themeVariant = useMapLook().variant;
  const cameras = useMemo(
    () => allCameras.filter((c) => (c.kind === 'speed' ? speedCameraAlerts : showAlprCameras)),
    [allCameras, speedCameraAlerts, showAlprCameras]
  );
  const drive = useDrive((s) => s.drive);
  /** The convoy's current stop: the regroup point, else the destination. */
  const regroup = groupStop(drive);
  const members = useDrive((s) => s.members);
  const myId = useAuth((s) => s.session?.user.id);
  const myVehicle = useAuth((s) => s.profile?.vehicle);
  const myPaint = useAuth((s) => s.profile?.vehicle_color);
  const [now, setNow] = useState(Date.now());

  // GPS on while this tab is visible; trips/drives/navigation keep it on in the background separately.
  useFocusEffect(
    useCallback(() => {
      void addReason('map');
      return () => void removeReason('map');
    }, [])
  );

  // Tick once a second for the trip clock and GPS staleness.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const stale = !lastSample || now - lastSample.timestamp > STALE_MS;

  const lines = useMemo<MapLine[]>(() => {
    const out: MapLine[] = [];
    if (navRoute && navProgress?.arrived) {
      // Arrived: nothing left to follow.
    } else if (navRoute) {
      // Road already driven fades to grey; the road ahead is the blue route.
      const { driven, ahead } = splitRoute(navRoute.geometry, navRoute.cumulative, navProgress?.snap.segment ?? 0, navProgress?.snap.along ?? 0);
      if (driven.length > 1) out.push({ id: 'nav-driven', coords: driven, color: '#8E959E', width: 7, opacity: 0.6 });
      out.push({ id: 'nav', coords: ahead, color: theme.accent, width: 8, variant: 'route' });
    } else {
      nav.routes.forEach((r, i) => {
        if (i !== nav.selected) out.push({ id: `alt-${i}`, coords: r.geometry, color: '#8FB8E8', width: 6, opacity: 0.7 });
      });
      const sel = nav.routes[nav.selected];
      if (sel) out.push({ id: 'route', coords: sel.geometry, color: theme.accent, width: 7, variant: 'route' });
    }
    // Choosing a new route mid-drive: show the options too.
    choosing?.routes?.forEach((r, i) => out.push({ id: `choice-${i}`, coords: r.geometry, color: '#8FB8E8', width: 6, opacity: 0.8 }));
    if (active && active.path.length > 1) out.push({ id: 'trip', coords: active.path, color: theme.speed, width: 3, variant: 'glow' });
    return out;
  }, [navRoute, navProgress?.snap.segment, navProgress?.snap.along, navProgress?.arrived, nav.routes, nav.selected, active, theme, choosing]);

  const people = useMemo<MapPerson[]>(
    () =>
      Object.entries(members)
        .filter(([id, m]) => id !== myId && m.position)
        .map(([id, m]) => ({
          id,
          name: m.profile.display_name,
          color: m.profile.avatar_color,
          coord: [m.position!.lng, m.position!.lat],
          heading: m.position!.heading,
          icon: vehicleIcon(m.profile.vehicle),
          vehicle: m.profile.vehicle,
          paint: m.profile.vehicle_color,
          label: speedLabel(units, m.position!.speed, !m.online || now - m.position!.t > MEMBER_STALE_MS),
          stale: !m.online || now - m.position!.t > MEMBER_STALE_MS,
        })),
    [members, myId, now]
  );

  const markers = useMemo<MapMarker[]>(
    () => [
      ...reports.map((r) => {
        const meta = reportMeta(r.type);
        return { id: r.id, coord: [r.lng, r.lat] as [number, number], icon: meta.icon, color: meta.color, onPress: () => onPressReport(r.id) };
      }),
      // A gas stop added on the way.
      ...(via ? [{ id: 'via-stop', coord: via.coord, icon: 'gas-station', color: '#0A84FF' }] : []),
    ],
    // onPressReport reads fresh state itself
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [reports, via]
  );

  const route = nav.routes[nav.selected];

  function onPressCamera(c: Camera) {
    const facing = c.direction != null ? `Faces ${compassPoint(c.direction)}` : null;
    const away = lastSample ? `${formatDistance(units, haversine([lastSample.lng, lastSample.lat], c.coord))} away` : null;
    const enforces = c.kind !== 'alpr' && c.maxspeed ? `Enforces ${c.maxspeed}${/^\d+$/.test(c.maxspeed) ? (units === 'imperial' ? ' mph' : ' km/h') : ''}` : null;
    const by = c.kind === 'alpr' && c.operator ? `Operated by ${c.operator}` : null;
    const vote = (present: boolean) => void useCameras.getState().vote(c, present);
    if (c.source === 'community' && c.status === 'pending') {
      const lines = [away, 'Reported by a Convoy driver, not confirmed yet.', c.mine ? 'You reported this one.' : null];
      Alert.alert(`${CAMERA_LABEL[c.kind]}?`, lines.filter(Boolean).join('\n'), [
        { text: 'Close', style: 'cancel' },
        c.mine ? { text: 'Take it back', style: 'destructive', onPress: () => vote(false) } : { text: 'Not there', style: 'destructive', onPress: () => vote(false) },
        ...(c.mine ? [] : [{ text: 'It’s there', onPress: () => vote(true) }]),
      ]);
      return;
    }
    const watches = c.source === 'community' && c.direction != null ? `Watches traffic heading ${compassPoint(c.direction)}` : facing;
    const source = c.source === 'community' ? 'Confirmed by Convoy drivers.' : 'Location from OpenStreetMap (may be out of date).';
    Alert.alert(CAMERA_LABEL[c.kind], [away, enforces, watches, by, source].filter(Boolean).join('\n'), [
      { text: 'Close', style: 'cancel' },
      { text: 'It’s gone', style: 'destructive', onPress: () => vote(false) },
      { text: 'Still here', onPress: () => vote(true) },
    ]);
  }

  function onPressReport(id: string) {
    const r = useReports.getState().reports.find((x) => x.id === id);
    if (!r) return;
    const meta = reportMeta(r.type);
    const detail = `Reported ${formatAgo(Date.parse(r.created_at))}${r.confirms ? ` · ${r.confirms} confirmed` : ''}`;
    if (r.mine) {
      Alert.alert(meta.label, `${detail}\n\nYou reported this.`, [
        { text: 'Close', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: () => void useReports.getState().vote(r.id, false) },
      ]);
      return;
    }
    Alert.alert(`${meta.label}: still there?`, detail, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Not there', onPress: () => void useReports.getState().vote(r.id, false) },
      { text: 'Still there', onPress: () => void useReports.getState().vote(r.id, true) },
    ]);
  }

  async function onStart() {
    start();
    haptic.success();
    await addReason('trip');
  }

  async function onGo() {
    if (!route || !nav.destination) return;
    // Navigated drives are recorded too, so they show up in Drives and Stats.
    if (!active) await onStart();
    await useNavigation.getState().start(route, nav.destination);
  }

  /** Mid-drive "change route": fresh options from where you are to the same destination. */
  async function openRoutes() {
    const dest = useNavigation.getState().destination;
    if (!dest || !lastSample) return;
    setGas(null);
    setChoosing({ routes: null, error: null });
    try {
      const routes = await getRouteOptions([lastSample.lng, lastSample.lat], dest.coord);
      setChoosing((c) => (c ? { routes, error: null } : c));
    } catch (e) {
      setChoosing((c) => (c ? { routes: null, error: e instanceof Error ? e.message : 'Couldn’t find routes' } : c));
    }
  }

  /** Gas stations near the road ahead. */
  async function openGas() {
    setChoosing(null);
    const nav = useNavigation.getState();
    if (!nav.route) return;
    setGas({ stops: null, error: null });
    try {
      const stops = await gasAlong(nav.route, nav.progress?.snap.along ?? 0, nav.progress?.snap.segment ?? 0);
      setGas((g) => (g ? { stops, error: null } : g));
    } catch (e) {
      setGas((g) => (g ? { stops: null, error: e instanceof Error ? e.message : 'Couldn’t look for gas' } : g));
    }
  }

  /** Share a live link to this drive: the share sheet on phones, else copy the link. */
  async function shareEta() {
    const res = await useNavigation.getState().shareEta();
    if ('error' in res) {
      Alert.alert('Couldn’t share', res.error);
      return;
    }
    const dest = useNavigation.getState().destination?.name ?? 'my destination';
    const message = `I'm driving to ${dest}. Follow along live and see when I'll get there: ${res.url}`;
    try {
      if (Platform.OS === 'web') {
        if (typeof navigator.share === 'function') await navigator.share({ title: 'My ETA', text: message, url: res.url });
        else {
          await Clipboard.setStringAsync(res.url);
          Alert.alert('Link copied', 'Paste it into a message. It updates live until you arrive.');
        }
      } else await Share.share({ message });
    } catch {
      // closed the share sheet
    }
  }

  async function onFinish() {
    if (useNavigation.getState().active) await useNavigation.getState().stop();
    else nav.clear();
    await removeReason('trip');
    const trip = finish();
    if (trip) haptic.success();
    if (trip) router.push({ pathname: '/trip/[id]', params: { id: trip.id, fresh: '1' } });
    else Alert.alert('Trip too short', 'Trips under 50 m are not saved.');
  }

  function onDiscard() {
    Alert.alert('Discard trip?', 'This recording will be deleted.', [
      { text: 'Keep recording', style: 'cancel' },
      {
        text: 'Discard',
        style: 'destructive',
        onPress: () => {
          discard();
          void useNavigation.getState().stop();
          void removeReason('trip');
        },
      },
    ]);
  }

  const elapsed = active ? (now - active.startedAt) / 1000 : 0;
  const placeOpen = !navigating && Boolean(nav.destination);
  const panelHeight = navigating ? (choosing || gas ? 330 : 128) : placeOpen ? 400 : active ? 330 : 270;
  // Map faces the way you're driving; standing still, the compass (web) takes over.
  const compass = useCompassHeading();
  const speedNow = !stale && lastSample?.speed != null && lastSample.speed >= 0 ? lastSample.speed : 0;
  const headingNow = speedNow > 2 && lastSample?.heading != null ? lastSample.heading : (compass ?? lastSample?.heading ?? null);
  const followCamera = {
    zoom: followZoom(speedNow, navigating ? (navProgress?.toNextM ?? null) : null),
    pitch: followPitch(navigating, map3d),
    heading: headingNow,
  };

  // Group drive: everyone down the left side, with speed and distance to the stop.
  const { height: windowH } = useWindowDimensions();
  // The screen's own height: on web the tab bar sits below it rather than over it.
  const [screenH, setScreenH] = useState(windowH);
  const stop = drive ? convoyStop(drive) : null;
  const roster = useMemo(
    () =>
      drive
        ? rosterEntries(members, myId ?? null, lastSample && !stale ? { coord: [lastSample.lng, lastSample.lat], speed: lastSample.speed } : null, stop?.coord ?? null, now)
        : [],
    // `now` ticks every second; the list only needs to refresh every few.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [drive, members, myId, lastSample?.timestamp, stale, stop?.coord.join(), Math.floor(now / 3000)]
  );

    // Rain, snow or storms on the road ahead (or on the route option you're looking at).
  const weather = useRouteWeather(navigating ? navRoute : null, navProgress, navigating ? undefined : route);
  // National Weather Service warnings where you are (and where you're headed).
  const nws = useNwsAlert(lastSample ? [lastSample.lng, lastSample.lat] : null, navigating ? (navDestination?.coord ?? null) : null);
  const rosterTop =
    insets.top + (navigating ? 190 : 80 + (drive ? 48 : 0) + (regroup ? 48 : 0)) + (cameraAheadNow || (navigating && weather) ? 48 : 0) + (nws ? 48 : 0);
  // 150 for the speed dial + its sign, 28 for the roster's own header above the list.
  const rosterMax = screenH - rosterTop - (panelHeight + BottomTabInset + 150 + 28);

  // Posted limit while a ride is on (recording a trip or navigating).
  const road = useSpeedLimit(Boolean(active || navigating));
  const speedLimit = road.limit;
  const speeding = Boolean(speedLimit && !stale && lastSample?.speed != null && lastSample.speed > limitMps(speedLimit) + 1.5);
  // One buzz when you go over, not a constant rattle.
  useEffect(() => {
    if (speeding) haptic.warning();
  }, [speeding]);

  /** The full warning from the forecasters, with a shortcut to the radar. */
  function showNws(a: NwsAlert) {
    // NWS text is hard-wrapped at ~70 columns: join the lines, keep the paragraphs.
    const body = (a.instruction || a.description)
      .split(/\n{2,}/)
      .map((p) => p.replace(/\s*\n\s*/g, ' ').trim())
      .join('\n\n')
      .slice(0, 700);
    const until = a.ends ? `Until ${new Date(a.ends).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' })}. ` : '';
    const radarOn = useSettings.getState().radar;
    Alert.alert(a.event, `${until}${a.areaDesc}\n\n${body}\n\nNational Weather Service`, [
      ...(radarOn ? [] : [{ text: 'Show radar', onPress: () => useSettings.getState().setRadar(true) }]),
      { text: 'OK', style: 'cancel' as const },
    ]);
  }

  // Heads-ups that stack under the top bar: convoy calls, a camera coming up, bad weather ahead.
  const alerts = (
      <View style={styles.alerts} pointerEvents="box-none">
        {drive ? <QuickCallBanner /> : null}
        {cameraAheadNow ? (
          <View style={[styles.cameraPill, { backgroundColor: CAMERA_COLOR[cameraAheadNow.camera.kind] }]}>
            <MaterialCommunityIcons name={CAMERA_ICON[cameraAheadNow.camera.kind]} size={18} color="#fff" />
            <ThemedText style={styles.cameraText}>
              {cameraAheadNow.camera.kind === 'alpr'
                ? (cameraAheadNow.camera.operator ?? CAMERA_LABEL.alpr)
                : `${CAMERA_LABEL[cameraAheadNow.camera.kind]}${cameraAheadNow.camera.maxspeed ? ` · ${cameraAheadNow.camera.maxspeed}` : ''}`}{' '}
              · {formatDistance(units, cameraAheadNow.distanceM)}
            </ThemedText>
          </View>
        ) : null}
        {navigating && weather ? (
          <Animated.View entering={FadeInDown.duration(250)} style={[styles.cameraPill, { backgroundColor: '#2F6FED' }]}>
            <MaterialCommunityIcons name={WEATHER_ICON[weather.kind] as 'weather-rainy'} size={18} color="#fff" />
            <ThemedText style={[styles.cameraText, { flexShrink: 1 }]} numberOfLines={1}>
              {describeAlert(weather)}
            </ThemedText>
          </Animated.View>
        ) : null}
        {nws ? (
          // The width cap goes on the pressable: a % width inside a shrink-wrapped parent squeezes the pill.
          <Pressable onPress={() => showNws(nws)} accessibilityRole="button" accessibilityHint="Shows the full weather warning" style={{ maxWidth: '94%' }}>
            <Animated.View entering={FadeInDown.duration(250)} style={[styles.cameraPill, { backgroundColor: NWS_COLOR[nws.severity], maxWidth: '100%' }]}>
              <MaterialCommunityIcons name={nwsIcon(nws.event) as 'alert'} size={18} color="#fff" />
              <ThemedText style={[styles.cameraText, { flexShrink: 1 }]} numberOfLines={1}>
                {nws.event}
                {nws.where === 'destination' ? ' at your destination' : ''}
              </ThemedText>
              <MaterialCommunityIcons name="chevron-right" size={18} color="#fff" />
            </Animated.View>
          </Pressable>
        ) : null}
      </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }} onLayout={(e) => setScreenH(e.nativeEvent.layout.height)}>
      {keepScreenOn && (active || navigating) ? <KeepAwake /> : null}

      <ConvoyMap
        style={StyleSheet.absoluteFill}
        // Looking at a place: show the whole route. Otherwise keep following you.
        follow={!placeOpen}
        cameras={cameras}
        onPressCamera={onPressCamera}
        tilt3d={map3d}
        camera={followCamera}
        me={lastSample ? { coord: [lastSample.lng, lastSample.lat], heading: headingNow, vehicle: myVehicle, paint: myPaint } : null}
        lines={lines}
        people={people}
        markers={markers}
        destination={(navigating ? navDestination : nav.destination)?.coord}
        fit={!navigating && route ? { key: `${nav.destination?.id}-${nav.selected}`, points: route.geometry } : null}
        padding={{ top: insets.top + (navigating ? 150 : 80), bottom: panelHeight + BottomTabInset }}
      />

      {navigating ? (
        <NavBanner units={units} top={insets.top + Spacing.two}>
          {alerts}
        </NavBanner>
      ) : (
        <View style={[styles.top, { paddingTop: insets.top + Spacing.two }]} pointerEvents="box-none">
          {(
            <Pressable
              onPress={() => router.push({ pathname: '/search', params: { purpose: 'route' } })}
              accessibilityRole="search"
              style={styles.searchWrap}>
              <Glass style={styles.search}>
                <MaterialCommunityIcons name="magnify" size={22} color={theme.textSecondary} />
                <ThemedText themeColor={nav.destination ? 'text' : 'textSecondary'} numberOfLines={1} style={{ flex: 1 }}>
                  {nav.destination?.name ?? 'Where to?'}
                </ThemedText>
              </Glass>
            </Pressable>
          )}

          {drive ? (
            <Pressable
              onPress={() => router.navigate('/convoy')}
              style={[styles.convoyChip, { backgroundColor: theme.accent }]}
              accessibilityRole="button">
              <MaterialCommunityIcons name="car-multiple" size={16} color={theme.accentText} />
              <ThemedText type="smallBold" style={{ color: theme.accentText }}>
                {drive.name} · {Object.values(members).filter((m) => m.online).length} online
              </ThemedText>
            </Pressable>
          ) : null}
          {regroup ? (
            <Pressable
              onPress={() => lastSample && void nav.planTo(regroup, [lastSample.lng, lastSample.lat])}
              accessibilityRole="button"
              accessibilityLabel={`${regroup.kind === 'regroup' ? 'Regroup at' : 'Convoy destination:'} ${regroup.name}. Tap for directions.`}
              style={[styles.convoyChip, { backgroundColor: theme.backgroundElement, borderWidth: 2, borderColor: theme.accent }]}>
              <MaterialCommunityIcons name={regroup.kind === 'regroup' ? 'map-marker-radius' : 'flag-checkered'} size={16} color={theme.accent} />
              <ThemedText type="smallBold" numberOfLines={1} style={{ flexShrink: 1 }}>
                {regroup.kind === 'regroup' ? 'Regroup' : 'Destination'}: {regroup.name}
                {lastSample ? ` · ${formatDistance(units, haversine([lastSample.lng, lastSample.lat], regroup.coord))}` : ''}
              </ThemedText>
              <ThemedText type="smallBold" style={{ color: theme.accent }}>
                Go
              </ThemedText>
            </Pressable>
          ) : null}
          {alerts}
        </View>
      )}

      <LocationPrompt />

      {drive && roster.length > 1 && rosterMax > 80 ? (
        <View style={[styles.roster, { top: rosterTop }]} pointerEvents="box-none">
          <ConvoyRoster entries={roster} units={units} stopLabel={stop?.label ?? null} maxHeight={rosterMax} />
        </View>
      ) : null}

      {/* Navigating: the speed dial with the limit beside it (otherwise both live in the bottom panel). */}
      {navigating ? (
        <View style={[styles.limit, { bottom: panelHeight + BottomTabInset + Spacing.two }]} pointerEvents="none">
          <SpeedDial mps={stale ? null : speedNow} units={units} limit={speedLimit} speeding={speeding} variant={themeVariant} />
        </View>
      ) : null}

      {/* Passing an unconfirmed camera report: one tap to confirm or deny */}
      {cameraPrompt ? (
        <Animated.View
          entering={FadeInDown.springify().damping(15)}
          exiting={FadeOutDown.duration(200)}
          style={[styles.scoutCard, { bottom: panelHeight + BottomTabInset + Spacing.three + (navigating ? 124 : 72) }]}>
          <View style={[styles.scoutIcon, { backgroundColor: CAMERA_COLOR[cameraPrompt.kind] }]}>
            <MaterialCommunityIcons name={CAMERA_ICON[cameraPrompt.kind]} size={22} color="#fff" />
          </View>
          <View style={{ flex: 1 }}>
            <ThemedText style={{ color: '#fff', fontWeight: 800 }} numberOfLines={1} adjustsFontSizeToFit>
              {CAMERA_LABEL[cameraPrompt.kind]} here?
            </ThemedText>
            <ThemedText type="small" style={{ color: '#B9C0CA' }} numberOfLines={1}>
              Another driver reported one
            </ThemedText>
          </View>
          <Pressable onPress={() => void useCameras.getState().vote(cameraPrompt, false)} accessibilityRole="button" style={[styles.scoutBtn, { backgroundColor: 'rgba(255,255,255,0.12)' }]}>
            <ThemedText style={{ color: '#fff', fontWeight: 800 }}>No</ThemedText>
          </Pressable>
          <Pressable onPress={() => void useCameras.getState().vote(cameraPrompt, true)} accessibilityRole="button" style={[styles.scoutBtn, { backgroundColor: theme.success }]}>
            <ThemedText style={{ color: '#fff', fontWeight: 800 }}>Yes</ThemedText>
          </Pressable>
        </Animated.View>
      ) : null}

      {/* Group drive: one-tap calls to the convoy, at the top of the right-hand column */}
      {drive ? <QuickCallButton style={[styles.sideBtn, { bottom: panelHeight + BottomTabInset + Spacing.three + (navigating ? 128 : 64) }]} /> : null}

      {/* While navigating, voice on/off floats above the report button */}
      {navigating ? (
        <Pressable
          onPress={useNavigation.getState().toggleMute}
          accessibilityRole="button"
          accessibilityLabel={muted ? 'Unmute voice' : 'Mute voice'}
          style={[styles.reportBtn, { bottom: panelHeight + BottomTabInset + Spacing.three + 64, backgroundColor: theme.backgroundElement }]}>
          <MaterialCommunityIcons name={muted ? 'volume-off' : 'volume-high'} size={26} color={theme.text} />
        </Pressable>
      ) : null}

      {/* Report button floats above the panel */}
      <Pressable
        onPress={() => router.push('/report')}
        accessibilityRole="button"
        accessibilityLabel="Report something on the road"
        style={[styles.reportBtn, { bottom: panelHeight + BottomTabInset + Spacing.three, backgroundColor: theme.warning }]}>
        <MaterialCommunityIcons name="alert-plus" size={28} color="#fff" />
      </Pressable>

      {/* Bottom: speed + trip or navigation controls */}
      <Glass style={[styles.panel, { paddingBottom: BottomTabInset + Spacing.three }, placeOpen && { alignItems: 'stretch' }]}>
        {placeOpen && nav.destination ? (
          <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator={false}>
            <PlaceCard
              place={nav.destination}
              routes={nav.routes}
              selected={nav.selected}
              loading={nav.loading}
              error={nav.error}
              units={units}
              me={lastSample ? [lastSample.lng, lastSample.lat] : null}
              showPlateCams={showAlprCameras}
              showSpeedCams={speedCameraAlerts}
              weather={weather}
              onSelect={nav.select}
              onGo={() => void onGo()}
              onClose={nav.clear}
            />
          </ScrollView>
        ) : navigating ? (
          gas ? (
            <GasChooser
              stops={via && gas.stops ? gas.stops.filter((g) => haversine(g.coord, via.coord) > 30) : gas.stops}
              error={gas.error}
              units={units}
              current={via?.name ?? null}
              onClose={() => setGas(null)}
              onRemove={() => {
                if (lastSample) void useNavigation.getState().removeStop([lastSample.lng, lastSample.lat]);
                setGas(null);
              }}
              onPick={async (s) => {
                if (!lastSample) return;
                const err = await useNavigation.getState().addStop({ name: s.name, coord: s.coord }, [lastSample.lng, lastSample.lat]);
                if (err) setGas((g) => (g ? { ...g, error: err } : g));
                else setGas(null);
              }}
            />
          ) : choosing ? (
            <RouteChooser
              routes={choosing.routes}
              error={choosing.error}
              units={units}
              onClose={() => setChoosing(null)}
              onPick={(r) => {
                useNavigation.getState().switchRoute(r);
                setChoosing(null);
              }}
            />
          ) : (
            <NavFooter units={units} onEnd={nav.clear} onRoutes={() => void openRoutes()} onGas={() => void openGas()} onShare={() => void shareEta()} />
          )
        ) : (
          <Speedometer
            sample={lastSample}
            units={units}
            stale={stale}
            speeding={speeding}
            street={active ? road.name : null}
            limitSign={speedLimit ? <SpeedLimitSign limit={speedLimit} units={units} speedMps={stale ? null : (lastSample?.speed ?? null)} variant={themeVariant} compact /> : null}
          />
        )}

        {placeOpen || navigating ? null : active ? (
          <>
            <View style={styles.stats}>
              <Stat label="Time" value={formatDuration(elapsed)} />
              <Stat label="Distance" value={formatDistance(units, active.distanceM)} />
              <Stat label={`Avg ${speedUnitLabel(units)}`} value={String(Math.round(speedIn(units, averageSpeedMps(active))))} />
              <Stat label={`Max ${speedUnitLabel(units)}`} value={String(Math.round(speedIn(units, active.maxSpeedMps)))} />
            </View>
            <View style={styles.actions}>
              <Button label="Discard" variant="secondary" onPress={onDiscard} style={{ flex: 1 }} />
              <Button label="Finish trip" variant="danger" size="lg" onPress={onFinish} style={{ flex: 2 }} />
            </View>
          </>
        ) : (
          <Button
            label="Start trip"
            size="lg"
            onPress={onStart}
            icon={<MaterialCommunityIcons name="record-circle-outline" size={22} color={theme.accentText} />}
            style={{ alignSelf: 'stretch', marginTop: Spacing.three }}
          />
        )}
      </Glass>
    </View>
  );
}

const CAMERA_ICON = { speed: 'speedometer', redlight: 'traffic-light', alpr: 'cctv' } as const;

function compassPoint(deg: number) {
  return ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest'][Math.round((((deg % 360) + 360) % 360) / 45) % 8];
}

const styles = StyleSheet.create({
  top: { position: 'absolute', left: Spacing.three, right: Spacing.three, gap: Spacing.two, alignItems: 'flex-start' },
  searchWrap: { alignSelf: 'stretch' },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    minHeight: 52,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.lg,
  },
  destCard: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Radius.lg,
  },
  altRow: { flexDirection: 'row', gap: Spacing.two, marginTop: Spacing.two },
  altChip: { paddingHorizontal: Spacing.three, paddingVertical: Spacing.one + 2, borderRadius: Radius.pill },
  go: { paddingHorizontal: Spacing.four, height: 44, borderRadius: Radius.pill, alignItems: 'center', justifyContent: 'center' },
  goText: { color: '#fff', fontSize: 18, fontWeight: 800 },
  convoyChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one + 2,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Radius.pill,
  },
  limit: { position: 'absolute', left: Spacing.three },
  alerts: { alignSelf: 'stretch', alignItems: 'center', gap: Spacing.two },
  roster: { position: 'absolute', left: Spacing.two },
  sideBtn: { position: 'absolute', right: Spacing.three },
  scoutCard: {
    position: 'absolute',
    left: Spacing.three,
    right: Spacing.three,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    padding: Spacing.two,
    paddingLeft: Spacing.three,
    borderRadius: 20,
    backgroundColor: 'rgba(22,24,28,0.96)',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  scoutIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  scoutBtn: { minWidth: 56, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.three },
  cameraPill: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two, borderRadius: 999, borderWidth: 2, borderColor: '#fff', maxWidth: '94%' },
  cameraText: { color: '#fff', fontWeight: 800 },
  reportBtn: {
    position: 'absolute',
    right: Spacing.three,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 5,
  },
  panel: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: Spacing.four,
    paddingHorizontal: Spacing.three,
    borderTopLeftRadius: Radius.lg + 6,
    borderTopRightRadius: Radius.lg + 6,
    alignItems: 'center',
  },
  rec: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one + 2,
    marginTop: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
    borderRadius: Radius.pill,
  },
  recDot: { width: 8, height: 8, borderRadius: 4 },
  stats: { flexDirection: 'row', alignSelf: 'stretch', marginTop: Spacing.three },
  actions: { flexDirection: 'row', alignSelf: 'stretch', gap: Spacing.two, marginTop: Spacing.three },
});
