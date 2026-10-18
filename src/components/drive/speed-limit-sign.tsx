import { Image, Platform, StyleSheet, Text, View } from 'react-native';

import type { Units } from '@/lib/geo';
import { limitIn, limitMps, type SpeedLimit } from '@/lib/speed-limit';

/** Allowance before we flag speeding: GPS speed is noisy and speedometers read high. */
const TOLERANCE_MPS = 1.5;

/** Posted limit, styled like the real sign: US rectangle in mph, European red circle in km/h. */
export function SpeedLimitSign({
  limit,
  units,
  speedMps,
  variant,
  compact,
}: {
  limit: SpeedLimit;
  units: Units;
  speedMps: number | null;
  /** Themed signs: a pixel sheep with a wooden sign (Blocks), or a glowing outline (Neon City) */
  variant?: 'blocks' | 'neon' | null;
  /** Small square badge (just the number), as worn on the speed dial */
  compact?: boolean;
}) {
  const value = limitIn(units, limit);
  const over = speedMps != null && speedMps > limitMps(limit) + TOLERANCE_MPS;
  const label = `Speed limit ${value} ${units === 'imperial' ? 'miles' : 'kilometers'} per hour${over ? ', you are over the limit' : ''}`;

  if (variant === 'neon') {
    return (
      <View accessibilityRole="text" accessibilityLabel={label} style={[styles.neon, over && styles.neonOver]}>
        <Text style={[styles.neonCaption, over && styles.neonRed]}>LIMIT</Text>
        <Text style={[styles.neonValue, over && styles.neonRed]}>{value}</Text>
      </View>
    );
  }

  if (variant === 'blocks') {
    return (
      <View accessibilityRole="text" accessibilityLabel={label} style={styles.blocks}>
        <Image source={require('../../../assets/themes/blocks/sheep.png')} style={styles.sheep} />
        <View style={[styles.plank, over && styles.plankOver]}>
          <Text style={[styles.plankText, over && styles.white]}>{value}</Text>
        </View>
        <View style={styles.post} />
      </View>
    );
  }

  if (compact) {
    return (
      <View accessibilityRole="text" accessibilityLabel={label} style={[units === 'imperial' ? styles.badge : styles.badgeEu, over && styles.badgeOver]}>
        <Text style={[styles.badgeValue, over && styles.white]} numberOfLines={1} adjustsFontSizeToFit>
          {value}
        </Text>
      </View>
    );
  }

  if (units === 'imperial') {
    return (
      <View accessibilityRole="text" accessibilityLabel={label} style={[styles.us, over && styles.usOver]}>
        <View style={[styles.usInner, over && { borderColor: '#fff' }]}>
          <Text style={[styles.usCaption, over && styles.white]}>SPEED{'\n'}LIMIT</Text>
          <Text style={[styles.usValue, over && styles.white]}>{value}</Text>
        </View>
      </View>
    );
  }
  return (
    <View accessibilityRole="text" accessibilityLabel={label} style={[styles.eu, over && styles.euOver]}>
      <Text style={[styles.euValue, over && styles.white]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
    </View>
  );
}

const shadow = {
  shadowColor: '#000',
  shadowOpacity: 0.3,
  shadowRadius: 6,
  shadowOffset: { width: 0, height: 2 },
  elevation: 5,
};

const styles = StyleSheet.create({
  us: { width: 60, padding: 3, borderRadius: 9, backgroundColor: '#fff', ...shadow },
  usOver: { backgroundColor: '#E5281F' },
  usInner: { borderWidth: 2, borderColor: '#111', borderRadius: 6, alignItems: 'center', paddingTop: 4, paddingBottom: 2 },
  usCaption: { color: '#111', fontSize: 10, lineHeight: 11, fontWeight: '800', textAlign: 'center', letterSpacing: 0.3 },
  usValue: { color: '#111', fontSize: 28, lineHeight: 32, fontWeight: '900', fontVariant: ['tabular-nums'] },
  eu: { width: 62, height: 62, borderRadius: 31, borderWidth: 7, borderColor: '#E5281F', backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', ...shadow },
  euOver: { backgroundColor: '#E5281F', borderColor: '#fff' },
  euValue: { color: '#111', fontSize: 24, fontWeight: '900', fontVariant: ['tabular-nums'], paddingHorizontal: 4 },
  white: { color: '#fff' },
  badge: { width: 56, height: 56, borderRadius: 8, borderWidth: 5, borderColor: '#3A362F', backgroundColor: '#FFF9EA', alignItems: 'center', justifyContent: 'center', ...shadow },
  badgeEu: { width: 56, height: 56, borderRadius: 28, borderWidth: 6, borderColor: '#E5281F', backgroundColor: '#FFF9EA', alignItems: 'center', justifyContent: 'center', ...shadow },
  badgeOver: { backgroundColor: '#E5281F', borderColor: '#fff' },
  badgeValue: {
    color: '#111',
    fontSize: 30,
    lineHeight: 34,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
    paddingHorizontal: 3,
    fontFamily: Platform.select({ ios: 'AvenirNextCondensed-Bold', android: 'sans-serif-condensed', default: '"Arial Narrow", "Roboto Condensed", system-ui, sans-serif' }),
  },
  neon: {
    width: 62,
    paddingVertical: 4,
    alignItems: 'center',
    backgroundColor: 'rgba(5,6,10,0.85)',
    borderWidth: 2,
    borderColor: '#3AF2FF',
    borderRadius: 4,
    shadowColor: '#3AF2FF',
    shadowOpacity: 0.9,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
    elevation: 8,
  },
  neonOver: { borderColor: '#FF3B4E', shadowColor: '#FF3B4E' },
  neonCaption: { color: '#3AF2FF', fontSize: 10, fontWeight: '800', letterSpacing: 2, fontFamily: 'monospace' },
  neonValue: {
    color: '#3AF2FF',
    fontSize: 28,
    lineHeight: 32,
    fontWeight: '900',
    fontFamily: 'monospace',
    textShadowColor: '#3AF2FF',
    textShadowRadius: 8,
    textShadowOffset: { width: 0, height: 0 },
  },
  neonRed: { color: '#FF3B4E', textShadowColor: '#FF3B4E' },
  blocks: { alignItems: 'center', width: 70 },
  sheep: { width: 52, height: 52, marginBottom: -14 },
  plank: { minWidth: 54, paddingHorizontal: 6, paddingVertical: 2, backgroundColor: '#A0763F', borderWidth: 3, borderColor: '#6B4A23', alignItems: 'center', ...shadow },
  plankOver: { backgroundColor: '#C0392B', borderColor: '#7A1F15' },
  plankText: { color: '#2B1B0B', fontSize: 24, fontWeight: '900', fontFamily: 'monospace', fontVariant: ['tabular-nums'] },
  post: { width: 6, height: 10, backgroundColor: '#6B4A23' },
});
