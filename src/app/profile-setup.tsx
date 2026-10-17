import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Avatar, Button, TextField } from '@/components/ui';
import { AvatarColors, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { VehiclePicker } from '@/components/vehicle-picker';
import { goToMap } from '@/lib/go-to-map';
import type { Paint, Vehicle } from '@/lib/vehicles';
import { useAuth } from '@/store/auth';

export default function ProfileSetupScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { profile, saveProfile, signOut } = useAuth();
  const [isNew] = useState(!profile);
  const [username, setUsername] = useState(profile?.username ?? '');
  const [displayName, setDisplayName] = useState(profile?.display_name ?? '');
  const [color, setColor] = useState(profile?.avatar_color ?? AvatarColors[0]);
  const [vehicle, setVehicle] = useState<Vehicle>(profile?.vehicle ?? 'car');
  const [paint, setPaint] = useState<Paint>(profile?.vehicle_color ?? 'blue');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    const err = await saveProfile({ username, display_name: displayName, avatar_color: color, vehicle, vehicle_color: paint });
    setBusy(false);
    if (err) setError(err);
    // First-time setup ends on the map; editing an existing profile goes back to where you were.
    else if (isNew) goToMap(router);
    else router.back();
  }

  return (
    <ScrollView
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={{ padding: Spacing.four, gap: Spacing.three }}
      keyboardShouldPersistTaps="handled">
      <View style={{ alignItems: 'center', marginBottom: Spacing.two }}>
        <Avatar name={displayName || username || '?'} color={color} size={88} />
      </View>
      <TextField label="Display name" value={displayName} onChangeText={setDisplayName} maxLength={40} placeholder="Alex" />
      <TextField
        label="Username"
        value={username}
        onChangeText={(t) => setUsername(t.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
        autoCapitalize="none"
        autoCorrect={false}
        maxLength={20}
        placeholder="alex_drives"
        error={error}
      />
      <ThemedText type="small" themeColor="textSecondary">
        Friends find you by username. 3–20 characters: letters, numbers, underscores.
      </ThemedText>
      <ThemedText type="smallBold" themeColor="textSecondary">
        Map color
      </ThemedText>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two }}>
        {AvatarColors.map((c) => (
          <Pressable
            key={c}
            onPress={() => setColor(c)}
            accessibilityRole="button"
            accessibilityLabel={`Color ${c}`}
            accessibilityState={{ selected: c === color }}
            style={{
              width: 40,
              height: 40,
              borderRadius: 20,
              backgroundColor: c,
              borderWidth: 3,
              borderColor: c === color ? theme.text : 'transparent',
            }}
          />
        ))}
      </View>
      <ThemedText type="smallBold" themeColor="textSecondary">
        Your car on the map
      </ThemedText>
      <VehiclePicker
        vehicle={vehicle}
        paint={paint}
        onChange={(v) => {
          setVehicle(v.vehicle);
          setPaint(v.paint);
        }}
      />
      <Button
        label="Save"
        size="lg"
        loading={busy}
        disabled={username.length < 3 || displayName.trim().length === 0}
        onPress={save}
        style={{ marginTop: Spacing.three }}
      />
      {!profile ? (
        <Button
          label="Sign out instead"
          variant="ghost"
          onPress={async () => {
            await signOut();
            goToMap(router);
          }}
        />
      ) : null}
    </ScrollView>
  );
}
