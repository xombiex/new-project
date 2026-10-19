import { MaterialCommunityIcons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { CarSpecs } from '@/lib/car-specs';

/** Spec grid for a car: performance up top, then drivetrain, engine and economy. */
export function SpecSheet({ specs }: { specs: CarSpecs }) {
  const theme = useTheme();
  const custom = new Set(specs.custom ?? []);
  const tiles = [
    { key: 'hp', icon: 'engine-outline', label: 'Horsepower', value: specs.hp ? `${specs.hp} hp` : null },
    { key: 'torque', icon: 'rotate-right', label: 'Torque', value: specs.torque ? `${specs.torque} lb-ft` : null },
    { key: 'zeroToSixty', icon: 'timer-outline', label: '0–60 mph', value: specs.zeroToSixty ? `${specs.zeroToSixty.toFixed(1)} s` : null },
    { key: 'topSpeedMph', icon: 'speedometer', label: 'Top speed', value: specs.topSpeedMph ? `${specs.topSpeedMph} mph` : null },
  ].filter((t) => t.value);
  const rows = [
    { icon: 'car-traction-control', label: 'Drivetrain', value: specs.drivetrain },
    { icon: 'cog-outline', label: 'Transmission', value: specs.transmission },
    { icon: 'piston', label: 'Engine', value: specs.engine },
    { icon: 'gas-station-outline', label: 'Fuel', value: specs.fuel },
    {
      icon: 'leaf',
      label: specs.evRangeMi ? 'Range' : 'MPG',
      value: specs.evRangeMi ? `${specs.evRangeMi} mi` : specs.mpgComb ? `${specs.mpgCity ?? '–'} city / ${specs.mpgHwy ?? '–'} hwy · ${specs.mpgComb} combined` : null,
    },
    { icon: 'shape-outline', label: 'Class', value: specs.vehicleClass },
  ].filter((r) => r.value);

  return (
    <View style={{ gap: Spacing.three }}>
      {tiles.length ? (
        <View style={styles.tiles}>
          {tiles.map((t) => (
            <View key={t.key} style={[styles.tile, { backgroundColor: theme.backgroundElement }]}>
              <View style={styles.tileHead}>
                <MaterialCommunityIcons name={t.icon as 'speedometer'} size={14} color={theme.textSecondary} />
                <ThemedText type="small" themeColor="textSecondary">
                  {t.label}
                </ThemedText>
              </View>
              <ThemedText style={styles.tileValue} numberOfLines={1} adjustsFontSizeToFit>
                {t.value}
              </ThemedText>
              {custom.has(t.key as 'hp') ? (
                <ThemedText type="small" style={{ color: theme.accent, fontWeight: 700 }}>
                  Your build
                </ThemedText>
              ) : null}
            </View>
          ))}
        </View>
      ) : null}
      {rows.length ? (
        <View style={[styles.list, { backgroundColor: theme.backgroundElement }]}>
          {rows.map((r, i) => (
            <View key={r.label} style={[styles.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border }]}>
              <MaterialCommunityIcons name={r.icon as 'cog-outline'} size={18} color={theme.textSecondary} />
              <ThemedText themeColor="textSecondary" style={{ width: 104 }}>
                {r.label}
              </ThemedText>
              <ThemedText style={{ flex: 1, fontWeight: 600 }}>{r.value}</ThemedText>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  tile: { flexGrow: 1, flexBasis: '45%', borderRadius: Radius.md, padding: Spacing.three, gap: 2 },
  tileHead: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  tileValue: { fontSize: 24, lineHeight: 30, fontWeight: 800 },
  list: { borderRadius: Radius.md, paddingHorizontal: Spacing.three },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.three },
});
