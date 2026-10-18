import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, LinearTransition } from 'react-native-reanimated';

import { Spacing } from '@/constants/theme';
import { formatDistance, type Units } from '@/lib/geo';
import type { LineupEntry } from '@/lib/lineup';

function label(e: LineupEntry, i: number, units: Units) {
  if (e.arrived) return 'Arrived';
  if (e.me) return i === 0 ? 'You · leading' : 'You';
  if (e.coord == null || e.stale) return 'Lost signal';
  if (e.gapM == null) return i === 0 ? 'Leading' : '';
  if (Math.abs(e.gapM) < 40) return 'With you';
  return `${formatDistance(units, Math.abs(e.gapM))} ${e.gapM > 0 ? 'ahead' : 'behind'}`;
}

/** Everyone in the group drive, front to back, with how far ahead or behind you they are. */
export function ConvoyLineup({ entries, units }: { entries: LineupEntry[]; units: Units }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row} style={styles.scroll}>
      {entries.map((e, i) => (
        <Animated.View key={e.id} entering={FadeIn.duration(200)} layout={LinearTransition.springify().damping(16)} style={[styles.chip, e.me && styles.meChip]}>
          <View style={[styles.dot, { backgroundColor: e.color, opacity: e.stale || !e.coord ? 0.45 : 1 }]}>
            <Text style={styles.pos}>{i + 1}</Text>
          </View>
          <View>
            <Text style={styles.name} numberOfLines={1}>
              {e.me ? 'You' : e.name.split(' ')[0]}
            </Text>
            <Text style={[styles.gap, (e.stale || !e.coord) && !e.me && { color: '#FFB4A8' }]} numberOfLines={1}>
              {label(e, i, units)}
            </Text>
          </View>
        </Animated.View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 0, alignSelf: 'stretch' },
  row: { gap: Spacing.two, paddingVertical: 2 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingLeft: 6,
    paddingRight: Spacing.three,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(22,24,28,0.88)',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  meChip: { borderWidth: 2, borderColor: '#5BB6FF', paddingVertical: 3 },
  dot: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  pos: { color: '#fff', fontWeight: '900', fontSize: 13 },
  name: { color: '#fff', fontWeight: '800', fontSize: 13, maxWidth: 90 },
  gap: { color: '#B9C0CA', fontSize: 11, fontWeight: '600' },
});
