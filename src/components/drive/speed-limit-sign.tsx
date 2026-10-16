import { StyleSheet, Text, View } from 'react-native';

import type { Units } from '@/lib/geo';
import { limitIn, limitMps, type SpeedLimit } from '@/lib/speed-limit';

/** Allowance before we flag speeding: GPS speed is noisy and speedometers read high. */
const TOLERANCE_MPS = 1.5;

/** Posted limit, styled like the real sign: US rectangle in mph, European red circle in km/h. */
export function SpeedLimitSign({ limit, units, speedMps }: { limit: SpeedLimit; units: Units; speedMps: number | null }) {
  const value = limitIn(units, limit);
  const over = speedMps != null && speedMps > limitMps(limit) + TOLERANCE_MPS;
  const label = `Speed limit ${value} ${units === 'imperial' ? 'miles' : 'kilometers'} per hour${over ? ', you are over the limit' : ''}`;

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
});
