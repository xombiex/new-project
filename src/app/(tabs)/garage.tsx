import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback } from 'react';
import { Alert, Image, Pressable, StyleSheet, View } from 'react-native';

import { CarCard } from '@/components/car-card';
import { sideImage } from '@/components/map/vehicle-sprites';
import { ThemedText } from '@/components/themed-text';
import { Avatar, Button, Card, Screen } from '@/components/ui';
import { BottomTabInset, Radius, Spacing } from '@/constants/theme';
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
      <View style={styles.header}>
        <ThemedText style={styles.title}>Garage</ThemedText>
        <Pressable onPress={() => router.push('/profile')} accessibilityRole="button" accessibilityLabel="Profile">
          {profile ? (
            <Avatar name={profile.display_name} color={profile.avatar_color} size={44} />
          ) : (
            <View style={[styles.avatarFallback, { backgroundColor: theme.backgroundSelected }]}>
              <MaterialCommunityIcons name="account" size={26} color={theme.textSecondary} />
            </View>
          )}
        </Pressable>
      </View>

      {!profile ? (
        <Card style={{ gap: Spacing.three, alignItems: 'center' }}>
          <Image source={sideImage('sport', 'red')} style={styles.teaser} resizeMode="contain" />
          <ThemedText type="subtitle" style={{ textAlign: 'center' }}>
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
              Your garage is empty. Add your first car and it becomes the one friends see you driving.
            </ThemedText>
          ) : null}

          {cars.map((car) => (
            <Pressable key={car.id} onPress={() => openMenu(car)} onLongPress={() => openMenu(car)}>
              <CarCard car={car} primary={profile.primary_car_id === car.id} onMenu={() => openMenu(car)} />
            </Pressable>
          ))}

          <Pressable
            onPress={() => (full ? router.push('/paywall') : router.push({ pathname: '/car/[id]', params: { id: 'new' } }))}
            accessibilityRole="button"
            style={[styles.add, { borderColor: theme.border }]}>
            <MaterialCommunityIcons name={full ? 'lock-outline' : 'plus'} size={22} color={theme.accent} />
            <ThemedText style={{ color: theme.accent, fontWeight: 700 }}>
              {full ? 'Unlimited cars with Convoy Pro' : 'Add a car'}
            </ThemedText>
          </Pressable>
          {!pro ? (
            <ThemedText type="small" themeColor="textSecondary" style={{ textAlign: 'center' }}>
              {cars.length}/{FREE_CARS} cars on the free plan
            </ThemedText>
          ) : null}
        </>
      )}
      <View style={{ height: BottomTabInset }} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 34, lineHeight: 40, fontWeight: 800, letterSpacing: -0.5 },
  avatarFallback: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  teaser: { width: '100%', aspectRatio: 2 },
  add: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.four,
    borderRadius: Radius.lg,
    borderWidth: 1.5,
    borderStyle: 'dashed',
  },
});
