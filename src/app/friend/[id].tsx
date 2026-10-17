import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { CarCard } from '@/components/car-card';
import { OnlineDot } from '@/components/online-status';
import { ThemedText } from '@/components/themed-text';
import { Avatar, Screen, SectionTitle } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { presenceLabel } from '@/lib/presence';
import { useFriends } from '@/store/friends';
import { useGarage, type Car } from '@/store/garage';

/** A friend's page: who they are, whether they're around, and the cars in their garage. */
export default function FriendScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const friend = useFriends((s) => s.friendships.find((f) => f.other.id === id))?.other;
  const lastSeen = useFriends((s) => s.presence[String(id)]);
  const forUser = useGarage((s) => s.forUser);
  const [cars, setCars] = useState<Car[] | null>(null);

  useEffect(() => {
    if (id) void forUser(String(id)).then(setCars);
  }, [id, forUser]);

  if (!friend) return null;
  const status = presenceLabel(lastSeen);

  return (
    <Screen safeTop={false}>
      <Stack.Screen options={{ title: friend.display_name }} />
      <View style={{ alignItems: 'center', gap: Spacing.two, marginBottom: Spacing.two }}>
        <View>
          <Avatar name={friend.display_name} color={friend.avatar_color} size={88} />
          <OnlineDot lastSeen={lastSeen} size={20} />
        </View>
        <ThemedText type="subtitle">{friend.display_name}</ThemedText>
        <ThemedText themeColor="textSecondary">
          @{friend.username} · {status.text}
        </ThemedText>
      </View>

      <SectionTitle>{`Garage${cars ? ` · ${cars.length}` : ''}`}</SectionTitle>
      {cars && cars.length === 0 ? (
        <ThemedText themeColor="textSecondary">{friend.display_name} hasn’t added any cars yet.</ThemedText>
      ) : null}
      {(cars ?? []).map((car) => (
        <CarCard key={car.id} car={car} primary={friend.primary_car_id === car.id} />
      ))}
    </Screen>
  );
}
