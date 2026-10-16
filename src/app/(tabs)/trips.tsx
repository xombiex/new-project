import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Glass } from '@/components/glass';
import { ConvoyMap, type MapLine } from '@/components/map/convoy-map';
import { RouteThumbnail } from '@/components/route-thumbnail';
import { ThemedText } from '@/components/themed-text';
import { Avatar } from '@/components/ui';
import { BottomTabInset, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatDistance, formatDuration, speedIn, speedUnitLabel, type LngLat } from '@/lib/geo';
import { formatClock, formatDayOrdinal } from '@/lib/time';
import { useAuth } from '@/store/auth';
import { useSettings } from '@/store/settings';
import { useTrips, type SavedTrip } from '@/store/trips';

type Sort = 'recent' | 'oldest' | 'fastest' | 'longest';
type Period = 'all' | 'month' | 'week';

const SORTS: { value: Sort; label: string }[] = [
  { value: 'recent', label: 'Recent' },
  { value: 'oldest', label: 'Oldest' },
  { value: 'fastest', label: 'Fastest' },
  { value: 'longest', label: 'Longest' },
];

const PERIODS: { value: Period; label: string }[] = [
  { value: 'all', label: 'All time' },
  { value: 'month', label: 'This month' },
  { value: 'week', label: 'This week' },
];

function periodStart(period: Period): number {
  if (period === 'all') return 0;
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  if (period === 'week') d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // Monday
  else d.setDate(1);
  return d.getTime();
}

const compare: Record<Sort, (a: SavedTrip, b: SavedTrip) => number> = {
  recent: (a, b) => b.startedAt - a.startedAt,
  oldest: (a, b) => a.startedAt - b.startedAt,
  fastest: (a, b) => b.maxSpeedMps - a.maxSpeedMps,
  longest: (a, b) => b.distanceM - a.distanceM,
};

export default function DrivesScreen() {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const history = useTrips((s) => s.history);
  const units = useSettings((s) => s.units);
  const profile = useAuth((s) => s.profile);
  const [sort, setSort] = useState<Sort>('recent');
  const [period, setPeriod] = useState<Period>('all');
  const [selected, setSelected] = useState<string | null>(null);

  const trips = useMemo(() => {
    const since = periodStart(period);
    return history.filter((t) => t.startedAt >= since).sort(compare[sort]);
  }, [history, period, sort]);

  const totals = useMemo(
    () => ({
      distanceM: trips.reduce((a, t) => a + t.distanceM, 0),
      durationS: trips.reduce((a, t) => a + (t.endedAt - t.startedAt) / 1000, 0),
    }),
    [trips]
  );

  const selectedTrip = trips.find((t) => t.id === selected) ?? null;

  // Every drive in one glowing layer; overlapping roads stack up into a heat trail.
  const lines = useMemo<MapLine[]>(() => {
    const paths = trips.filter((t) => t.path.length > 1).map((t) => t.path);
    const out: MapLine[] = [];
    if (paths.length) {
      out.push({ id: 'all-drives', coords: paths, color: theme.speed, width: 4, variant: 'glow', opacity: selectedTrip ? 0.35 : 1 });
    }
    if (selectedTrip && selectedTrip.path.length > 1) {
      out.push({ id: 'selected-drive', coords: selectedTrip.path, color: theme.speed, width: 6, variant: 'glow' });
    }
    return out;
  }, [trips, selectedTrip, theme.speed]);

  const sheetHeight = Math.round(height * 0.5);
  const fitPoints: LngLat[] = selectedTrip ? selectedTrip.path : trips.flatMap((t) => t.path);

  function onPressTrip(trip: SavedTrip) {
    if (selected === trip.id) router.push({ pathname: '/trip/[id]', params: { id: trip.id } });
    else setSelected(trip.id);
  }

  function cyclePeriod() {
    const i = PERIODS.findIndex((p) => p.value === period);
    setPeriod(PERIODS[(i + 1) % PERIODS.length].value);
    setSelected(null);
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <ConvoyMap
        style={StyleSheet.absoluteFill}
        showUser={false}
        lines={lines}
        fit={fitPoints.length ? { key: `${selected ?? 'all'}-${period}-${trips.length}`, points: fitPoints } : null}
        padding={{ top: insets.top + 60, bottom: sheetHeight + BottomTabInset }}
      />

      <Glass style={[styles.brand, { top: insets.top + Spacing.two }]}>
        <MaterialCommunityIcons name="car-sports" size={22} color={theme.text} />
        <ThemedText style={styles.brandText}>Convoy</ThemedText>
      </Glass>

      <Glass style={[styles.sheet, { height: sheetHeight, bottom: BottomTabInset + Spacing.two }]} intensity={50}>
        <View style={styles.sheetHeader}>
          <View style={{ flex: 1 }}>
            <ThemedText style={styles.title}>Drives</ThemedText>
            {history.length ? (
              <ThemedText type="small" themeColor="textSecondary">
                {trips.length} {trips.length === 1 ? 'drive' : 'drives'} · {formatDistance(units, totals.distanceM)} ·{' '}
                {formatDuration(totals.durationS)}
              </ThemedText>
            ) : null}
          </View>
          <Pressable onPress={() => router.navigate('/profile')} accessibilityRole="button" accessibilityLabel="Profile">
            {profile ? (
              <Avatar name={profile.display_name} color={profile.avatar_color} size={48} />
            ) : (
              <View style={[styles.avatarFallback, { backgroundColor: theme.backgroundSelected }]}>
                <MaterialCommunityIcons name="account" size={28} color={theme.textSecondary} />
              </View>
            )}
          </Pressable>
        </View>

        {history.length === 0 ? (
          <View style={styles.empty}>
            <ThemedText themeColor="textSecondary" style={styles.emptyText}>
              You haven&apos;t done any trips yet, start driving
            </ThemedText>
          </View>
        ) : (
          <>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chips}
              style={styles.chipScroll}>
              <Chip onPress={cyclePeriod} icon="calendar-blank-outline" trailing="chevron-down">
                {PERIODS.find((p) => p.value === period)!.label}
              </Chip>
              {SORTS.map((s) => (
                <Chip key={s.value} selected={s.value === sort} onPress={() => setSort(s.value)}>
                  {s.label}
                </Chip>
              ))}
            </ScrollView>

            <FlatList
              data={trips}
              keyExtractor={(t) => t.id}
              contentContainerStyle={{ paddingBottom: Spacing.three }}
              ListEmptyComponent={
                <View style={styles.empty}>
                  <ThemedText themeColor="textSecondary" style={styles.emptyText}>
                    No drives in this time range
                  </ThemedText>
                </View>
              }
              renderItem={({ item, index }) => (
                <DriveRow
                  trip={item}
                  units={units}
                  selected={item.id === selected}
                  divider={index > 0}
                  onPress={() => onPressTrip(item)}
                />
              )}
            />
          </>
        )}
      </Glass>
    </View>
  );
}

function Chip({
  children,
  selected,
  onPress,
  icon,
  trailing,
}: {
  children: string;
  selected?: boolean;
  onPress: () => void;
  icon?: keyof typeof MaterialCommunityIcons.glyphMap;
  trailing?: keyof typeof MaterialCommunityIcons.glyphMap;
}) {
  const theme = useTheme();
  const fg = selected ? theme.accentText : theme.textSecondary;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={({ pressed }) => [
        styles.chip,
        { backgroundColor: selected ? theme.accent : theme.chip, borderColor: selected ? theme.accent : theme.border, opacity: pressed ? 0.8 : 1 },
      ]}>
      {icon ? <MaterialCommunityIcons name={icon} size={18} color={selected ? fg : theme.text} /> : null}
      <ThemedText style={[styles.chipText, { color: icon ? theme.text : fg }]}>{children}</ThemedText>
      {trailing ? <MaterialCommunityIcons name={trailing} size={18} color={theme.text} /> : null}
    </Pressable>
  );
}

function DriveRow({
  trip,
  units,
  selected,
  divider,
  onPress,
}: {
  trip: SavedTrip;
  units: 'imperial' | 'metric';
  selected: boolean;
  divider: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityHint={selected ? 'Opens drive details' : 'Highlights this drive on the map'}
      style={[styles.row, selected && { backgroundColor: theme.backgroundSelected }]}>
      <RouteThumbnail path={trip.path} color={selected ? theme.speed : theme.text} />
      <View style={[styles.rowBody, divider && !selected && { borderTopColor: theme.border, borderTopWidth: StyleSheet.hairlineWidth }]}>
        <View style={{ flex: 1 }}>
          <ThemedText style={styles.rowTitle} numberOfLines={1}>
            {trip.name ?? formatDayOrdinal(trip.startedAt)}
          </ThemedText>
          <ThemedText style={styles.rowSub} themeColor="textSecondary" numberOfLines={1}>
            {trip.name ? `${formatDayOrdinal(trip.startedAt)} · ` : ''}
            {formatClock(trip.startedAt)} – {formatClock(trip.endedAt)}
          </ThemedText>
          <ThemedText style={styles.rowSub} themeColor="textSecondary" numberOfLines={1}>
            {formatDistance(units, trip.distanceM)} · {formatDuration((trip.endedAt - trip.startedAt) / 1000)}
          </ThemedText>
        </View>
        <View style={styles.speed}>
          <ThemedText style={[styles.speedValue, { color: theme.speed }]}>
            {Math.round(speedIn(units, trip.maxSpeedMps))}
          </ThemedText>
          <ThemedText style={styles.speedUnit} themeColor="textSecondary">
            {speedUnitLabel(units).toUpperCase()}
          </ThemedText>
        </View>
        {selected ? <MaterialCommunityIcons name="chevron-right" size={24} color={theme.textSecondary} /> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  brand: {
    position: 'absolute',
    left: Spacing.three,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + 2,
    borderRadius: Radius.pill,
  },
  brandText: { fontSize: 18, fontWeight: 700 },
  sheet: {
    position: 'absolute',
    left: Spacing.two,
    right: Spacing.two,
    borderRadius: 32,
    paddingTop: Spacing.four,
  },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.four, gap: Spacing.three },
  title: { fontSize: 34, lineHeight: 40, fontWeight: 800, letterSpacing: -0.5 },
  avatarFallback: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  chipScroll: { flexGrow: 0, flexShrink: 0, height: 40 + Spacing.three * 2 },
  chips: { gap: Spacing.two, paddingHorizontal: Spacing.three, alignItems: 'center' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one + 2,
    height: 40,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.pill,
    borderWidth: 1,
  },
  chipText: { fontSize: 15, fontWeight: 600 },
  row: { flexDirection: 'row', alignItems: 'center', paddingLeft: Spacing.three, gap: Spacing.three },
  rowBody: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingVertical: Spacing.three, paddingRight: Spacing.three, gap: Spacing.two },
  rowTitle: { fontSize: 18, fontWeight: 700 },
  rowSub: { fontSize: 15, lineHeight: 21 },
  speed: { alignItems: 'center', minWidth: 56 },
  speedValue: { fontSize: 30, lineHeight: 34, fontWeight: 800, fontVariant: ['tabular-nums'] },
  speedUnit: { fontSize: 12, fontWeight: 600, letterSpacing: 0.5 },
  empty: { alignItems: 'center', paddingHorizontal: Spacing.four, paddingVertical: Spacing.five },
  emptyText: { fontSize: 17, textAlign: 'center' },
});
