import { Platform, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { speedIn, speedUnitLabel, type Units } from '@/lib/geo';
import { limitMps, type SpeedLimit } from '@/lib/speed-limit';

import { SpeedLimitSign } from './speed-limit-sign';

/** Tall, narrow numerals like a car's cluster display. */
const CONDENSED = Platform.select({ ios: 'AvenirNextCondensed-Bold', android: 'sans-serif-condensed', default: '"Arial Narrow", "Roboto Condensed", system-ui, sans-serif' });

const SIZE = 104;
const STROKE = 6;
const R = SIZE / 2 - STROKE / 2;
const C = SIZE / 2;
/** Smallest arc drawn: the little "slit" at the bottom when you're stopped. */
const MIN_FRACTION = 0.06;

const GREEN = '#5BD87A';
const RED = '#FF4D3D';
const IDLE = '#77736B';

/** Point on the ring, angle in degrees clockwise from 3 o'clock (90 = bottom). */
function at(deg: number) {
  const a = (deg * Math.PI) / 180;
  return `${(C + R * Math.cos(a)).toFixed(2)} ${(C + R * Math.sin(a)).toFixed(2)}`;
}

/** An arc centered on the bottom of the ring covering `fraction` of the circle. */
export function bottomArc(fraction: number): string | null {
  const f = Math.min(1, Math.max(0, fraction));
  if (f >= 0.999) return null; // full ring: drawn as a circle
  const half = f * 180;
  return `M ${at(90 - half)} A ${R} ${R} 0 ${f > 0.5 ? 1 : 0} 1 ${at(90 + half)}`;
}

/** How far around the ring to go: your speed as a share of the limit (or just the slit). */
export function ringFraction(mps: number | null, limit: SpeedLimit | null): number {
  if (mps == null || !limit) return MIN_FRACTION;
  return Math.max(MIN_FRACTION, Math.min(1, mps / limitMps(limit)));
}

/**
 * Round speed dial with the posted limit beside it. The ring in the rim fills up from the bottom
 * as you approach the limit (green), and turns into a full red ring when you're over.
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
  const fraction = speeding ? 1 : ringFraction(mps, limit);
  const color = speeding ? RED : mps == null ? IDLE : GREEN;
  const arc = bottomArc(fraction);
  return (
    <View style={styles.wrap} accessibilityRole="text" accessibilityLabel={`${value} ${unit}${speeding ? ', over the limit' : ''}`}>
      <View style={styles.dial}>
        <Svg width={SIZE} height={SIZE} style={StyleSheet.absoluteFill}>
          <Circle cx={C} cy={C} r={R} stroke="rgba(255,255,255,0.07)" strokeWidth={STROKE} fill="none" />
          {arc ? (
            <Path d={arc} stroke={color} strokeWidth={STROKE} strokeLinecap="round" fill="none" />
          ) : (
            <Circle cx={C} cy={C} r={R} stroke={color} strokeWidth={STROKE} fill="none" />
          )}
        </Svg>
        <View style={[styles.face, speeding && styles.faceOver]}>
          <Text style={[styles.value, speeding && { color: RED }]} numberOfLines={1} adjustsFontSizeToFit>
            {value}
          </Text>
          <Text style={styles.unit}>{unit}</Text>
        </View>
      </View>
      {limit ? <SpeedLimitSign limit={limit} units={units} speedMps={mps} variant={variant} compact /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dial: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    backgroundColor: '#2B2A27',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 8,
  },
  face: {
    width: SIZE - STROKE * 2 - 6,
    height: SIZE - STROKE * 2 - 6,
    borderRadius: SIZE,
    backgroundColor: '#3D3B37',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  faceOver: { backgroundColor: '#45302D' },
  value: { color: '#FFF4D6', fontFamily: CONDENSED, fontSize: 42, lineHeight: 44, fontWeight: '800', fontVariant: ['tabular-nums'], paddingHorizontal: 6 },
  unit: { color: '#E9E0C8', fontSize: 13, lineHeight: 15, fontWeight: '500', marginTop: -2 },
});
