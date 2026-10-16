import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { PlaceField, type PickedPlace } from '@/components/place-field';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, TextField } from '@/components/ui';
import { WhenPicker } from '@/components/when-picker';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { supabase } from '@/lib/supabase';
import { useClubs } from '@/store/clubs';

function defaultStart() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(10, 0, 0, 0);
  return d;
}

export default function NewEventScreen() {
  const { club } = useLocalSearchParams<{ club: string }>();
  const theme = useTheme();
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [when, setWhen] = useState(defaultStart);
  const [meet, setMeet] = useState<PickedPlace>(null);
  const [dest, setDest] = useState<PickedPlace>(null);
  const [price, setPrice] = useState('');
  const [capacity, setCapacity] = useState('');
  const [canCharge, setCanCharge] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void supabase
      .from('club_payouts')
      .select('charges_enabled')
      .eq('club_id', club)
      .maybeSingle()
      .then(({ data }) => setCanCharge(Boolean(data?.charges_enabled)));
  }, [club]);

  async function save() {
    const priceCents = Math.round(parseFloat(price || '0') * 100);
    if (Number.isNaN(priceCents) || priceCents < 0) {
      setError('Enter a valid price');
      return;
    }
    if (priceCents > 0 && priceCents < 100) {
      setError('Paid tickets must be at least $1');
      return;
    }
    setBusy(true);
    const res = await useClubs.getState().createEvent({
      club_id: club,
      title: title.trim(),
      description: description.trim() || null,
      starts_at: when.toISOString(),
      meet_name: meet?.name ?? null,
      meet_lat: meet?.lat ?? null,
      meet_lng: meet?.lng ?? null,
      dest_name: dest?.name ?? null,
      dest_lat: dest?.lat ?? null,
      dest_lng: dest?.lng ?? null,
      price_cents: priceCents,
      capacity: capacity ? Math.max(1, parseInt(capacity, 10)) : null,
    });
    setBusy(false);
    if (res.error) setError(res.error);
    else router.replace({ pathname: '/event/[id]', params: { id: res.id! } });
  }

  return (
    <ScrollView style={{ backgroundColor: theme.background }} contentContainerStyle={{ padding: Spacing.three, gap: Spacing.three, paddingBottom: Spacing.six }} keyboardShouldPersistTaps="handled">
      <TextField label="Title" value={title} onChangeText={setTitle} maxLength={80} placeholder="Sunday coastal cruise" />
      <View style={{ gap: Spacing.one }}>
        <ThemedText type="smallBold" themeColor="textSecondary">
          When · {when.toLocaleString([], { weekday: 'long', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
        </ThemedText>
        <WhenPicker value={when} onChange={setWhen} />
      </View>
      <PlaceField label="Meet-up spot" value={meet} onChange={setMeet} />
      <PlaceField label="Destination (optional)" value={dest} onChange={setDest} />
      <TextField label="Details (optional)" value={description} onChangeText={setDescription} multiline maxLength={2000} style={{ minHeight: 90, paddingTop: 12 }} />
      <Card style={{ gap: Spacing.three }}>
        <View style={{ flexDirection: 'row', gap: Spacing.three }}>
          <View style={{ flex: 1 }}>
            <TextField
              label="Ticket price ($)"
              value={price}
              onChangeText={(t) => setPrice(t.replace(/[^0-9.]/g, ''))}
              keyboardType="decimal-pad"
              placeholder="Free"
              editable={canCharge}
            />
          </View>
          <View style={{ flex: 1 }}>
            <TextField
              label="Capacity"
              value={capacity}
              onChangeText={(t) => setCapacity(t.replace(/[^0-9]/g, ''))}
              keyboardType="number-pad"
              placeholder="Unlimited"
            />
          </View>
        </View>
        {!canCharge ? (
          <ThemedText type="small" themeColor="textSecondary">
            To sell tickets, the club owner sets up payouts on the club page first.
          </ThemedText>
        ) : null}
      </Card>
      {error ? <ThemedText style={{ color: theme.danger }}>{error}</ThemedText> : null}
      <Button label="Create event" size="lg" loading={busy} disabled={title.trim().length < 2} onPress={save} />
    </ScrollView>
  );
}
