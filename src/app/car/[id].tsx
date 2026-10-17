import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, TextField } from '@/components/ui';
import { VehiclePicker } from '@/components/vehicle-picker';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { Paint, Vehicle } from '@/lib/vehicles';
import { useGarage } from '@/store/garage';

/** Add a car to the garage (id = "new") or edit one. */
export default function CarEditor() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const router = useRouter();
  const existing = useGarage((s) => s.cars.find((c) => c.id === id));
  const save = useGarage((s) => s.save);
  const [make, setMake] = useState(existing?.make ?? '');
  const [model, setModel] = useState(existing?.model ?? '');
  const [year, setYear] = useState(existing?.year ? String(existing.year) : '');
  const [nickname, setNickname] = useState(existing?.nickname ?? '');
  const [body, setBody] = useState<Vehicle>(existing?.body ?? 'car');
  const [paint, setPaint] = useState<Paint>(existing?.paint ?? 'blue');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const yearNum = year ? Number(year) : null;
  const yearOk = yearNum === null || (yearNum >= 1886 && yearNum <= new Date().getFullYear() + 2);
  const valid = make.trim().length > 0 && model.trim().length > 0 && yearOk;

  async function onSave() {
    setBusy(true);
    const err = await save({ make, model, year: yearNum, nickname, body, paint }, existing?.id);
    setBusy(false);
    if (err) setError(err);
    else router.back();
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: theme.background }}>
      <Stack.Screen options={{ title: existing ? 'Edit car' : 'Add a car' }} />
      <ScrollView contentContainerStyle={{ padding: Spacing.four, gap: Spacing.three }} keyboardShouldPersistTaps="handled">
        <View style={{ flexDirection: 'row', gap: Spacing.two }}>
          <View style={{ flex: 1 }}>
            <TextField label="Make" value={make} onChangeText={setMake} placeholder="Porsche" maxLength={40} autoCapitalize="words" />
          </View>
          <View style={{ flex: 1 }}>
            <TextField label="Model" value={model} onChangeText={setModel} placeholder="911 GT3 RS" maxLength={40} autoCapitalize="words" />
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: Spacing.two }}>
          <View style={{ width: 110 }}>
            <TextField
              label="Year"
              value={year}
              onChangeText={(t) => setYear(t.replace(/\D/g, '').slice(0, 4))}
              placeholder="2024"
              keyboardType="number-pad"
              error={yearOk ? null : 'Check the year'}
            />
          </View>
          <View style={{ flex: 1 }}>
            <TextField label="Nickname (optional)" value={nickname} onChangeText={setNickname} placeholder="Weekend car" maxLength={40} />
          </View>
        </View>

        <ThemedText type="smallBold" themeColor="textSecondary">
          Body and paint
        </ThemedText>
        <VehiclePicker
          vehicle={body}
          paint={paint}
          onChange={(v) => {
            setBody(v.vehicle);
            setPaint(v.paint);
            setError(null);
          }}
        />
        {error ? <ThemedText style={{ color: theme.danger }}>{error}</ThemedText> : null}
        <Button label={existing ? 'Save' : 'Add to garage'} size="lg" loading={busy} disabled={!valid} onPress={onSave} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
