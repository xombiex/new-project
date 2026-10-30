import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Image, Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { sideImage } from '@/components/map/vehicle-sprites';
import { ThemedText } from '@/components/themed-text';
import { Display, Radius, Spacing } from '@/constants/theme';
import { useCarFacts } from '@/hooks/use-car-facts';
import { useCarPhoto } from '@/hooks/use-car-photo';
import { useTheme } from '@/hooks/use-theme';
import { engineFromLabel } from '@/lib/car-power';
import { specLine } from '@/lib/car-specs';
import { SITE_URL } from '@/lib/site';
import type { Car } from '@/store/garage';

/** Wikimedia asks apps to say who they are; browsers send their own and can't change it. */
const photoHeaders = Platform.OS === 'web' ? undefined : { 'User-Agent': `Convoy/1.0 (${SITE_URL})` };

/**
 * A garage bay: name and year up top, then a real photo of that make and model with the low-poly
 * car you drive on the map parked in the corner. No photo found: the low-poly car takes the floor.
 */
export function CarCard({ car, bay, primary, onMenu }: { car: Car; bay?: number; primary?: boolean; onMenu?: () => void }) {
  const theme = useTheme();
  const title = `${car.make} ${car.model}`;
  const subtitle = [car.year, car.nickname ? `“${car.nickname}”` : null].filter(Boolean).join(' · ');
  const photo = useCarPhoto(car.make, car.model, car.year ?? null);
  const facts = useCarFacts(car.make, car.model, car.year ?? null, engineFromLabel(car.specs?.engine), !car.specs?.hp);
  const line = specLine({ ...facts, ...car.specs });
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
          {line ? (
            <ThemedText type="label" style={{ color: theme.accent, marginTop: 2 }} numberOfLines={1}>
              {line}
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
        <Image source={sideImage(car.body, car.paint)} style={styles.car} resizeMode="contain" accessibilityLabel={photo ? undefined : title} />
        {photo ? (
          <>
            <Image source={{ uri: photo.url, headers: photoHeaders }} style={StyleSheet.absoluteFill} resizeMode="cover" accessibilityLabel={`Photo of a ${title}`} />
            <Image source={sideImage(car.body, car.paint)} style={styles.mapCar} resizeMode="contain" accessibilityLabel={`Your ${title} on the map`} />
          </>
        ) : null}
        {bay != null ? (
          <Text style={[styles.bayNumber, { color: theme.textSecondary }, photo && styles.bayOnPhoto]} accessibilityElementsHidden importantForAccessibility="no">
            {String(bay).padStart(2, '0')}
          </Text>
        ) : null}
        {primary ? (
          <View style={[styles.badge, { backgroundColor: theme.accent }]}>
            <MaterialCommunityIcons name="key-variant" size={13} color="#fff" />
            <ThemedText type="label" style={styles.badgeText}>
              Daily · on the map
            </ThemedText>
          </View>
        ) : null}
      </View>
      {/* The photo's license asks for this credit. */}
      {photo ? (
        <Pressable onPress={() => void Linking.openURL(photo.pageUrl)} accessibilityRole="link" hitSlop={6} style={styles.credit}>
          <ThemedText style={styles.creditText} themeColor="textSecondary" numberOfLines={1}>
            Example photo · {photo.author} · {photo.license}
          </ThemedText>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: Radius.lg, borderWidth: 1, paddingTop: Spacing.three, overflow: 'hidden' },
  credit: { paddingHorizontal: Spacing.three, paddingVertical: Spacing.two },
  creditText: { fontSize: 11, lineHeight: 14 },
  // Bottom-right on the photo, the car that shows up on the map.
  mapCar: { position: 'absolute', right: -Spacing.one, bottom: -Spacing.one, width: 132, height: 66 },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.two, paddingHorizontal: Spacing.three },
  title: { fontFamily: Display.italic, fontSize: 30, lineHeight: 34 },
  stage: { alignItems: 'center', justifyContent: 'flex-end', marginTop: Spacing.two, overflow: 'hidden' },
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
  // Painted on the photo instead of the floor: top left, readable over anything.
  bayOnPhoto: { right: undefined, bottom: undefined, left: Spacing.three, top: Spacing.one, color: '#FFFFFF', opacity: 0.9, textShadowColor: 'rgba(0,0,0,0.55)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 6 },
});
