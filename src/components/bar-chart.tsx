import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { Bar } from '@/lib/stats';

type Props = {
  bars: Bar[];
  height?: number;
  /** index of the bar to emphasize (e.g. today) */
  highlight?: number;
  /** show every Nth label to avoid crowding (month view) */
  labelEvery?: number;
};

export function BarChart({ bars, height = 140, highlight, labelEvery = 1 }: Props) {
  const theme = useTheme();
  const max = Math.max(...bars.map((b) => b.value), 1);
  return (
    <View accessibilityRole="image" accessibilityLabel="Distance per period chart">
      <View style={[styles.plot, { height }]}>
        {bars.map((b, i) => (
          <View key={b.start} style={styles.col}>
            <View
              style={[
                styles.bar,
                {
                  height: b.value > 0 ? Math.max(4, (b.value / max) * height) : 3,
                  backgroundColor: b.value > 0 ? theme.speed : theme.backgroundSelected,
                  opacity: highlight == null || i === highlight || b.value === 0 ? 1 : 0.55,
                },
              ]}
            />
          </View>
        ))}
      </View>
      <View style={styles.labels}>
        {bars.map((b, i) => (
          <ThemedText
            key={b.start}
            type="small"
            themeColor={i === highlight ? 'text' : 'textSecondary'}
            style={[styles.label, i === highlight && { fontWeight: 800 }]}
            numberOfLines={1}>
            {i % labelEvery === 0 || i === highlight ? b.label : ''}
          </ThemedText>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  plot: { flexDirection: 'row', alignItems: 'flex-end', gap: 3 },
  col: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', height: '100%' },
  bar: { width: '78%', borderRadius: 4 },
  labels: { flexDirection: 'row', gap: 3, marginTop: Spacing.one },
  label: { flex: 1, textAlign: 'center', fontSize: 11 },
});
