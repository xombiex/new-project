import { MaterialCommunityIcons } from '@expo/vector-icons';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { NavBanner, NavFooter } from '@/components/drive/nav-overlay';
import { SpeedLimitSign } from '@/components/drive/speed-limit-sign';
import { Glass } from '@/components/glass';
import { LocationPrompt } from '@/components/location-prompt';
import { ConvoyMap, type MapLine, type MapMarker, type MapPerson } from '@/components/map/convoy-map';
import { Speedometer } from '@/components/speedometer';
import { ThemedText } from '@/components/themed-text';
import { Button, Stat } from '@/components/ui';
import { BottomTabInset, Radius, Spacing } from '@/constants/theme';
import { useSpeedLimit } from '@/hooks/use-speed-limit';
import { useTheme } from '@/hooks/use-theme';
import { formatDistance, formatDuration, speedIn, speedLabel, speedUnitLabel } from '@/lib/geo';
import { addReason, removeReason } from '@/lib/location';
import { haptic } from '@/lib/haptics';
import { reportMeta } from '@/lib/reports';
import { limitMps } from '@/lib/speed-limit';
import { formatAgo } from '@/lib/time';
import { averageSpeedMps } from '@/lib/trip-recorder';
import { vehicleIcon } from '@/lib/vehicles';
import { useAuth } from '@/store/auth';
import { useDrive } from '@/store/drive';
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
  const reports = useReports((s) => s.reports);
  const drive = useDrive((s) => s.drive);
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
    if (navRoute) {
      // Only the road still ahead.
      const from = navProgress?.snap.segment ?? 0;
      out.push({ id: 'nav', coords: navRoute.geometry.slice(from), color: theme.accent, width: 8 });
    } else {
      nav.routes.forEach((r, i) => {
        if (i !== nav.selected) out.push({ id: `alt-${i}`, coords: r.geometry, color: theme.textSecondary, width: 5, opacity: 0.6 });
      });
      const sel = nav.routes[nav.selected];
      if (sel) out.push({ id: 'route', coords: sel.geometry, color: theme.accent, width: 7 });
    }
    if (active && active.path.length > 1) out.push({ id: 'trip', coords: active.path, color: theme.speed, width: 3, variant: 'glow' });
    return out;
  }, [navRoute, navProgress?.snap.segment, nav.routes, nav.selected, active, theme]);

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
    () =>
      reports.map((r) => {
        const meta = reportMeta(r.type);
        return { id: r.id, coord: [r.lng, r.lat], icon: meta.icon, color: meta.color, onPress: () => onPressReport(r.id) };
      }),
    // onPressReport reads fresh state itself
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [reports]
  );

  const route = nav.routes[nav.selected];

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

  async function onFinish() {
    await removeReason('trip');
    const trip = finish();
    if (trip) haptic.success();
    if (trip) router.push({ pathname: '/trip/[id]', params: { id: trip.id } });
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
          void removeReason('trip');
        },
      },
    ]);
  }

  const elapsed = active ? (now - active.startedAt) / 1000 : 0;
  const panelHeight = navigating ? 260 : active ? 330 : 270;
  // Posted limit while a ride is on (recording a trip or navigating).
  const road = useSpeedLimit(Boolean(active || navigating));
  const speedLimit = road.limit;
  const speeding = Boolean(speedLimit && !stale && lastSample?.speed != null && lastSample.speed > limitMps(speedLimit) + 1.5);
  // One buzz when you go over, not a constant rattle.
  useEffect(() => {
    if (speeding) haptic.warning();
  }, [speeding]);

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      {keepScreenOn && (active || navigating) ? <KeepAwake /> : null}

      <ConvoyMap
        style={StyleSheet.absoluteFill}
        follow
        me={lastSample ? { coord: [lastSample.lng, lastSample.lat], heading: lastSample.heading, vehicle: myVehicle, paint: myPaint } : null}
        lines={lines}
        people={people}
        markers={markers}
        destination={(navigating ? navDestination : nav.destination)?.coord}
        fit={!navigating && route ? { key: `${nav.destination?.id}-${nav.selected}`, points: route.geometry } : null}
        padding={{ top: insets.top + (navigating ? 150 : 80), bottom: panelHeight + BottomTabInset }}
      />

      {navigating ? (
        <NavBanner units={units} top={insets.top + Spacing.two} />
      ) : (
        <View style={[styles.top, { paddingTop: insets.top + Spacing.two }]} pointerEvents="box-none">
          {nav.destination ? (
            <Glass style={styles.destCard}>
              <View style={{ flex: 1 }}>
                <ThemedText numberOfLines={1} style={{ fontWeight: 700 }}>
                  {nav.destination.name}
                </ThemedText>
                <ThemedText type="small" themeColor={nav.error ? 'danger' : 'textSecondary'} numberOfLines={1}>
                  {nav.loading
                    ? 'Finding routes…'
                    : nav.error
                      ? nav.error
                      : route
                        ? `${formatDuration(route.durationS)} · ${formatDistance(units, route.distanceM)} · arrive ${new Date(Date.now() + route.durationS * 1000).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
                        : ''}
                </ThemedText>
                {nav.routes.length > 1 ? (
                  <View style={styles.altRow}>
                    {nav.routes.map((r, i) => (
                      <Pressable
                        key={i}
                        onPress={() => nav.select(i)}
                        accessibilityRole="button"
                        accessibilityState={{ selected: i === nav.selected }}
                        style={[styles.altChip, { backgroundColor: i === nav.selected ? theme.accent : theme.backgroundSelected }]}>
                        <ThemedText type="smallBold" style={{ color: i === nav.selected ? theme.accentText : theme.text }}>
                          {formatDuration(r.durationS)}
                        </ThemedText>
                      </Pressable>
                    ))}
                  </View>
                ) : null}
              </View>
              <View style={{ alignItems: 'flex-end', gap: Spacing.two }}>
                <Pressable onPress={nav.clear} accessibilityRole="button" accessibilityLabel="Clear destination" hitSlop={12}>
                  <MaterialCommunityIcons name="close-circle" size={28} color={theme.textSecondary} />
                </Pressable>
                {route ? (
                  <Pressable
                    onPress={() => void onGo()}
                    accessibilityRole="button"
                    accessibilityLabel="Start navigation"
                    style={[styles.go, { backgroundColor: theme.success }]}>
                    <ThemedText style={styles.goText}>Go</ThemedText>
                  </Pressable>
                ) : null}
              </View>
            </Glass>
          ) : (
            <Pressable
              onPress={() => router.push({ pathname: '/search', params: { purpose: 'route' } })}
              accessibilityRole="search"
              style={styles.searchWrap}>
              <Glass style={styles.search}>
                <MaterialCommunityIcons name="magnify" size={22} color={theme.textSecondary} />
                <ThemedText themeColor="textSecondary">Where to?</ThemedText>
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
        </View>
      )}

      <LocationPrompt />

      {speedLimit ? (
        <View style={[styles.limit, { bottom: panelHeight + BottomTabInset + Spacing.three }]} pointerEvents="none">
          <SpeedLimitSign limit={speedLimit} units={units} speedMps={stale ? null : (lastSample?.speed ?? null)} />
        </View>
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
      <Glass style={[styles.panel, { paddingBottom: BottomTabInset + Spacing.three }]}>
        <Speedometer sample={lastSample} units={units} stale={stale} speeding={speeding} street={active || navigating ? road.name : null} />

        {active && navigating ? (
          <View style={[styles.rec, { backgroundColor: theme.backgroundSelected }]}>
            <View style={[styles.recDot, { backgroundColor: theme.danger }]} />
            <ThemedText type="smallBold">
              REC {formatDuration(elapsed)} · {formatDistance(units, active.distanceM)}
            </ThemedText>
          </View>
        ) : null}

        {navigating ? (
          <NavFooter units={units} onEnd={nav.clear} />
        ) : active ? (
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
