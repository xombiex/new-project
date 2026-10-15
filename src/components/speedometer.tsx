import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { speedIn, speedUnitLabel, type Units } from '@/lib/geo';
import { isAccurate, reportedSpeed, type LocationSample } from '@/lib/trip-recorder';

type Props = { sample: LocationSample | null; units: Units; stale: boolean };

export function Speedometer({ sample, units, stale }: Props) {
  const theme = useTheme();
  const mps = sample ? reportedSpeed(sample) : null;
  const speed = mps == null ? null : Math.round(speedIn(units, mps));
  const gps = !sample || stale ? 'none' : isAccurate(sample) ? 'good' : 'weak';
  const gpsColor = { good: theme.success, weak: theme.warning, none: theme.danger }[gps];
  const gpsLabel = {
    good: `GPS ±${Math.round(sample?.accuracy ?? 0)} m`,
    weak: `Weak GPS ±${Math.round(sample?.accuracy ?? 0)} m`,
    none: sample ? 'GPS signal lost' : 'Waiting for GPS…',
  }[gps];

  return (
    <View style={styles.wrap} accessibilityRole="text" accessibilityLabel={`${speed ?? 'unknown'} ${speedUnitLabel(units)}`}>
      <ThemedText style={[styles.speed, gps !== 'good' && { color: theme.textSecondary }]}>
        {speed ?? '--'}
      </ThemedText>
      <ThemedText style={styles.unit} themeColor="textSecondary">
        {speedUnitLabel(units)}
      </ThemedText>
      <View style={[styles.gps, { backgroundColor: theme.backgroundSelected }]}>
        <View style={[styles.dot, { backgroundColor: gpsColor }]} />
        <ThemedText type="small" themeColor="textSecondary">
          {gpsLabel}
        </ThemedText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center' },
  speed: { fontSize: 84, lineHeight: 88, fontWeight: 800, fontVariant: ['tabular-nums'], letterSpacing: -2 },
  unit: { fontSize: 16, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1.5, marginTop: -4 },
  gps: {
    marginTop: Spacing.two,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one + 2,
    paddingHorizontal: Spacing.two + 2,
    paddingVertical: Spacing.half + 1,
    borderRadius: Radius.pill,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
});
