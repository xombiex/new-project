import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Image, Pressable, StyleSheet, View } from 'react-native';

import { sideImage } from '@/components/map/vehicle-sprites';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { specLine } from '@/lib/car-specs';
import type { Car } from '@/store/garage';

/** A garage card: name and year up top, a showroom render of the car below. */
export function CarCard({ car, primary, onMenu }: { car: Car; primary?: boolean; onMenu?: () => void }) {
  const theme = useTheme();
  const title = `${car.make} ${car.model}`;
  const subtitle = [car.year, car.nickname ? `“${car.nickname}”` : null].filter(Boolean).join(' · ');
  return (
    <View style={[styles.card, { backgroundColor: theme.backgroundElement, borderColor: primary ? theme.accent : theme.border }]}>
      <View style={styles.head}>
        <View style={{ flex: 1 }}>
          <ThemedText style={styles.title} numberOfLines={1}>
            {title}
          </ThemedText>
          {subtitle ? (
            <ThemedText type="small" themeColor="textSecondary">
              {subtitle}
            </ThemedText>
          ) : null}
          {specLine(car.specs) ? (
            <ThemedText type="smallBold" style={{ color: theme.accent, marginTop: 2 }} numberOfLines={1}>
              {specLine(car.specs)}
            </ThemedText>
          ) : null}
        </View>
        {onMenu ? (
          <Pressable onPress={onMenu} hitSlop={12} accessibilityRole="button" accessibilityLabel={`Options for ${title}`}>
            <MaterialCommunityIcons name="dots-horizontal" size={24} color={theme.textSecondary} />
          </Pressable>
        ) : null}
      </View>
      <View style={styles.stage}>
        {/* A soft spotlight on the floor under the car. */}
        <View style={[styles.floor, { backgroundColor: theme.backgroundSelected }]} />
        <Image source={sideImage(car.body, car.paint)} style={styles.car} resizeMode="contain" accessibilityLabel={title} />
        {primary ? (
          <View style={[styles.badge, { backgroundColor: theme.accent }]}>
            <MaterialCommunityIcons name="map-marker" size={12} color="#fff" />
            <ThemedText type="small" style={styles.badgeText}>
              On the map
            </ThemedText>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: Radius.lg, borderWidth: 1, paddingTop: Spacing.three, overflow: 'hidden' },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.two, paddingHorizontal: Spacing.three },
  title: { fontSize: 18, fontWeight: 800 },
  stage: { alignItems: 'center', justifyContent: 'flex-end', marginTop: -Spacing.two },
  floor: { position: 'absolute', bottom: Spacing.three + 4, width: '58%', height: 14, borderRadius: 999, opacity: 0.35 },
  car: { width: '100%', aspectRatio: 2 },
  badge: {
    position: 'absolute',
    left: Spacing.three,
    bottom: Spacing.three,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  badgeText: { color: '#fff', fontWeight: 700 },
});
