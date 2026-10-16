import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { BarChart } from '@/components/bar-chart';
import { ThemedText } from '@/components/themed-text';
import { Avatar, Button, Card, Screen, Segmented, SectionTitle, Stat } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { evaluate } from '@/lib/achievements';
import { formatDistance, formatDuration, speedIn, speedUnitLabel } from '@/lib/geo';
import { buckets, change, periodEnd, periodStart, placesVisited, records, streaks, totals, type Period } from '@/lib/stats';
import { formatDayOrdinal } from '@/lib/time';
import { useAuth } from '@/store/auth';
import { useEntitled } from '@/store/pro';
import { useSettings } from '@/store/settings';
import { useTrips } from '@/store/trips';

const PERIOD_NOUN: Record<Period, string> = { week: 'week', month: 'month', year: 'year' };

export default function StatsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const history = useTrips((s) => s.history);
  const places = useMemo(() => placesVisited(history), [history]);
  const units = useSettings((s) => s.units);
  const profile = useAuth((s) => s.profile);
  const pro = useEntitled('pro');
  const [period, setPeriod] = useState<Period>('week');
  const now = Date.now();

  const locked = period !== 'week' && !pro;
  const data = useMemo(() => {
    const cur = totals(history, periodStart(period, now), periodEnd(period, now));
    const prev = totals(history, periodStart(period, now, 1), periodEnd(period, now, 1));
    const bars = buckets(history, period, now);
    const highlight = bars.findIndex((b, i) => now >= b.start && (i === bars.length - 1 || now < bars[i + 1].start));
    return { cur, delta: change(cur.distanceM, prev.distanceM), bars, highlight };
    // `now` changes every render; the day boundary is all that matters here
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [history, period]);
  const rec = useMemo(() => records(history), [history]);
  const streak = useMemo(() => streaks(history, now), [history, now]);
  const achievements = useMemo(() => evaluate(history, now), [history, now]);
  const earned = achievements.filter((a) => a.earned).length;
  const unit = speedUnitLabel(units);

  return (
    <Screen>
      <View style={styles.header}>
        <ThemedText style={styles.title}>Stats</ThemedText>
        <Pressable onPress={() => router.push('/profile')} accessibilityRole="button" accessibilityLabel="Profile">
          {profile ? (
            <Avatar name={profile.display_name} color={profile.avatar_color} size={44} />
          ) : (
            <View style={[styles.avatarFallback, { backgroundColor: theme.backgroundSelected }]}>
              <MaterialCommunityIcons name="account" size={26} color={theme.textSecondary} />
            </View>
          )}
        </Pressable>
      </View>

      <Segmented
        options={[
          { value: 'week', label: 'Week' },
          { value: 'month', label: pro ? 'Month' : 'Month 🔒' },
          { value: 'year', label: pro ? 'Year' : 'Year 🔒' },
        ]}
        value={period}
        onChange={setPeriod}
      />

      {locked ? (
        <Card style={{ alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.five }}>
          <MaterialCommunityIcons name="chart-timeline-variant-shimmer" size={36} color={theme.speed} />
          <ThemedText style={{ fontSize: 18, fontWeight: 700 }}>Monthly & yearly stats are Pro</ThemedText>
          <ThemedText themeColor="textSecondary" style={{ textAlign: 'center' }}>
            See every month and year at a glance, plus your personal records.
          </ThemedText>
          <Button label="See Convoy Pro" onPress={() => router.push('/paywall')} />
        </Card>
      ) : (
        <Card style={{ gap: Spacing.three }}>
          <View>
            <ThemedText type="small" themeColor="textSecondary">
              This {PERIOD_NOUN[period]}
            </ThemedText>
            <View style={styles.bigRow}>
              <ThemedText style={styles.big}>{formatDistance(units, data.cur.distanceM)}</ThemedText>
              {data.delta != null ? (
                <View
                  style={[
                    styles.delta,
                    { backgroundColor: data.delta >= 0 ? theme.success + '22' : theme.backgroundSelected },
                  ]}>
                  <MaterialCommunityIcons
                    name={data.delta >= 0 ? 'arrow-up' : 'arrow-down'}
                    size={14}
                    color={data.delta >= 0 ? theme.success : theme.textSecondary}
                  />
                  <ThemedText type="smallBold" style={{ color: data.delta >= 0 ? theme.success : theme.textSecondary }}>
                    {Math.abs(Math.round(data.delta * 100))}% vs last {PERIOD_NOUN[period]}
                  </ThemedText>
                </View>
              ) : null}
            </View>
          </View>
          <BarChart bars={data.bars} highlight={data.highlight} labelEvery={period === 'month' ? 5 : 1} />
          <View style={{ flexDirection: 'row' }}>
            <Stat label="Drives" value={String(data.cur.count)} />
            <Stat label="Drive time" value={formatDuration(data.cur.durationS)} />
            <Stat
              label={`Avg ${unit}`}
              value={String(Math.round(speedIn(units, data.cur.movingS > 0 ? data.cur.distanceM / data.cur.movingS : 0)))}
            />
          </View>
        </Card>
      )}

      <View style={{ flexDirection: 'row', gap: Spacing.three }}>
        <Card style={styles.streak}>
          <MaterialCommunityIcons name="fire" size={26} color={streak.current > 0 ? theme.speed : theme.textSecondary} />
          <ThemedText style={styles.streakValue}>{streak.current}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            day streak
          </ThemedText>
        </Card>
        <Card style={styles.streak}>
          <MaterialCommunityIcons name="trophy-outline" size={26} color={theme.accent} />
          <ThemedText style={styles.streakValue}>{streak.best}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            best streak
          </ThemedText>
        </Card>
        <Card style={styles.streak}>
          <MaterialCommunityIcons name="map-marker-multiple-outline" size={26} color={theme.success} />
          <ThemedText style={styles.streakValue}>{places}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            places
          </ThemedText>
        </Card>
      </View>

      <SectionTitle>Personal records</SectionTitle>
      {pro ? (
        <Card style={{ paddingVertical: Spacing.one }}>
          {[
            ['map-marker-distance', 'Longest drive', rec.longest && formatDistance(units, rec.longest.distanceM), rec.longest],
            [
              'timer-outline',
              'Longest time',
              rec.longestTime && formatDuration((rec.longestTime.endedAt - rec.longestTime.startedAt) / 1000),
              rec.longestTime,
            ],
            ['calendar-today', 'Best day', rec.bestDayM ? formatDistance(units, rec.bestDayM) : null, null],
            ['calendar-week', 'Best week', rec.bestWeekM ? formatDistance(units, rec.bestWeekM) : null, null],
            [
              'speedometer',
              'Top speed',
              rec.topSpeed && `${Math.round(speedIn(units, rec.topSpeed.maxSpeedMps))} ${unit}`,
              rec.topSpeed,
            ],
          ].map(([icon, label, value, trip], i) => (
            <Pressable
              key={label as string}
              disabled={!trip}
              onPress={() => trip && router.push({ pathname: '/trip/[id]', params: { id: (trip as { id: string }).id } })}
              style={[styles.record, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border }]}>
              <MaterialCommunityIcons name={icon as 'timer-outline'} size={22} color={theme.textSecondary} />
              <View style={{ flex: 1 }}>
                <ThemedText style={{ fontWeight: 600 }}>{label as string}</ThemedText>
                {trip ? (
                  <ThemedText type="small" themeColor="textSecondary">
                    {formatDayOrdinal((trip as { startedAt: number }).startedAt)}
                  </ThemedText>
                ) : null}
              </View>
              <ThemedText style={{ fontWeight: 800, fontSize: 17 }}>{(value as string | null) ?? '—'}</ThemedText>
            </Pressable>
          ))}
        </Card>
      ) : (
        <Pressable onPress={() => router.push('/paywall')} accessibilityRole="button">
          <Card style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.three }}>
            <MaterialCommunityIcons name="lock-outline" size={22} color={theme.textSecondary} />
            <ThemedText style={{ flex: 1 }}>Longest drive, best week and more with Pro</ThemedText>
            <MaterialCommunityIcons name="chevron-right" size={22} color={theme.textSecondary} />
          </Card>
        </Pressable>
      )}

      <SectionTitle>{`Achievements · ${earned}/${achievements.length}`}</SectionTitle>
      <View style={styles.grid}>
        {achievements.map((a) => (
          <Card key={a.id} style={styles.badge}>
            <View
              style={[
                styles.badgeIcon,
                { backgroundColor: a.earned ? theme.speed : theme.backgroundSelected },
              ]}>
              <MaterialCommunityIcons
                name={a.icon as 'fire'}
                size={24}
                color={a.earned ? '#fff' : theme.textSecondary}
              />
            </View>
            <ThemedText style={{ fontWeight: 700, textAlign: 'center' }} numberOfLines={1}>
              {a.title}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={{ textAlign: 'center' }} numberOfLines={2}>
              {a.description}
            </ThemedText>
            {!a.earned ? (
              <View style={[styles.progress, { backgroundColor: theme.backgroundSelected }]}>
                <View style={[styles.progressFill, { width: `${(a.value / a.goal) * 100}%`, backgroundColor: theme.accent }]} />
              </View>
            ) : null}
          </Card>
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 34, lineHeight: 40, fontWeight: 800, letterSpacing: -0.5 },
  avatarFallback: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  bigRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, flexWrap: 'wrap' },
  big: { fontSize: 36, lineHeight: 42, fontWeight: 800, fontVariant: ['tabular-nums'] },
  delta: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: Spacing.two, paddingVertical: 2, borderRadius: Radius.pill },
  streak: { flex: 1, alignItems: 'center', gap: Spacing.half },
  streakValue: { fontSize: 28, lineHeight: 34, fontWeight: 800 },
  record: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, paddingVertical: Spacing.three },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.three },
  badge: { width: '47%', flexGrow: 1, alignItems: 'center', gap: Spacing.one },
  badgeIcon: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.one },
  progress: { alignSelf: 'stretch', height: 4, borderRadius: 2, overflow: 'hidden', marginTop: Spacing.one },
  progressFill: { height: '100%' },
});
