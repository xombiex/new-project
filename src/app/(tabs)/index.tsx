import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useKeepAwake } from 'expo-keep-awake';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Glass } from '@/components/glass';
import { ConvoyMap, type MapLine, type MapPerson } from '@/components/map/convoy-map';
import { Speedometer } from '@/components/speedometer';
import { ThemedText } from '@/components/themed-text';
import { Button, Stat } from '@/components/ui';
import { BottomTabInset, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatDistance, formatDuration, speedIn, speedUnitLabel } from '@/lib/geo';
import { addReason, removeReason } from '@/lib/location';
import { averageSpeedMps } from '@/lib/trip-recorder';
import { vehicleIcon } from '@/lib/vehicles';
import { useAuth } from '@/store/auth';
import { useDrive } from '@/store/drive';
import { useNav } from '@/store/nav';
import { useSettings } from '@/store/settings';
import { useTrips } from '@/store/trips';

/** A fix older than this means we've lost GPS (tunnel, parking garage). */
const STALE_MS = 10_000;
/** Members who haven't reported in this long are drawn dimmed. */
const MEMBER_STALE_MS = 60_000;

function KeepAwake() {
  useKeepAwake();
  return null;
}

export default function DriveScreen() {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { units, keepScreenOn } = useSettings();
  const { active, lastSample, start, finish, discard } = useTrips();
  const nav = useNav();
  const drive = useDrive((s) => s.drive);
  const members = useDrive((s) => s.members);
  const myId = useAuth((s) => s.session?.user.id);
  const [now, setNow] = useState(Date.now());

  // GPS on while this tab is visible; trips/drives keep it on in the background separately.
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
    nav.routes.forEach((r, i) => {
      if (i !== nav.selected) out.push({ id: `alt-${i}`, coords: r.geometry, color: theme.textSecondary, width: 5, opacity: 0.6 });
    });
    const sel = nav.routes[nav.selected];
    if (sel) out.push({ id: 'route', coords: sel.geometry, color: theme.accent, width: 7 });
    if (active && active.path.length > 1) out.push({ id: 'trip', coords: active.path, color: theme.success, width: 4 });
    return out;
  }, [nav.routes, nav.selected, active, theme]);

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
          stale: !m.online || now - m.position!.t > MEMBER_STALE_MS,
        })),
    [members, myId, now]
  );

  const route = nav.routes[nav.selected];

  async function onStart() {
    start();
    await addReason('trip');
  }

  async function onFinish() {
    await removeReason('trip');
    const trip = finish();
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
  const panelHeight = active ? 330 : 270;

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      {keepScreenOn && active ? <KeepAwake /> : null}

      <ConvoyMap
        style={StyleSheet.absoluteFill}
        follow
        lines={lines}
        people={people}
        destination={nav.destination?.coord}
        fit={route ? { key: `${nav.destination?.id}-${nav.selected}`, points: route.geometry } : null}
        padding={{ top: insets.top + 80, bottom: panelHeight + BottomTabInset }}
      />

      {/* Top: search or current destination */}
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
            <Pressable onPress={nav.clear} accessibilityRole="button" accessibilityLabel="Clear destination" hitSlop={12}>
              <MaterialCommunityIcons name="close-circle" size={28} color={theme.textSecondary} />
            </Pressable>
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

      {/* Bottom: speed + trip controls */}
      <Glass style={[styles.panel, { paddingBottom: BottomTabInset + Spacing.three }]}>
        <Speedometer sample={lastSample} units={units} stale={stale} />

        {active ? (
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
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 4,
  },
  destCard: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Radius.lg,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 4,
  },
  altRow: { flexDirection: 'row', gap: Spacing.two, marginTop: Spacing.two },
  altChip: { paddingHorizontal: Spacing.three, paddingVertical: Spacing.one + 2, borderRadius: Radius.pill },
  convoyChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one + 2,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Radius.pill,
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
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
  },
  stats: { flexDirection: 'row', alignSelf: 'stretch', marginTop: Spacing.three },
  actions: { flexDirection: 'row', alignSelf: 'stretch', gap: Spacing.two, marginTop: Spacing.three },
});
