import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Card, EmptyState, Screen, Segmented, SectionTitle, Stat } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatDistance, formatDuration, speedIn, speedUnitLabel } from '@/lib/geo';
import { averageSpeedMps } from '@/lib/trip-recorder';
import { useSettings } from '@/store/settings';
import { useTrips, type SavedTrip } from '@/store/trips';

type Period = 'week' | 'month' | 'all';

function periodStart(period: Period): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  if (period === 'week') d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // Monday
  else if (period === 'month') d.setDate(1);
  else return 0;
  return d.getTime();
}

export default function TripsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const history = useTrips((s) => s.history);
  const units = useSettings((s) => s.units);
  const [period, setPeriod] = useState<Period>('week');

  const totals = useMemo(() => {
    const since = periodStart(period);
    const trips = history.filter((t) => t.startedAt >= since);
    const distanceM = trips.reduce((a, t) => a + t.distanceM, 0);
    const movingS = trips.reduce((a, t) => a + t.movingS, 0);
    return {
      count: trips.length,
      distanceM,
      movingS,
      avg: averageSpeedMps({ distanceM, movingS }),
      max: trips.reduce((a, t) => Math.max(a, t.maxSpeedMps), 0),
    };
  }, [history, period]);

  // Group by calendar day for the list.
  const sections = useMemo(() => {
    const groups: { day: string; trips: SavedTrip[] }[] = [];
    for (const t of history) {
      const day = new Date(t.startedAt).toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
      const g = groups[groups.length - 1];
      if (g?.day === day) g.trips.push(t);
      else groups.push({ day, trips: [t] });
    }
    return groups;
  }, [history]);

  return (
    <Screen>
      <ThemedText type="subtitle">Trips</ThemedText>
      <Segmented
        options={[
          { value: 'week', label: 'This week' },
          { value: 'month', label: 'This month' },
          { value: 'all', label: 'All time' },
        ]}
        value={period}
        onChange={setPeriod}
      />
      <Card style={{ gap: Spacing.three }}>
        <View style={styles.statRow}>
          <Stat label="Trips" value={String(totals.count)} />
          <Stat label="Distance" value={formatDistance(units, totals.distanceM)} />
          <Stat label="Drive time" value={formatDuration(totals.movingS)} />
        </View>
        <View style={styles.statRow}>
          <Stat label={`Avg ${speedUnitLabel(units)}`} value={String(Math.round(speedIn(units, totals.avg)))} />
          <Stat label={`Top ${speedUnitLabel(units)}`} value={String(Math.round(speedIn(units, totals.max)))} />
        </View>
      </Card>

      {history.length === 0 ? (
        <EmptyState title="No trips yet" body="Tap Start trip on the Drive tab and your route, time, distance and speeds are saved here." />
      ) : (
        sections.map((s) => (
          <View key={s.day} style={{ gap: Spacing.two }}>
            <SectionTitle>{s.day}</SectionTitle>
            <Card style={{ paddingVertical: Spacing.one }}>
              {s.trips.map((t, i) => (
                <Pressable
                  key={t.id}
                  onPress={() => router.push({ pathname: '/trip/[id]', params: { id: t.id } })}
                  accessibilityRole="button"
                  style={[styles.trip, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border }]}>
                  <View style={{ flex: 1 }}>
                    <ThemedText style={{ fontWeight: 700 }} numberOfLines={1}>
                      {t.name ?? new Date(t.startedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) + ' drive'}
                    </ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {formatDistance(units, t.distanceM)} · {formatDuration((t.endedAt - t.startedAt) / 1000)} ·{' '}
                      {Math.round(speedIn(units, averageSpeedMps(t)))} {speedUnitLabel(units)} avg
                    </ThemedText>
                  </View>
                  {!t.synced ? (
                    <MaterialCommunityIcons name="cloud-off-outline" size={18} color={theme.textSecondary} accessibilityLabel="Not backed up" />
                  ) : null}
                  <MaterialCommunityIcons name="chevron-right" size={22} color={theme.textSecondary} />
                </Pressable>
              ))}
            </Card>
          </View>
        ))
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  statRow: { flexDirection: 'row' },
  trip: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.three },
});
