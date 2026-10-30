import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { sideImage } from '@/components/map/vehicle-sprites';
import { ThemedText } from '@/components/themed-text';
import { Display, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { specLine } from '@/lib/car-specs';
import type { Car } from '@/store/garage';

/** A garage bay: name and year up top, the car parked on the shop floor with its bay number painted behind it. */
export function CarCard({ car, bay, primary, onMenu }: { car: Car; bay?: number; primary?: boolean; onMenu?: () => void }) {
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
            <ThemedText type="label" style={{ color: theme.accent, marginTop: 2 }} numberOfLines={1}>
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
        {/* The floor: painted bay lines and number, and the car parked over them. */}
        <View style={[styles.floor, { backgroundColor: theme.backgroundSelected }]} />
        {bay != null ? (
          <Text style={[styles.bayNumber, { color: theme.textSecondary }]} accessibilityElementsHidden importantForAccessibility="no">
            {String(bay).padStart(2, '0')}
          </Text>
        ) : null}
        <Image source={sideImage(car.body, car.paint)} style={styles.car} resizeMode="contain" accessibilityLabel={title} />
        {primary ? (
          <View style={[styles.badge, { backgroundColor: theme.accent }]}>
            <MaterialCommunityIcons name="key-variant" size={13} color="#fff" />
            <ThemedText type="label" style={styles.badgeText}>
              Daily · on the map
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
  title: { fontFamily: Display.italic, fontSize: 30, lineHeight: 34 },
  stage: { alignItems: 'center', justifyContent: 'flex-end', marginTop: -Spacing.two },
  floor: { position: 'absolute', bottom: 0, left: 0, right: 0, height: '38%', opacity: 0.55 },
  bayNumber: { position: 'absolute', right: Spacing.three, bottom: Spacing.one, fontFamily: Display.italic, fontSize: 64, lineHeight: 68, opacity: 0.22 },
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
  badgeText: { color: '#fff', fontSize: 13, lineHeight: 16 },
});
