import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Card } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { scoutRank, useCameras, type ScoutStats } from '@/store/cameras';

const RANK_ICON: Record<string, string> = {
  Rookie: 'binoculars',
  Spotter: 'eye-outline',
  Scout: 'compass-outline',
  Ranger: 'shield-star-outline',
  Legend: 'crown-outline',
};

/** Your Camera Scout rank: points from confirmed camera finds and helpful votes. */
export function ScoutCard() {
  const theme = useTheme();
  const [stats, setStats] = useState<ScoutStats | null>(null);

  useFocusEffect(
    useCallback(() => {
      void useCameras.getState().scout().then(setStats);
    }, [])
  );

  if (!stats) return null;
  const rank = scoutRank(stats.points);
  const progress = rank.next ? (stats.points - rank.min) / (rank.next.min - rank.min) : 1;

  return (
    <Card style={{ gap: Spacing.three }}>
      <View style={styles.row}>
        <View style={[styles.badge, { backgroundColor: theme.accent }]}>
          <MaterialCommunityIcons name={RANK_ICON[rank.name] as 'binoculars'} size={26} color="#fff" />
        </View>
        <View style={{ flex: 1 }}>
          <ThemedText style={{ fontWeight: 800, fontSize: 18 }}>Camera {rank.name}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {stats.points} points{rank.weight > 1 ? ` · your votes count ${rank.weight}×` : ''}
          </ThemedText>
        </View>
      </View>
      <View>
        <View style={[styles.track, { backgroundColor: theme.backgroundSelected }]}>
          <View style={[styles.fill, { backgroundColor: theme.accent, width: `${Math.max(4, Math.round(progress * 100))}%` }]} />
        </View>
        <ThemedText type="small" themeColor="textSecondary" style={{ marginTop: 4 }}>
          {rank.next ? `${rank.next.min - stats.points} to ${rank.next.name}${rank.next.weight > rank.weight ? ` (votes count ${rank.next.weight}×)` : ''}` : 'Top rank. Legendary.'}
        </ThemedText>
      </View>
      <View style={styles.stats}>
        {[
          { label: 'Confirmed finds', value: stats.verified },
          { label: 'Waiting', value: stats.pending },
          { label: 'Votes', value: stats.votes },
        ].map((s) => (
          <View key={s.label} style={{ flex: 1 }}>
            <ThemedText style={{ fontWeight: 800, fontSize: 20 }}>{s.value}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {s.label}
            </ThemedText>
          </View>
        ))}
      </View>
      <ThemedText type="small" themeColor="textSecondary">
        Report cameras from the ⚠️ button on the map. 10 points when one you found gets confirmed, 2 for helping confirm one, 1 for every vote
        that turns out right.
      </ThemedText>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  badge: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  track: { height: 8, borderRadius: 4, overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4 },
  stats: { flexDirection: 'row' },
});
