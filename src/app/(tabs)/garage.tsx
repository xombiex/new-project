import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback } from 'react';
import { Alert, Image, Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { CarCard } from '@/components/car-card';
import { ScreenTitle } from '@/components/shop';
import { sideImage } from '@/components/map/vehicle-sprites';
import { ThemedText } from '@/components/themed-text';
import { UnreadBadge } from '@/components/unread-badge';
import { Avatar, Button, Card, Screen, Skeleton } from '@/components/ui';
import { BottomTabInset, Display, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/store/auth';
import { useGarage, type Car } from '@/store/garage';
import { useEntitled } from '@/store/pro';

const FREE_CARS = 3;

/** All your cars in one place. The one marked "On the map" is what friends see you driving. */
export default function GarageTab() {
  const theme = useTheme();
  const router = useRouter();
  const profile = useAuth((s) => s.profile);
  const { cars, loaded, load, remove, setPrimary } = useGarage();
  const pro = useEntitled('pro');

  useFocusEffect(
    useCallback(() => {
      if (profile) void load();
    }, [profile, load])
  );

  function openMenu(car: Car) {
    const isPrimary = profile?.primary_car_id === car.id;
    Alert.alert(`${car.make} ${car.model}`, undefined, [
      ...(isPrimary
        ? []
        : [
            {
              text: 'Show on the map',
              onPress: async () => {
                const err = await setPrimary(car);
                if (err) Alert.alert('Could not switch cars', err);
              },
            },
          ]),
      { text: 'Edit', onPress: () => router.push({ pathname: '/car/[id]', params: { id: car.id } }) },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () =>
          Alert.alert('Delete this car?', `${car.make} ${car.model} will be removed from your garage.`, [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Delete', style: 'destructive', onPress: () => void remove(car.id) },
          ]),
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  const full = !pro && cars.length >= FREE_CARS;

  return (
    <Screen>
      <ScreenTitle
        kicker={profile && cars.length ? `${cars.length} ${cars.length === 1 ? 'car' : 'cars'} in the shop` : 'Your shop'}
        title="Garage"
        right={
          <Pressable onPress={() => router.push('/profile')} accessibilityRole="button" accessibilityLabel="Profile">
            {profile ? (
              <Avatar name={profile.display_name} color={profile.avatar_color} size={44} />
            ) : (
              <View style={[styles.avatarFallback, { backgroundColor: theme.backgroundSelected }]}>
                <MaterialCommunityIcons name="account" size={26} color={theme.textSecondary} />
              </View>
            )}
            <UnreadBadge />
          </Pressable>
        }
      />

      {!profile ? (
        <Card style={{ gap: Spacing.three, alignItems: 'center' }}>
          <Image source={sideImage('sport', 'red')} style={styles.teaser} resizeMode="contain" />
          <ThemedText style={{ fontFamily: Display.italic, fontSize: 34, lineHeight: 38, textAlign: 'center' }}>
            All your cars in one garage
          </ThemedText>
          <ThemedText themeColor="textSecondary" style={{ textAlign: 'center' }}>
            Add the cars you drive (or dream about), pick a paint, and choose which one your friends see on the map.
          </ThemedText>
          <Button label="Sign in to start your garage" onPress={() => router.push('/sign-in')} style={{ alignSelf: 'stretch' }} />
        </Card>
      ) : (
        <>
          {loaded && cars.length === 0 ? (
            <ThemedText themeColor="textSecondary">
              Empty shop. Every good garage starts with one car, and your first one is what friends see you driving.
            </ThemedText>
          ) : null}

          {!loaded ? [0, 1].map((i) => <Skeleton key={i} height={230} radius={Radius.lg} />) : null}

          {cars.map((car, i) => (
            <Animated.View key={car.id} entering={FadeInDown.delay(i * 70).duration(300)}>
              <Pressable onPress={() => openMenu(car)} onLongPress={() => openMenu(car)} style={({ pressed }) => ({ transform: [{ scale: pressed ? 0.98 : 1 }] })}>
                <CarCard car={car} bay={i + 1} primary={profile.primary_car_id === car.id} onMenu={() => openMenu(car)} />
              </Pressable>
            </Animated.View>
          ))}

          <Pressable
            onPress={() => (full ? router.push('/paywall') : router.push({ pathname: '/car/[id]', params: { id: 'new' } }))}
            accessibilityRole="button"
            style={[styles.add, { borderColor: theme.border }]}>
            <ThemedText type="label" themeColor="textSecondary">
              {full ? 'Shop’s full' : `Bay ${cars.length + 1} · open`}
            </ThemedText>
            <View style={styles.addRow}>
              <MaterialCommunityIcons name={full ? 'lock-outline' : 'plus'} size={22} color={theme.accent} />
              <ThemedText style={{ color: theme.accent, fontFamily: Display.bold, fontSize: 21, lineHeight: 24, letterSpacing: 0.6, textTransform: 'uppercase' }}>
                {full ? 'More bays with Convoy Pro' : 'Add a car'}
              </ThemedText>
            </View>
          </Pressable>
          {!pro ? (
            <ThemedText type="small" themeColor="textSecondary" style={{ textAlign: 'center' }}>
              {cars.length} of {FREE_CARS} bays filled on the free plan
            </ThemedText>
          ) : null}
        </>
      )}
      <View style={{ height: BottomTabInset }} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  avatarFallback: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  teaser: { width: '100%', aspectRatio: 2 },
  // Painted parking lines: an empty bay waiting for a car.
  add: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.one,
    paddingVertical: Spacing.five,
    borderRadius: Radius.lg,
    borderWidth: 2,
    borderStyle: 'dashed',
  },
  addRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
});
