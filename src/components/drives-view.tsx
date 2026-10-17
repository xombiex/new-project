import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { type ReactNode, useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
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

function monthKey(t: number) {
  const d = new Date(t);
  return `${d.getFullYear()}-${d.getMonth()}`;
}

function monthLabel(t: number) {
  return new Date(t).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

const compare: Record<Sort, (a: SavedTrip, b: SavedTrip) => number> = {
  recent: (a, b) => b.startedAt - a.startedAt,
  oldest: (a, b) => a.startedAt - b.startedAt,
  fastest: (a, b) => b.maxSpeedMps - a.maxSpeedMps,
  longest: (a, b) => b.distanceM - a.distanceM,
};

/** Drive history: every drive on a map plus the timeline. Lives in the Stats tab. */
export function DrivesView({ toggle }: { toggle: ReactNode }) {
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
  const [refreshing, setRefreshing] = useState(false);

  // Swipe down: back up unsaved drives and pull ones recorded on other devices.
  async function onRefresh() {
    setRefreshing(true);
    await useTrips.getState().syncPending();
    await useTrips.getState().pullFromCloud();
    setRefreshing(false);
  }

  const trips = useMemo(() => {
    const since = periodStart(period);
    return history.filter((t) => t.startedAt >= since).sort(compare[sort]);
  }, [history, period, sort]);

  // Timeline: month headers with that month's totals, when the list is in date order.
  const chronological = sort === 'recent' || sort === 'oldest';
  const months = useMemo(() => {
    const out = new Map<string, { count: number; distanceM: number }>();
    for (const t of trips) {
      const k = monthKey(t.startedAt);
      const m = out.get(k) ?? { count: 0, distanceM: 0 };
      m.count++;
      m.distanceM += t.distanceM;
      out.set(k, m);
    }
    return out;
  }, [trips]);

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

      <View style={[styles.toggle, { top: insets.top + Spacing.two }]}>{toggle}</View>

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
          <Pressable onPress={() => router.push('/profile')} accessibilityRole="button" accessibilityLabel="Profile">
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
              refreshControl={profile ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.accent} /> : undefined}
              contentContainerStyle={{ paddingBottom: Spacing.three }}
              ListEmptyComponent={
                <View style={styles.empty}>
                  <ThemedText themeColor="textSecondary" style={styles.emptyText}>
                    No drives in this time range
                  </ThemedText>
                </View>
              }
              renderItem={({ item, index }) => {
                const key = monthKey(item.startedAt);
                const newMonth = chronological && (index === 0 || monthKey(trips[index - 1].startedAt) !== key);
                const month = months.get(key);
                return (
                  <>
                    {newMonth && month ? (
                      <View style={styles.month}>
                        <ThemedText type="smallBold">{monthLabel(item.startedAt)}</ThemedText>
                        <ThemedText type="small" themeColor="textSecondary">
                          {month.count} drive{month.count === 1 ? '' : 's'} · {formatDistance(units, month.distanceM)}
                        </ThemedText>
                      </View>
                    ) : null}
                    <DriveRow
                      trip={item}
                      units={units}
                      selected={item.id === selected}
                      divider={index > 0 && !newMonth}
                      onPress={() => onPressTrip(item)}
                    />
                  </>
                );
              }}
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
  toggle: { position: 'absolute', left: Spacing.three, right: Spacing.three },
  month: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', paddingHorizontal: Spacing.three, paddingTop: Spacing.three, paddingBottom: Spacing.one },
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
