import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, View } from 'react-native';

import { vehicleImage, vehicleSprite } from '@/components/map/vehicle-sprites';
import { ThemedText } from '@/components/themed-text';
import { Avatar, Button } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/store/auth';
import { useFriends } from '@/store/friends';

type Card = { id: string; username: string; display_name: string; avatar_color: string; vehicle: string; vehicle_color: string };

/** Landing page for a friend invite link: /add/<username>. One tap sends the request. */
export default function AddFriendScreen() {
  const { username } = useLocalSearchParams<{ username: string }>();
  const theme = useTheme();
  const router = useRouter();
  const session = useAuth((s) => s.session);
  const myUsername = useAuth((s) => s.profile?.username);
  const request = useFriends((s) => s.request);
  const [person, setPerson] = useState<Card | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  useEffect(() => {
    if (!session || !username) return;
    void supabase
      .from('profiles')
      .select('id, username, display_name, avatar_color, vehicle, vehicle_color')
      .eq('username', String(username).toLowerCase())
      .maybeSingle()
      .then(({ data }) => setPerson((data as Card | null) ?? null));
  }, [session, username]);

  async function add() {
    setBusy(true);
    const err = await request(String(username));
    setBusy(false);
    setResult(err ?? 'Request sent. You’ll be friends once they accept.');
  }

  const center = { flex: 1, alignItems: 'center' as const, justifyContent: 'center' as const, padding: Spacing.four, gap: Spacing.three, backgroundColor: theme.background };

  if (!session) {
    return (
      <View style={center}>
        <Stack.Screen options={{ title: 'Add friend' }} />
        <ThemedText type="subtitle">@{username} invited you to Convoy</ThemedText>
        <ThemedText themeColor="textSecondary" style={{ textAlign: 'center' }}>
          Sign in or create an account, then open this link again to add them.
        </ThemedText>
        <Button label="Sign in or create account" size="lg" onPress={() => router.push('/sign-in')} />
      </View>
    );
  }

  if (person === undefined) {
    return (
      <View style={center}>
        <ActivityIndicator />
      </View>
    );
  }

  if (!person) {
    return (
      <View style={center}>
        <Stack.Screen options={{ title: 'Add friend' }} />
        <ThemedText type="subtitle">No one with that username</ThemedText>
        <Button label="Back to Convoy" onPress={() => router.replace('/friends')} />
      </View>
    );
  }

  const isMe = person.username === myUsername;
  return (
    <View style={center}>
      <Stack.Screen options={{ title: 'Add friend' }} />
      <Avatar name={person.display_name} color={person.avatar_color} size={84} />
      <View style={{ alignItems: 'center' }}>
        <ThemedText type="subtitle">{person.display_name}</ThemedText>
        <ThemedText themeColor="textSecondary">@{person.username}</ThemedText>
      </View>
      <Image source={vehicleImage(vehicleSprite(person.vehicle, person.vehicle_color))} style={{ width: 160, height: 160, marginVertical: -30 }} resizeMode="contain" />
      {result ? (
        <>
          <ThemedText style={{ textAlign: 'center' }}>{result}</ThemedText>
          <Button label="Go to friends" onPress={() => router.replace('/friends')} />
        </>
      ) : isMe ? (
        <ThemedText themeColor="textSecondary">This is your invite link. Share it with friends.</ThemedText>
      ) : (
        <Button label="Add friend" size="lg" loading={busy} onPress={add} style={{ alignSelf: 'stretch' }} />
      )}
    </View>
  );
}
