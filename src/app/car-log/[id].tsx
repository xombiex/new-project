import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Switch, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, Card, EmptyState, ErrorState, IconButton, LoadingRows, Notice, Screen, Segmented, TextField } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { distanceUnit, economyLabel, formatCents, fromKm, fromLitres, fuelEconomy, kindIcon, kindLabel, MAINTENANCE_KINDS, parseCents, parseNumber, spentSince, toKm, toLitres, volumeUnit, type MaintenanceKind } from '@/lib/garage-log';
import type { FuelRow, MaintenanceRow } from '@/services/database.types';
import { garageLog } from '@/services/garage-log';
import { useGarage } from '@/store/garage';
import { useSettings } from '@/store/settings';

type IconName = keyof typeof MaterialCommunityIcons.glyphMap;

const today = () => new Date().toISOString().slice(0, 10);
const validDay = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
const showDay = (s: string) => new Date(`${s}T12:00:00`).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });

/** One car's service and fuel log: what was done, what it cost, and how thirsty the car is. */
export default function CarLogScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const units = useSettings((s) => s.units);
  const car = useGarage((s) => s.cars.find((c) => c.id === id));
  const [tab, setTab] = useState<'service' | 'fuel'>('service');
  const [service, setService] = useState<MaintenanceRow[] | null>(null);
  const [fuel, setFuel] = useState<FuelRow[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The form. One set of fields serves both tabs.
  const [kind, setKind] = useState<MaintenanceKind>('oil');
  const [day, setDay] = useState(today());
  const [odometer, setOdometer] = useState('');
  const [cost, setCost] = useState('');
  const [notes, setNotes] = useState('');
  const [amount, setAmount] = useState('');
  const [full, setFull] = useState(true);

  const load = useCallback(async () => {
    if (!id) return;
    setLoadError(null);
    const res = await garageLog.load(String(id));
    if (res.ok) {
      setService(res.data.service);
      setFuel(res.data.fuel);
    } else setLoadError(res.error.message);
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  function reset() {
    setAdding(false);
    setError(null);
    setDay(today());
    setOdometer('');
    setCost('');
    setNotes('');
    setAmount('');
    setFull(true);
  }

  async function save() {
    if (!id) return;
    if (!validDay(day)) return setError('Write the date as year-month-day, like 2026-11-12.');
    const odo = odometer.trim() ? parseNumber(odometer) : null;
    if (odometer.trim() && odo === null) return setError("That odometer reading isn't a number.");
    const cents = cost.trim() ? parseCents(cost) : null;
    if (cost.trim() && cents === null) return setError("That cost isn't a number.");
    const odometerKm = odo === null ? null : Math.round(toKm(units, odo) * 10) / 10;
    setBusy(true);
    setError(null);
    if (tab === 'service') {
      const res = await garageLog.addService({ carId: String(id), kind, doneOn: day, odometerKm, costCents: cents, notes: notes.trim() || null });
      setBusy(false);
      if (!res.ok) return setError(res.error.message);
      setService((rows) => [res.data, ...(rows ?? [])].sort((a, b) => b.done_on.localeCompare(a.done_on)));
    } else {
      const typed = parseNumber(amount);
      if (!typed) {
        setBusy(false);
        return setError(`Enter how much fuel went in, in ${units === 'imperial' ? 'gallons' : 'litres'}.`);
      }
      const res = await garageLog.addFill({ carId: String(id), filledOn: day, litres: Math.round(toLitres(units, typed) * 100) / 100, odometerKm, costCents: cents, fullTank: full });
      setBusy(false);
      if (!res.ok) return setError(res.error.message);
      setFuel((rows) => [res.data, ...rows].sort((a, b) => b.filled_on.localeCompare(a.filled_on)));
    }
    reset();
  }

  async function remove(which: 'service' | 'fuel', rowId: string) {
    const before = { service, fuel };
    // Off the list at once; back if the server says no.
    if (which === 'service') setService((rows) => (rows ?? []).filter((r) => r.id !== rowId));
    else setFuel((rows) => rows.filter((r) => r.id !== rowId));
    const res = await garageLog.remove(which, rowId);
    if (!res.ok) {
      setService(before.service);
      setFuel(before.fuel);
      setError(res.error.message);
    }
  }

  const economy = fuelEconomy(fuel.map((f) => ({ litres: Number(f.litres), odometerKm: f.odometer_km === null ? null : Number(f.odometer_km), fullTank: f.full_tank })));
  const year = String(new Date().getFullYear());
  const spent = spentSince(`${year}-01-01`, service ?? [], fuel);
  const dist = distanceUnit(units);
  const vol = volumeUnit(units);
  const title = car ? `${car.make} ${car.model}` : 'Car log';

  return (
    <Screen safeTop={false}>
      <Stack.Screen options={{ title }} />
      <View style={styles.column}>
        <Card style={styles.summary}>
          <View style={{ flex: 1 }}>
            <ThemedText type="metric" numberOfLines={1} adjustsFontSizeToFit>
              {economy ? economyLabel(units, economy) : '—'}
            </ThemedText>
            <ThemedText type="label" themeColor="textSecondary">
              Fuel economy
            </ThemedText>
          </View>
          <View style={{ flex: 1 }}>
            <ThemedText type="metric" numberOfLines={1} adjustsFontSizeToFit>
              {formatCents(spent)}
            </ThemedText>
            <ThemedText type="label" themeColor="textSecondary">
              Spent in {year}
            </ThemedText>
          </View>
        </Card>
        {!economy && fuel.length > 0 ? <Notice icon="gas-station-outline">Fuel economy shows up after two full tanks that both have an odometer reading.</Notice> : null}

        <Segmented
          options={[
            { value: 'service', label: 'Service' },
            { value: 'fuel', label: 'Fuel' },
          ]}
          value={tab}
          onChange={(t) => {
            setTab(t);
            reset();
          }}
        />

        {adding ? (
          <Card style={{ gap: Spacing.three }}>
            <ThemedText type="heading">{tab === 'service' ? 'Add service' : 'Add a fill-up'}</ThemedText>
            {tab === 'service' ? (
              <View style={styles.chips} accessibilityRole="radiogroup">
                {MAINTENANCE_KINDS.map((k) => {
                  const selected = kind === k.value;
                  return (
                    <Pressable key={k.value} onPress={() => setKind(k.value)} accessibilityRole="radio" accessibilityState={{ selected }} accessibilityLabel={k.label} style={[styles.chip, { backgroundColor: selected ? theme.accent : theme.backgroundSelected }]}>
                      <MaterialCommunityIcons name={k.icon as IconName} size={18} color={selected ? theme.accentText : theme.text} />
                      <ThemedText type="smallBold" style={{ color: selected ? theme.accentText : theme.text }}>
                        {k.label}
                      </ThemedText>
                    </Pressable>
                  );
                })}
              </View>
            ) : (
              <TextField label={`Fuel added (${vol})`} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder={units === 'imperial' ? '10.5' : '40'} />
            )}
            <TextField label="Date" value={day} onChangeText={setDay} placeholder="2026-11-12" autoCapitalize="none" autoCorrect={false} />
            <TextField label={`Odometer (${dist}), optional`} value={odometer} onChangeText={setOdometer} keyboardType="decimal-pad" />
            <TextField label="Cost, optional" value={cost} onChangeText={setCost} keyboardType="decimal-pad" />
            {tab === 'service' ? (
              <TextField label="Notes, optional" value={notes} onChangeText={setNotes} maxLength={500} multiline style={{ minHeight: 72, paddingTop: 12, textAlignVertical: 'top' }} />
            ) : (
              <View style={styles.row}>
                <View style={{ flex: 1 }}>
                  <ThemedText style={{ fontWeight: 700 }}>Filled the tank</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    Fuel economy is worked out between full tanks.
                  </ThemedText>
                </View>
                <Switch value={full} onValueChange={setFull} trackColor={{ true: theme.accent }} accessibilityLabel="Filled the tank" />
              </View>
            )}
            {error ? <Notice tone="danger">{error}</Notice> : null}
            <View style={{ flexDirection: 'row', gap: Spacing.two }}>
              <Button label="Cancel" variant="secondary" onPress={reset} style={{ flex: 1 }} />
              <Button label="Save" onPress={() => void save()} loading={busy} style={{ flex: 1 }} />
            </View>
          </Card>
        ) : (
          <>
            <Button label={tab === 'service' ? 'Add service' : 'Add a fill-up'} icon={<MaterialCommunityIcons name="plus" size={22} color={theme.accentText} />} onPress={() => setAdding(true)} />
            {error ? <Notice tone="danger">{error}</Notice> : null}
          </>
        )}

        {loadError ? (
          <ErrorState message={loadError} onRetry={() => void load()} />
        ) : service === null ? (
          <LoadingRows count={3} avatar={false} />
        ) : tab === 'service' ? (
          service.length === 0 ? (
            <EmptyState icon="wrench-outline" title="No service yet" body="Log oil changes, tires, brakes and repairs so you know what was done and when." />
          ) : (
            <Card style={{ paddingVertical: Spacing.one }}>
              {service.map((s, i) => (
                <View key={s.id} style={[styles.entry, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border }]}>
                  <MaterialCommunityIcons name={kindIcon(s.kind) as IconName} size={24} color={theme.accent} />
                  <View style={{ flex: 1 }}>
                    <ThemedText type="lead">{kindLabel(s.kind)}</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {[showDay(s.done_on), s.odometer_km !== null ? `${Math.round(fromKm(units, Number(s.odometer_km))).toLocaleString()} ${dist}` : null, s.cost_cents !== null ? formatCents(s.cost_cents) : null].filter(Boolean).join(' · ')}
                    </ThemedText>
                    {s.notes ? <ThemedText type="small">{s.notes}</ThemedText> : null}
                  </View>
                  <IconButton icon="trash-can-outline" label={`Delete ${kindLabel(s.kind)} from ${showDay(s.done_on)}`} color={theme.textSecondary} onPress={() => void remove('service', s.id)} />
                </View>
              ))}
            </Card>
          )
        ) : fuel.length === 0 ? (
          <EmptyState icon="gas-station-outline" title="No fill-ups yet" body="Log each fill-up with the odometer reading and Convoy works out your fuel economy." />
        ) : (
          <Card style={{ paddingVertical: Spacing.one }}>
            {fuel.map((f, i) => (
              <View key={f.id} style={[styles.entry, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border }]}>
                <MaterialCommunityIcons name={f.full_tank ? 'gas-station' : 'gas-station-outline'} size={24} color={theme.accent} />
                <View style={{ flex: 1 }}>
                  <ThemedText type="lead">
                    {fromLitres(units, Number(f.litres)).toFixed(1)} {vol}
                    {f.full_tank ? '' : ' (partial)'}
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {[showDay(f.filled_on), f.odometer_km !== null ? `${Math.round(fromKm(units, Number(f.odometer_km))).toLocaleString()} ${dist}` : null, f.cost_cents !== null ? formatCents(f.cost_cents) : null].filter(Boolean).join(' · ')}
                  </ThemedText>
                </View>
                <IconButton icon="trash-can-outline" label={`Delete fill-up from ${showDay(f.filled_on)}`} color={theme.textSecondary} onPress={() => void remove('fuel', f.id)} />
              </View>
            ))}
          </Card>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  column: { width: '100%', maxWidth: 640, alignSelf: 'center', gap: Spacing.three },
  summary: { flexDirection: 'row', gap: Spacing.three },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  chip: { minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: Spacing.one, paddingHorizontal: Spacing.three, borderRadius: Radius.pill },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  entry: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, paddingVertical: Spacing.two + 2 },
});
