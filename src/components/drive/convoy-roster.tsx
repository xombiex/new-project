import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInLeft, LinearTransition } from 'react-native-reanimated';

import { Spacing } from '@/constants/theme';
import { formatDistance, speedIn, speedUnitLabel, type Units } from '@/lib/geo';
import type { RosterEntry } from '@/lib/roster';

export { convoyStop, rosterEntries } from '@/lib/roster';

/** Left-side stack of the convoy: avatar, name, current speed and miles from the stop. */
export function ConvoyRoster({ entries, units, stopLabel, maxHeight }: { entries: RosterEntry[]; units: Units; stopLabel: string | null; maxHeight?: number }) {
  const unit = speedUnitLabel(units);
  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <Text style={styles.caption} numberOfLines={1}>
        {stopLabel ? `To ${stopLabel}` : 'From you'}
      </Text>
      <ScrollView style={{ maxHeight }} contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
        {entries.map((e) => (
          <Animated.View key={e.id} entering={FadeInLeft.duration(250)} layout={LinearTransition.springify().damping(16)} style={[styles.card, e.me && styles.meCard, !e.live && { opacity: 0.6 }]}>
            <View style={[styles.avatar, { backgroundColor: e.color }]}>
              <Text style={styles.initial}>{e.me ? '★' : (e.name[0] ?? '?').toUpperCase()}</Text>
            </View>
            <View style={{ flexShrink: 1 }}>
              <Text style={styles.name} numberOfLines={1}>
                {e.name}
              </Text>
              <Text style={styles.stats} numberOfLines={1}>
                <Text style={styles.speed}>{e.live && e.speed != null ? Math.round(speedIn(units, e.speed)) : '—'}</Text> {unit}
                {e.awayM != null ? ` · ${e.awayM < 60 ? 'here' : formatDistance(units, e.awayM)}` : ''}
              </Text>
            </View>
          </Animated.View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: 156, gap: 4 },
  caption: {
    alignSelf: 'flex-start',
    color: '#fff',
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    backgroundColor: 'rgba(22,24,28,0.75)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    overflow: 'hidden',
    maxWidth: 156,
  },
  list: { gap: Spacing.one + 2 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    padding: 5,
    paddingRight: Spacing.two + 2,
    borderRadius: 999,
    backgroundColor: 'rgba(22,24,28,0.9)',
    alignSelf: 'flex-start',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  meCard: { borderWidth: 2, borderColor: '#5BB6FF', padding: 3 },
  avatar: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  initial: { color: '#fff', fontWeight: '900', fontSize: 14 },
  name: { color: '#fff', fontWeight: '800', fontSize: 13, maxWidth: 96 },
  stats: { color: '#B9C0CA', fontSize: 11, fontWeight: '600' },
  speed: { color: '#fff', fontWeight: '900', fontSize: 12 },
});
