import { Platform, StyleSheet, Text, View } from 'react-native';

import { speedIn, speedUnitLabel, type Units } from '@/lib/geo';
import type { SpeedLimit } from '@/lib/speed-limit';

import { SpeedLimitSign } from './speed-limit-sign';

/** Tall, narrow numerals like a car's cluster display. */
const CONDENSED = Platform.select({ ios: 'AvenirNextCondensed-Bold', android: 'sans-serif-condensed', default: '"Arial Narrow", "Roboto Condensed", system-ui, sans-serif' });

/**
 * Round speed dial with the posted limit tucked on its shoulder: dark face, big speed, unit,
 * and a GPS pill at the bottom (green = live fix, grey = waiting). Turns red when you're over.
 */
export function SpeedDial({
  mps,
  units,
  limit,
  speeding,
  variant,
}: {
  /** null = no fresh GPS fix */
  mps: number | null;
  units: Units;
  limit: SpeedLimit | null;
  speeding: boolean;
  variant?: 'blocks' | 'neon' | null;
}) {
  const value = mps == null ? '--' : String(Math.round(speedIn(units, mps)));
  const unit = speedUnitLabel(units);
  return (
    <View style={styles.wrap} accessibilityRole="text" accessibilityLabel={`${value} ${unit}${speeding ? ', over the limit' : ''}`}>
      <View style={[styles.dial, speeding && styles.dialOver]}>
        <View style={styles.face}>
          <Text style={[styles.value, speeding && styles.red]} numberOfLines={1} adjustsFontSizeToFit>
            {value}
          </Text>
          <Text style={styles.unit}>{unit}</Text>
          <View style={[styles.gps, { backgroundColor: mps == null ? '#77736B' : '#7BD88F' }]} />
        </View>
      </View>
      {limit ? (
        <View style={styles.badge}>
          <SpeedLimitSign limit={limit} units={units} speedMps={mps} variant={variant} compact />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: 142, height: 114, justifyContent: 'flex-end' },
  dial: {
    width: 104,
    height: 104,
    borderRadius: 52,
    padding: 5,
    backgroundColor: '#2B2A27',
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 8,
  },
  dialOver: { backgroundColor: '#C9372C' },
  face: {
    flex: 1,
    borderRadius: 47,
    backgroundColor: '#3D3B37',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 4,
  },
  value: { color: '#FFF4D6', fontFamily: CONDENSED, fontSize: 46, lineHeight: 48, fontWeight: '800', fontVariant: ['tabular-nums'], paddingHorizontal: 6 },
  red: { color: '#FF6B5E' },
  unit: { color: '#E9E0C8', fontSize: 14, lineHeight: 16, fontWeight: '500', marginTop: -2 },
  gps: { width: 14, height: 7, borderRadius: 4, marginTop: 6, borderWidth: 1, borderColor: 'rgba(0,0,0,0.35)' },
  badge: { position: 'absolute', top: 0, right: 0 },
});
