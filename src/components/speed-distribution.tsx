import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { speedUnitLabel, type Units } from '@/lib/geo';
import { distribution, speedBands } from '@/lib/speed-bands';

/** Stacked bar of time spent in each speed band, with a legend underneath. */
export function SpeedDistribution({ hist, units }: { hist: number[] | undefined; units: Units }) {
  const theme = useTheme();
  const shares = distribution(hist, units);
  const bands = speedBands(units);

  return (
    <View style={{ gap: Spacing.two }}>
      <View style={styles.head}>
        <ThemedText type="smallBold" themeColor="textSecondary" style={styles.caps}>
          Speed distribution
        </ThemedText>
        <ThemedText type="smallBold" themeColor="textSecondary" style={styles.caps}>
          {speedUnitLabel(units)}
        </ThemedText>
      </View>
      {shares ? (
        <>
          <View style={[styles.bar, { backgroundColor: theme.backgroundSelected }]}>
            {shares.map((s, i) => (s > 0 ? <View key={i} style={{ flex: s, backgroundColor: bands[i].color }} /> : null))}
          </View>
          <View style={styles.legend}>
            {bands.map((b, i) => (
              <View key={b.label} style={styles.item}>
                <View style={styles.labelRow}>
                  <View style={[styles.dot, { backgroundColor: b.color }]} />
                  <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                    {b.label}
                  </ThemedText>
                </View>
                <ThemedText style={styles.pct}>{Math.round(shares[i] * 100)}%</ThemedText>
              </View>
            ))}
          </View>
        </>
      ) : (
        <ThemedText type="small" themeColor="textSecondary">
          Recorded before speed tracking was added. Your next drives will show it.
        </ThemedText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', justifyContent: 'space-between' },
  caps: { textTransform: 'uppercase', letterSpacing: 0.8, fontSize: 12 },
  bar: { flexDirection: 'row', height: 12, borderRadius: 6, overflow: 'hidden' },
  legend: { flexDirection: 'row' },
  item: { flex: 1, gap: 2 },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  pct: { fontWeight: 800, fontSize: 16 },
});
