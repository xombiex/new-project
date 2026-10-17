import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { Avatar, Card, Segmented, Skeleton } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { DEMO_LEADERBOARD, isDemo } from '@/lib/demo';
import { formatDistance } from '@/lib/geo';
import { supabase } from '@/lib/supabase';
import { useSettings } from '@/store/settings';

type Row = {
  user_id: string;
  display_name: string;
  avatar_color: string;
  distance_m: number;
  drives: number;
  drive_days: number;
  is_me: boolean;
};

type Period = 'week' | 'month';

/** Start of this week (Monday) or month, local time. */
function since(period: Period) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  if (period === 'week') d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  else d.setDate(1);
  return d.toISOString();
}

const MEDALS = ['🥇', '🥈', '🥉'];

/** You and your friends, ranked by distance driven this week or month (never by speed). */
export function Leaderboard() {
  const theme = useTheme();
  const units = useSettings((s) => s.units);
  const [period, setPeriod] = useState<Period>('week');
  const [rows, setRows] = useState<Row[] | null>(null);

  useFocusEffect(
    useCallback(() => {
      let live = true;
      if (isDemo()) {
        setRows(DEMO_LEADERBOARD);
        return;
      }
      void supabase.rpc('friends_leaderboard', { p_since: since(period) }).then(({ data }) => {
        if (live) setRows((data as Row[] | null) ?? []);
      });
      return () => {
        live = false;
      };
    }, [period])
  );

  return (
    <Card style={{ gap: Spacing.three }}>
      <View style={styles.head}>
        <ThemedText style={{ fontWeight: 800, fontSize: 17 }}>Leaderboard</ThemedText>
        <View style={{ width: 170 }}>
          <Segmented
            options={[
              { value: 'week', label: 'Week' },
              { value: 'month', label: 'Month' },
            ]}
            value={period}
            onChange={(p) => {
              setRows(null);
              setPeriod(p);
            }}
          />
        </View>
      </View>

      {rows === null ? (
        // Placeholder rows while loading, so the card doesn't jump.
        [0, 1, 2].map((i) => <Skeleton key={i} height={50} />)
      ) : rows.length <= 1 ? (
        <ThemedText type="small" themeColor="textSecondary">
          Add friends to see who drives the most each week. Distance counts, not speed.
        </ThemedText>
      ) : (
        rows.map((r, i) => (
          <Animated.View
            key={r.user_id}
            entering={FadeInDown.delay(i * 50).duration(250)}
            style={[styles.row, r.is_me && { backgroundColor: theme.backgroundSelected }]}>
            <ThemedText style={styles.rank}>{r.distance_m > 0 && i < 3 ? MEDALS[i] : String(i + 1)}</ThemedText>
            <Avatar name={r.display_name} color={r.avatar_color} size={34} />
            <View style={{ flex: 1 }}>
              <ThemedText style={{ fontWeight: 700 }} numberOfLines={1}>
                {r.is_me ? 'You' : r.display_name}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {r.drives} drive{r.drives === 1 ? '' : 's'} · {r.drive_days} day{r.drive_days === 1 ? '' : 's'}
              </ThemedText>
            </View>
            <ThemedText style={styles.distance}>{formatDistance(units, r.distance_m)}</ThemedText>
          </Animated.View>
        ))
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, padding: Spacing.two, borderRadius: Radius.md },
  rank: { width: 28, textAlign: 'center', fontWeight: 800, fontSize: 16 },
  distance: { fontWeight: 800, fontVariant: ['tabular-nums'] },
});
