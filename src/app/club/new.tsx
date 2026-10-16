import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, TextField } from '@/components/ui';
import { AvatarColors, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useClubs } from '@/store/clubs';

export default function NewClubScreen() {
  const theme = useTheme();
  const router = useRouter();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState(AvatarColors[0]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setBusy(true);
    const res = await useClubs.getState().create(name.trim(), color, description.trim() || null);
    setBusy(false);
    if (res.error) setError(res.error);
    else router.replace({ pathname: '/club/[id]', params: { id: res.club!.id } });
  }

  return (
    <ScrollView style={{ backgroundColor: theme.background }} contentContainerStyle={{ padding: Spacing.three, gap: Spacing.three }} keyboardShouldPersistTaps="handled">
      <View style={{ height: 96, borderRadius: 20, backgroundColor: color, justifyContent: 'flex-end', padding: Spacing.three }}>
        <ThemedText style={{ color: '#fff', fontSize: 24, fontWeight: 800 }} numberOfLines={1}>
          {name || 'Your club'}
        </ThemedText>
      </View>
      <TextField label="Club name" value={name} onChangeText={setName} maxLength={50} placeholder="Central Coast Cruisers" />
      <TextField label="About (optional)" value={description} onChangeText={setDescription} maxLength={500} multiline style={{ minHeight: 80, paddingTop: 12 }} />
      <ThemedText type="smallBold" themeColor="textSecondary">
        Club color
      </ThemedText>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two }}>
        {AvatarColors.map((c) => (
          <Pressable
            key={c}
            onPress={() => setColor(c)}
            accessibilityRole="button"
            accessibilityState={{ selected: c === color }}
            style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: c, borderWidth: 3, borderColor: c === color ? theme.text : 'transparent' }}
          />
        ))}
      </View>
      {error ? <ThemedText style={{ color: theme.danger }}>{error}</ThemedText> : null}
      <Button label="Create club" size="lg" loading={busy} disabled={name.trim().length < 2} onPress={create} />
    </ScrollView>
  );
}
