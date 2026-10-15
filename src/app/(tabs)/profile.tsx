import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Linking, StyleSheet, Switch, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Avatar, Button, Card, Screen, SectionTitle, Segmented } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/store/auth';
import { useSettings } from '@/store/settings';
import { useTrips } from '@/store/trips';

type PermissionSummary = { foreground: boolean; background: boolean };

export default function ProfileScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { session, profile, signOut } = useAuth();
  const { units, setUnits, keepScreenOn, setKeepScreenOn } = useSettings();
  const unsynced = useTrips((s) => s.history.filter((t) => !t.synced).length);
  const [perm, setPerm] = useState<PermissionSummary | null>(null);

  useFocusEffect(
    useCallback(() => {
      void Promise.all([Location.getForegroundPermissionsAsync(), Location.getBackgroundPermissionsAsync()])
        .then(([fg, bg]) => setPerm({ foreground: fg.granted, background: bg.granted }))
        .catch(() => setPerm(null));
    }, [])
  );

  return (
    <Screen>
      {profile ? (
        <Card style={styles.account}>
          <Avatar name={profile.display_name} color={profile.avatar_color} size={60} />
          <View style={{ flex: 1 }}>
            <ThemedText style={{ fontSize: 20, fontWeight: 800 }}>{profile.display_name}</ThemedText>
            <ThemedText themeColor="textSecondary">@{profile.username}</ThemedText>
          </View>
          <Button label="Edit" variant="secondary" onPress={() => router.push('/profile-setup')} />
        </Card>
      ) : (
        <Card style={{ gap: Spacing.three }}>
          <ThemedText style={{ fontSize: 20, fontWeight: 800 }}>Not signed in</ThemedText>
          <ThemedText themeColor="textSecondary">
            The speedometer and trip recording work offline. Sign in to back up trips, add friends and join group drives.
          </ThemedText>
          <Button label="Sign in or create account" onPress={() => router.push('/sign-in')} />
        </Card>
      )}

      <SectionTitle>Units</SectionTitle>
      <Segmented
        options={[
          { value: 'imperial', label: 'mph · miles' },
          { value: 'metric', label: 'km/h · km' },
        ]}
        value={units}
        onChange={setUnits}
      />

      <SectionTitle>Driving</SectionTitle>
      <Card>
        <View style={styles.setting}>
          <View style={{ flex: 1 }}>
            <ThemedText style={{ fontWeight: 700 }}>Keep screen on while recording</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Uses more battery. Mount your phone; don&apos;t handle it while driving.
            </ThemedText>
          </View>
          <Switch value={keepScreenOn} onValueChange={setKeepScreenOn} />
        </View>
      </Card>

      <SectionTitle>Location access</SectionTitle>
      <Card style={{ gap: Spacing.three }}>
        <PermissionRow label="While using the app" granted={perm?.foreground} />
        <PermissionRow label="In the background (trips & group drives)" granted={perm?.background} />
        {perm && !perm.background ? (
          <Button label="Open system settings" variant="secondary" onPress={() => void Linking.openSettings()} />
        ) : null}
        <ThemedText type="small" themeColor="textSecondary">
          Convoy only uses background location while a trip is recording or you are sharing with a group drive, and a
          notification is always shown when it does.
        </ThemedText>
      </Card>

      <SectionTitle>Privacy</SectionTitle>
      <Card style={{ gap: Spacing.two }}>
        <ThemedText type="small" themeColor="textSecondary">
          • Group drive positions are sent live to drive members only and are not stored on our servers.{'\n'}• Friends
          see a single last-known position, only while you choose to share, and it is deleted when you stop.{'\n'}• Trips
          are stored on your phone and, when signed in, in your private account.
        </ThemedText>
        {unsynced > 0 && session ? (
          <ThemedText type="small" style={{ color: theme.warning }}>
            {unsynced} trip{unsynced === 1 ? '' : 's'} waiting to back up.
          </ThemedText>
        ) : null}
      </Card>

      {session ? <Button label="Sign out" variant="ghost" onPress={() => void signOut()} /> : null}

      <ThemedText type="small" themeColor="textSecondary" style={{ textAlign: 'center' }}>
        Map data © OpenStreetMap contributors · Tiles by OpenFreeMap
      </ThemedText>
    </Screen>
  );
}

function PermissionRow({ label, granted }: { label: string; granted: boolean | undefined }) {
  const theme = useTheme();
  return (
    <View style={styles.setting}>
      <MaterialCommunityIcons
        name={granted ? 'check-circle' : 'close-circle-outline'}
        size={22}
        color={granted ? theme.success : theme.textSecondary}
      />
      <ThemedText style={{ flex: 1 }}>{label}</ThemedText>
      <ThemedText type="smallBold" themeColor="textSecondary">
        {granted == null ? '…' : granted ? 'Allowed' : 'Off'}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  account: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  setting: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
});
