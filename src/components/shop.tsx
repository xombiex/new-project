import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useEffect, type ReactNode } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { ThemedText } from '@/components/themed-text';
import { Display, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { odometerDigits } from '@/lib/odometer';

// The app's car-culture parts: things you'd actually find in a garage or on a dash, drawn plainly.

/** Three slanted rally stripes, fading back. The one bit of decoration next to screen titles. */
export function Stripes({ color, size = 18 }: { color?: string; size?: number }) {
  const theme = useTheme();
  return (
    <View style={styles.stripes} accessibilityElementsHidden importantForAccessibility="no">
      {[1, 0.55, 0.25].map((opacity) => (
        <View key={opacity} style={{ width: size * 0.32, height: size, backgroundColor: color ?? theme.accent, opacity, transform: [{ skewX: '-18deg' }] }} />
      ))}
    </View>
  );
}

/** Screen heading: a stamped line above a big italic title, the way a badge sits on a fender. */
export function ScreenTitle({ kicker, title, right }: { kicker: string; title: string; right?: ReactNode }) {
  return (
    <View style={styles.titleRow}>
      <View style={{ flex: 1 }}>
        <View style={styles.kickerRow}>
          <Stripes size={12} />
          <ThemedText type="label" themeColor="textSecondary" numberOfLines={1} style={{ flexShrink: 1 }}>
            {kicker}
          </ThemedText>
        </View>
        <ThemedText type="display" numberOfLines={1}>
          {title}
        </ThemedText>
      </View>
      {right}
    </View>
  );
}

const PLATE_TEXT = '#1B1A17';
const PLATE_FACE = '#F4EFE2';

/**
 * A license plate. Group drive codes and usernames are the same idea as a vanity plate: a short
 * string you tell people so they can find you.
 */
export function LicensePlate({ text, width = 180, top = 'CONVOY', bottom = 'DRIVE TOGETHER', style }: { text: string; width?: number; top?: string | null; bottom?: string | null; style?: StyleProp<ViewStyle> }) {
  const theme = useTheme();
  const height = width / 2;
  const full = Boolean(top || bottom);
  // Long usernames shrink to stay on the plate.
  const fontSize = Math.min(height * (full ? 0.58 : 0.74), (width * 1.75) / Math.max(text.length, 1));
  const rivet = Math.max(3, width * 0.028);
  return (
    <View style={[styles.plate, { width, height, borderRadius: width * 0.05, borderWidth: Math.max(1, width * 0.012) }, style]}>
      {[{ left: width * 0.05 }, { right: width * 0.05 }].map((side, i) => (
        <View key={i} style={[styles.rivet, side, { top: height * 0.1, width: rivet, height: rivet, borderRadius: rivet / 2 }]} />
      ))}
      {top ? <Text style={[styles.plateBand, { fontSize: height * 0.14, lineHeight: height * 0.17, color: theme.accent }]}>{top}</Text> : null}
      <Text numberOfLines={1} style={[styles.plateText, { fontSize, lineHeight: fontSize * 1.06 }]}>
        {text.toUpperCase()}
      </Text>
      {bottom ? <Text style={[styles.plateBand, { fontSize: height * 0.11, lineHeight: height * 0.14, color: PLATE_TEXT }]}>{bottom}</Text> : null}
    </View>
  );
}

const DRUM_H = 46;
const DRUM_W = 30;

/** One wheel of the odometer. Rolls to its digit once when the screen opens. */
function Drum({ digit, tenth, delay }: { digit: number; tenth?: boolean; delay: number }) {
  const y = useSharedValue(0);
  useEffect(() => {
    y.value = withDelay(delay, withTiming(-digit * DRUM_H, { duration: 700, easing: Easing.bezier(0.23, 1, 0.32, 1) }));
  }, [digit, delay, y]);
  const rolling = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
  return (
    <View style={[styles.drum, tenth && styles.drumTenth]}>
      <Animated.View style={rolling}>
        {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
          <Text key={n} style={[styles.drumDigit, tenth && { color: PLATE_TEXT }]}>
            {n}
          </Text>
        ))}
      </Animated.View>
    </View>
  );
}

/** A mechanical odometer: dark drums, a white tenths wheel, your lifetime distance. */
export function Odometer({ value, unit }: { value: number; unit: string }) {
  const digits = odometerDigits(value);
  return (
    <View style={styles.odoRow} accessibilityRole="text" accessibilityLabel={`Odometer: ${value.toFixed(1)} ${unit}`}>
      <View style={styles.odoWindow}>
        {digits.map((d, i) => (
          <Drum key={i} digit={d} tenth={i === digits.length - 1} delay={i * 70} />
        ))}
        {/* The drums curve away at the top and bottom of the window. */}
        <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
          <Defs>
            <LinearGradient id="odo-curve" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="#000" stopOpacity={0.6} />
              <Stop offset="0.3" stopColor="#000" stopOpacity={0} />
              <Stop offset="0.7" stopColor="#000" stopOpacity={0} />
              <Stop offset="1" stopColor="#000" stopOpacity={0.6} />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill="url(#odo-curve)" />
        </Svg>
      </View>
      <ThemedText type="label" themeColor="textSecondary">
        {unit}
      </ThemedText>
    </View>
  );
}

/** A car-show dash plaque: what you bring home from an event. Riveted, and lit up once earned. */
export function DashPlaque({ icon, title, description, earned, progress }: { icon: string; title: string; description: string; earned: boolean; progress: number }) {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.plaque,
        { backgroundColor: earned ? theme.accent + '1F' : theme.backgroundElement, borderColor: earned ? theme.accent : theme.border },
      ]}>
      {[styles.tl, styles.tr, styles.bl, styles.br].map((corner, i) => (
        <View key={i} style={[styles.plaqueRivet, corner, { backgroundColor: earned ? theme.accent : theme.backgroundSelected }]} />
      ))}
      <MaterialCommunityIcons name={icon as 'fire'} size={28} color={earned ? theme.accent : theme.textSecondary} />
      <ThemedText type="label" numberOfLines={1} style={styles.plaqueTitle} themeColor={earned ? 'text' : 'textSecondary'}>
        {title}
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary" numberOfLines={3} style={{ textAlign: 'center' }}>
        {description}
      </ThemedText>
      {!earned ? (
        <View style={[styles.plaqueTrack, { backgroundColor: theme.backgroundSelected }]}>
          <View style={[styles.plaqueFill, { width: `${Math.min(100, progress * 100)}%`, backgroundColor: theme.accent }]} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  stripes: { flexDirection: 'row', gap: 2 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  kickerRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  plate: { backgroundColor: PLATE_FACE, borderColor: PLATE_TEXT, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  rivet: { position: 'absolute', backgroundColor: '#8E897B' },
  plateBand: { fontFamily: Display.bold, letterSpacing: 1.5, textAlign: 'center' },
  plateText: { fontFamily: Display.bold, color: PLATE_TEXT, letterSpacing: 1.5, textAlign: 'center', textShadowColor: 'rgba(255,255,255,0.9)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 0 },
  odoRow: { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.two },
  odoWindow: { flexDirection: 'row', gap: 2, backgroundColor: '#050504', padding: 3, borderRadius: 6, overflow: 'hidden' },
  drum: { width: DRUM_W, height: DRUM_H, overflow: 'hidden', backgroundColor: '#1B1A17', borderRadius: 2 },
  drumTenth: { backgroundColor: PLATE_FACE },
  drumDigit: { height: DRUM_H, lineHeight: DRUM_H, textAlign: 'center', fontFamily: Display.bold, fontSize: 36, color: '#F4EFE2' },
  plaque: { flexBasis: '40%', flexGrow: 1, maxWidth: '49%', alignItems: 'center', gap: Spacing.one, borderWidth: 1.5, borderRadius: 8, paddingVertical: Spacing.three, paddingHorizontal: Spacing.three },
  plaqueRivet: { position: 'absolute', width: 5, height: 5, borderRadius: 2.5 },
  tl: { top: 6, left: 6 },
  tr: { top: 6, right: 6 },
  bl: { bottom: 6, left: 6 },
  br: { bottom: 6, right: 6 },
  plaqueTitle: { textAlign: 'center' },
  plaqueTrack: { alignSelf: 'stretch', height: 4, borderRadius: 2, overflow: 'hidden', marginTop: Spacing.one },
  plaqueFill: { height: '100%' },
});
