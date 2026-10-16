import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui';
import { VehiclePicker } from '@/components/vehicle-picker';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { Paint, Vehicle } from '@/lib/vehicles';
import { useAuth } from '@/store/auth';

/** Your 3D garage: the car friends see moving along your route. */
export default function GarageScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { profile, saveProfile } = useAuth();
  const [vehicle, setVehicle] = useState<Vehicle>(profile?.vehicle ?? 'car');
  const [paint, setPaint] = useState<Paint>(profile?.vehicle_color ?? 'blue');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!profile) {
      router.push('/sign-in');
      return;
    }
    setBusy(true);
    const err = await saveProfile({
      username: profile!.username,
      display_name: profile!.display_name,
      avatar_color: profile!.avatar_color,
      vehicle,
      vehicle_color: paint,
    });
    setBusy(false);
    if (err) setError(err);
    else router.back();
  }

  // Signed-out visitors can browse the garage; saving asks them to sign in.
  const changed = !profile || vehicle !== profile.vehicle || paint !== profile.vehicle_color;
  return (
    <ScrollView style={{ backgroundColor: theme.background }} contentContainerStyle={{ padding: Spacing.four, gap: Spacing.four }}>
      <VehiclePicker
        vehicle={vehicle}
        paint={paint}
        onChange={(v) => {
          setVehicle(v.vehicle);
          setPaint(v.paint);
          setError(null);
        }}
      />
      {error ? <ThemedText style={{ color: theme.danger }}>{error}</ThemedText> : null}
      <Button label={profile ? 'Save' : 'Sign in to save'} size="lg" loading={busy} disabled={!changed} onPress={save} />
    </ScrollView>
  );
}
