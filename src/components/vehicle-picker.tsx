import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Image, Pressable, StyleSheet, View } from 'react-native';

import { sideImage } from '@/components/map/vehicle-sprites';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { PAINTS, VEHICLES, type Paint, type Vehicle } from '@/lib/vehicles';
import { useEntitled } from '@/store/pro';

/** 3D garage: pick a model (shown in the chosen paint, exactly as friends see it on the map) and a color. */
export function VehiclePicker({
  vehicle,
  paint,
  onChange,
}: {
  vehicle: Vehicle;
  paint: Paint;
  onChange: (v: { vehicle: Vehicle; paint: Paint }) => void;
}) {
  const theme = useTheme();
  const router = useRouter();
  const cosmetics = useEntitled('cosmetics');

  return (
    <View style={{ gap: Spacing.three }}>
      <View style={styles.hero}>
        <View style={[styles.heroPad, { backgroundColor: theme.backgroundSelected }]}>
          <Image source={sideImage(vehicle, paint)} style={styles.heroImg} resizeMode="contain" accessibilityIgnoresInvertColors />
        </View>
        <ThemedText type="smallBold">{VEHICLES.find((v) => v.value === vehicle)?.label}</ThemedText>
      </View>

      <View style={styles.swatches}>
        {PAINTS.map((p) => (
          <Pressable
            key={p.value}
            onPress={() => onChange({ vehicle, paint: p.value })}
            accessibilityRole="button"
            accessibilityLabel={`${p.label} paint`}
            accessibilityState={{ selected: p.value === paint }}
            style={[styles.swatch, { backgroundColor: p.hex, borderColor: p.value === paint ? theme.text : theme.backgroundSelected }]}
          />
        ))}
      </View>

      <View style={styles.grid}>
        {VEHICLES.map((v) => {
          const selected = v.value === vehicle;
          const locked = v.premium && !cosmetics;
          return (
            <Pressable
              key={v.value}
              onPress={() =>
                locked ? router.push({ pathname: '/paywall', params: { offering: 'cosmetics' } }) : onChange({ vehicle: v.value, paint })
              }
              accessibilityRole="button"
              accessibilityLabel={`${v.label}${locked ? ', part of the Style Pack' : ''}`}
              accessibilityState={{ selected }}
              style={[styles.tile, { backgroundColor: theme.backgroundElement, borderColor: selected ? theme.accent : 'transparent' }]}>
              <Image
                source={sideImage(v.value, paint)}
                style={[styles.tileImg, locked && { opacity: 0.45 }]}
                resizeMode="contain"
                accessibilityIgnoresInvertColors
              />
              <ThemedText type="small" style={{ fontWeight: 600 }} numberOfLines={1}>
                {v.label}
              </ThemedText>
              {locked ? <MaterialCommunityIcons name="lock" size={14} color={theme.textSecondary} style={styles.lock} /> : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', gap: Spacing.two },
  heroPad: { width: '100%', maxWidth: 360, borderRadius: Radius.lg, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  heroImg: { width: '100%', aspectRatio: 2 },
  swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two, justifyContent: 'center' },
  swatch: { width: 32, height: 32, borderRadius: 16, borderWidth: 3 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  tile: { width: '31%', flexGrow: 1, alignItems: 'center', borderRadius: Radius.md, borderWidth: 2, paddingBottom: Spacing.two, overflow: 'hidden' },
  tileImg: { width: '100%', aspectRatio: 2, marginTop: 2 },
  lock: { position: 'absolute', top: 8, right: 8 },
});
