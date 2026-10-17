import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollViewInstance,
} from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeInUp } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { sideImage } from '@/components/map/vehicle-sprites';
import { ThemedText } from '@/components/themed-text';
import { Avatar, Button } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { requestForegroundPermission } from '@/lib/location';
import { speedBands } from '@/lib/speed-bands';
import { useSettings } from '@/store/settings';

type Page = { key: string; title: string; accent: string; body: string; art: () => React.ReactNode };

/** First launch: what Convoy does, then why it needs location, before the system asks. */
export default function Welcome() {
  const theme = useTheme();
  const router = useRouter();
  // Phone-width pages, centered on big screens (desktop web).
  const width = Math.min(useWindowDimensions().width, 520);
  const setOnboarded = useSettings((s) => s.setOnboarded);
  const scroller = useRef<ScrollViewInstance>(null);
  const [page, setPage] = useState(0);
  const [asking, setAsking] = useState(false);

  const pages: Page[] = [
    {
      key: 'track',
      title: 'Every drive,',
      accent: 'tracked',
      body: 'Speed, distance and a route colored by how fast you went. Convoy can even notice when you start driving.',
      art: () => <TrackArt />,
    },
    {
      key: 'together',
      title: 'Drive',
      accent: 'together',
      body: 'Start a convoy and everyone shows up live on one map, with their car and speed, so nobody gets left behind.',
      art: () => <TogetherArt />,
    },
    {
      key: 'garage',
      title: 'Your',
      accent: 'garage',
      body: 'Add your cars, pick a paint, and choose the one your friends see you driving.',
      art: () => <GarageArt />,
    },
    {
      key: 'location',
      title: 'Turn on',
      accent: 'location',
      body: 'Convoy uses your location to show you on the map, measure your speed and record drives. Groups only see you while you share with them.',
      art: () => (
        <View style={[styles.locationArt, { backgroundColor: theme.accent }]}>
          <MaterialCommunityIcons name="crosshairs-gps" size={64} color="#fff" />
        </View>
      ),
    },
  ];
  const last = page === pages.length - 1;

  function finish() {
    setOnboarded(true);
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }

  function go(i: number) {
    scroller.current?.scrollTo({ x: i * width, animated: true });
    setPage(i);
  }

  async function allowLocation() {
    setAsking(true);
    await requestForegroundPermission().catch(() => false);
    setAsking(false);
    finish();
  }

  function onScroll(e: NativeSyntheticEvent<NativeScrollEvent>) {
    const i = Math.round(e.nativeEvent.contentOffset.x / width);
    if (i !== page) setPage(i);
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background, alignItems: 'center' }}>
      <View style={{ flex: 1, width }}>
      <View style={styles.top}>
        {!last ? (
          <Pressable onPress={() => go(pages.length - 1)} hitSlop={12} accessibilityRole="button">
            <ThemedText themeColor="textSecondary" style={{ fontWeight: 600 }}>
              Skip
            </ThemedText>
          </Pressable>
        ) : null}
      </View>

      <ScrollView
        ref={scroller}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onScroll}
        onScroll={onScroll}
        scrollEventThrottle={64}>
        {pages.map((p, i) => (
          <View key={p.key} style={[styles.page, { width }]}>
            {i === page ? (
              <>
                <Animated.View entering={FadeIn.duration(400)} style={styles.art}>
                  {p.art()}
                </Animated.View>
                <Animated.View entering={FadeInDown.delay(120).duration(400)} style={{ gap: Spacing.two }}>
                  <ThemedText style={styles.title}>
                    {p.title} <ThemedText style={[styles.title, { color: theme.speed }]}>{p.accent}</ThemedText>
                  </ThemedText>
                  <ThemedText themeColor="textSecondary" style={styles.body}>
                    {p.body}
                  </ThemedText>
                </Animated.View>
              </>
            ) : null}
          </View>
        ))}
      </ScrollView>

      <View style={styles.bottom}>
        <View style={styles.dots}>
          {pages.map((p, i) => (
            <View key={p.key} style={[styles.dot, { backgroundColor: i === page ? theme.accent : theme.backgroundSelected, width: i === page ? 22 : 8 }]} />
          ))}
        </View>
        {last ? (
          <Animated.View entering={FadeInUp.duration(300)} style={{ gap: Spacing.two }}>
            <Button label="Allow location" size="lg" loading={asking} onPress={allowLocation} />
            <Button label="Not now" variant="ghost" onPress={finish} />
          </Animated.View>
        ) : (
          <Button label="Next" size="lg" onPress={() => go(page + 1)} />
        )}
        </View>
      </View>
    </SafeAreaView>
  );
}

/** A route drawn in the speed colors, with a car on it. */
function TrackArt() {
  const bands = speedBands('imperial');
  return (
    <View style={{ alignItems: 'center', gap: Spacing.three }}>
      <Image source={sideImage('sport', 'red')} style={{ width: 260, height: 130 }} resizeMode="contain" />
      <View style={{ flexDirection: 'row', gap: 4 }}>
        {bands.map((b, i) => (
          <View key={b.label} style={{ width: 44, height: 10, borderRadius: 5, backgroundColor: b.color, opacity: 1 - i * 0.08 }} />
        ))}
      </View>
    </View>
  );
}

/** A few friends with live speed bubbles. */
function TogetherArt() {
  const people = [
    { name: 'Abby', color: '#8E5CFF', speed: '36 MPH', x: -80, y: 10 },
    { name: 'Marco', color: '#2DBE60', speed: '41 MPH', x: 70, y: -20 },
    { name: 'Jess', color: '#FF8A00', speed: '28 MPH', x: 0, y: 60 },
  ];
  return (
    <View style={{ width: 260, height: 200, alignItems: 'center', justifyContent: 'center' }}>
      {people.map((p) => (
        <View key={p.name} style={{ position: 'absolute', transform: [{ translateX: p.x }, { translateY: p.y }], alignItems: 'center', gap: 4 }}>
          <View style={{ backgroundColor: p.color, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2, borderWidth: 1.5, borderColor: '#fff' }}>
            <ThemedText type="small" style={{ color: '#fff', fontWeight: 800 }}>
              {p.speed}
            </ThemedText>
          </View>
          <View style={{ borderRadius: 24, borderWidth: 3, borderColor: p.color }}>
            <Avatar name={p.name} color={p.color} size={44} />
          </View>
        </View>
      ))}
    </View>
  );
}

/** Three cars, showroom style. */
function GarageArt() {
  return (
    <View style={{ alignItems: 'center', marginTop: -Spacing.three }}>
      <Image source={sideImage('suv', 'white')} style={{ width: 200, height: 100, marginBottom: -30 }} resizeMode="contain" />
      <Image source={sideImage('pickup', 'orange')} style={{ width: 240, height: 120, marginBottom: -36 }} resizeMode="contain" />
      <Image source={sideImage('classic', 'blue')} style={{ width: 280, height: 140 }} resizeMode="contain" />
    </View>
  );
}

const styles = StyleSheet.create({
  top: { height: 44, alignItems: 'flex-end', justifyContent: 'center', paddingHorizontal: Spacing.four },
  page: { flex: 1, paddingHorizontal: Spacing.four, justifyContent: 'center', gap: Spacing.five },
  art: { alignItems: 'center', justifyContent: 'center', minHeight: 240 },
  title: { fontSize: 36, lineHeight: 42, fontWeight: 900, letterSpacing: -0.6 },
  body: { fontSize: 17, lineHeight: 25 },
  locationArt: { width: 132, height: 132, borderRadius: 66, alignItems: 'center', justifyContent: 'center' },
  bottom: { padding: Spacing.four, gap: Spacing.three },
  dots: { flexDirection: 'row', gap: 6, justifyContent: 'center' },
  dot: { height: 8, borderRadius: 4 },
});
