import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { ListPicker } from '@/components/list-picker';
import { SpecSheet } from '@/components/spec-sheet';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, TextField } from '@/components/ui';
import { VehiclePicker } from '@/components/vehicle-picker';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { bodyFromText, decodeVin, epaMakes, epaModels, epaTrims, epaVehicle, epaYears, specsFromEpa, type CarSpecs, type MenuItem } from '@/lib/car-specs';
import { VEHICLES, type Paint, type Vehicle } from '@/lib/vehicles';
import { useGarage } from '@/store/garage';
import { useEntitled } from '@/store/pro';

type Step = 'year' | 'make' | 'model' | 'trim';
const STEP_TITLE: Record<Step, string> = { year: 'Year', make: 'Make', model: 'Model', trim: 'Engine & transmission' };
type CustomKey = 'hp' | 'torque' | 'zeroToSixty' | 'topSpeedMph';
const CUSTOM_FIELDS: [CustomKey, string, string][] = [
  ['hp', 'Horsepower', 'hp'],
  ['torque', 'Torque', 'lb-ft'],
  ['zeroToSixty', '0–60', 'seconds'],
  ['topSpeedMph', 'Top speed', 'mph'],
];

/** Add a car to the garage (id = "new") or edit one. */
export default function CarEditor() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const router = useRouter();
  const existing = useGarage((s) => s.cars.find((c) => c.id === id));
  const save = useGarage((s) => s.save);
  const styles3d = useEntitled('cosmetics');
  const [make, setMake] = useState(existing?.make ?? '');
  const [model, setModel] = useState(existing?.model ?? '');
  const [year, setYear] = useState(existing?.year ? String(existing.year) : '');
  const [trim, setTrim] = useState(existing?.trim ?? '');
  const [nickname, setNickname] = useState(existing?.nickname ?? '');
  const [specs, setSpecs] = useState<CarSpecs>(existing?.specs ?? {});
  const [body, setBody] = useState<Vehicle>(existing?.body ?? 'car');
  const [bodyTouched, setBodyTouched] = useState(Boolean(existing));
  const [paint, setPaint] = useState<Paint>(existing?.paint ?? 'blue');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Finder state
  const [step, setStep] = useState<Step | null>(null);
  const [items, setItems] = useState<MenuItem[] | null>(null);
  const [loadingList, setLoadingList] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [pick, setPick] = useState<{ year?: number; make?: string; model?: string }>({});
  const [vinOpen, setVinOpen] = useState(false);
  const [vin, setVin] = useState('');
  const [looking, setLooking] = useState(false);
  const [finderError, setFinderError] = useState<string | null>(null);

  const yearNum = year ? Number(year) : null;
  const yearOk = yearNum === null || (yearNum >= 1886 && yearNum <= new Date().getFullYear() + 2);
  const valid = make.trim().length > 0 && model.trim().length > 0 && yearOk;

  /** Switch the 3D body to match the car, unless they chose one or it's a locked style. */
  function suggestBody(b: Vehicle | null) {
    if (b && !bodyTouched && (styles3d || !VEHICLES.find((v) => v.value === b)?.premium)) setBody(b);
  }

  async function open(next: Step, ctx: { year?: number; make?: string; model?: string }) {
    setStep(next);
    setItems(null);
    setListError(null);
    setLoadingList(true);
    try {
      const list =
        next === 'year' ? await epaYears() : next === 'make' ? await epaMakes(ctx.year!) : next === 'model' ? await epaModels(ctx.year!, ctx.make!) : await epaTrims(ctx.year!, ctx.make!, ctx.model!);
      setItems(list);
    } catch (e) {
      setListError(e instanceof Error ? e.message : 'Couldn’t load the list');
    } finally {
      setLoadingList(false);
    }
  }

  async function onPicked(item: MenuItem) {
    if (step === 'year') {
      const ctx = { year: Number(item.value) };
      setPick(ctx);
      return open('make', ctx);
    }
    if (step === 'make') {
      const ctx = { ...pick, make: item.value };
      setPick(ctx);
      return open('model', ctx);
    }
    if (step === 'model') {
      const ctx = { ...pick, model: item.value };
      setPick(ctx);
      return open('trim', ctx);
    }
    // Engine & transmission picked: fill everything in.
    setStep(null);
    setLooking(true);
    setFinderError(null);
    try {
      const v = await epaVehicle(item.value);
      setYear(String(pick.year));
      setMake(pick.make ?? '');
      setModel(pick.model ?? '');
      setTrim(item.text);
      setSpecs((s) => ({ ...specsFromEpa(v), ...keepCustom(s) }));
      suggestBody(bodyFromText(v.VClass));
    } catch (e) {
      setFinderError(e instanceof Error ? e.message : 'Couldn’t load that car');
    } finally {
      setLooking(false);
    }
  }

  async function lookUpVin() {
    setLooking(true);
    setFinderError(null);
    try {
      const r = await decodeVin(vin);
      if (r.year) setYear(String(r.year));
      setMake(r.make.slice(0, 40));
      setModel(r.model.slice(0, 40));
      setTrim(r.trim ?? '');
      setSpecs((s) => ({ ...r.specs, ...keepCustom(s) }));
      suggestBody(r.body);
      setVinOpen(false);
    } catch (e) {
      setFinderError(e instanceof Error ? e.message : 'VIN lookup failed');
    } finally {
      setLooking(false);
    }
  }

  /** The owner's own numbers (modded cars) override the looked-up ones. */
  function setCustom(key: CustomKey, text: string) {
    const n = Number(text.replace(/[^\d.]/g, ''));
    setSpecs((s) => {
      const custom = new Set(s.custom ?? []);
      const next: CarSpecs = { ...s };
      if (text.trim() && Number.isFinite(n) && n > 0) {
        next[key] = key === 'zeroToSixty' ? Math.round(n * 10) / 10 : Math.round(n);
        custom.add(key);
      } else {
        delete next[key];
        custom.delete(key);
      }
      next.custom = [...custom];
      if (!next.custom.length) delete next.custom;
      return next;
    });
  }

  async function onSave() {
    setBusy(true);
    const err = await save({ make, model, year: yearNum, nickname, body, paint, trim: trim || null, specs }, existing?.id);
    setBusy(false);
    if (err) setError(err);
    else router.back();
  }

  const hasSpecs = Object.keys(specs).some((k) => k !== 'custom' && k !== 'epaId');

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: theme.background }}>
      <Stack.Screen options={{ title: existing ? 'Edit car' : 'Add a car' }} />
      <ScrollView contentContainerStyle={{ padding: Spacing.four, gap: Spacing.three }} keyboardShouldPersistTaps="handled">
        {/* Find the exact car: fills make/model/year and the specs */}
        <Card style={{ gap: Spacing.three }}>
          <View style={styles.row}>
            <MaterialCommunityIcons name="magnify" size={22} color={theme.accent} />
            <View style={{ flex: 1 }}>
              <ThemedText style={{ fontWeight: 800 }}>Find your car</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                Every car sold in the US since 1984. Fills in horsepower, 0–60, drivetrain, transmission, MPG and more.
              </ThemedText>
            </View>
          </View>
          <View style={styles.row}>
            <Button label="Pick year, make, model" onPress={() => void open('year', {})} style={{ flex: 1 }} />
            <Button label="Use VIN" variant="secondary" onPress={() => setVinOpen((v) => !v)} />
          </View>
          {vinOpen ? (
            <Animated.View entering={FadeIn.duration(150)} style={styles.row}>
              <View style={{ flex: 1 }}>
                <TextField
                  value={vin}
                  onChangeText={(t) => setVin(t.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 17))}
                  placeholder="17-character VIN"
                  autoCapitalize="characters"
                  autoCorrect={false}
                />
              </View>
              <Button label="Look up" disabled={vin.length !== 17 || looking} onPress={() => void lookUpVin()} />
            </Animated.View>
          ) : null}
          {looking ? <ActivityIndicator color={theme.accent} /> : null}
          {finderError ? (
            <ThemedText type="small" style={{ color: theme.danger }}>
              {finderError}
            </ThemedText>
          ) : null}
        </Card>

        {hasSpecs ? (
          <Animated.View entering={FadeIn.duration(250)} style={{ gap: Spacing.two }}>
            <ThemedText type="smallBold" themeColor="textSecondary">
              {[year, make, model].filter(Boolean).join(' ')}
              {trim ? ` · ${trim}` : ''}
            </ThemedText>
            <SpecSheet specs={specs} />
            <ThemedText type="small" themeColor="textSecondary">
              From the EPA and NHTSA. Horsepower and 0–60 are manufacturer figures for the model and can vary by trim.
            </ThemedText>
          </Animated.View>
        ) : null}

        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <TextField label="Make" value={make} onChangeText={setMake} placeholder="Porsche" maxLength={40} autoCapitalize="words" />
          </View>
          <View style={{ flex: 1 }}>
            <TextField label="Model" value={model} onChangeText={setModel} placeholder="911 GT3 RS" maxLength={40} autoCapitalize="words" />
          </View>
        </View>
        <View style={styles.row}>
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

        {/* Modded? Their numbers win over the factory ones. */}
        <ThemedText type="smallBold" themeColor="textSecondary">
          Your numbers (modded? enter your build)
        </ThemedText>
        <View style={styles.grid}>
          {CUSTOM_FIELDS.map(([key, label, unit]) => (
            <View key={key} style={styles.gridItem}>
              <TextField
                label={label}
                value={specs.custom?.includes(key) ? String(specs[key] ?? '') : ''}
                onChangeText={(t) => setCustom(key, t)}
                placeholder={specs[key] != null && !specs.custom?.includes(key) ? `${specs[key]} ${unit}` : unit}
                keyboardType="decimal-pad"
              />
            </View>
          ))}
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
            setBodyTouched(true);
            setError(null);
          }}
        />
        {error ? <ThemedText style={{ color: theme.danger }}>{error}</ThemedText> : null}
        <Button label={existing ? 'Save' : 'Add to garage'} size="lg" loading={busy} disabled={!valid} onPress={onSave} />
      </ScrollView>

      {step ? (
        <ListPicker title={STEP_TITLE[step]} items={items} loading={loadingList} error={listError} onPick={(i) => void onPicked(i)} onClose={() => setStep(null)} />
      ) : null}
    </KeyboardAvoidingView>
  );
}

/** The owner's typed-in numbers survive picking a different trim or decoding a VIN. */
function keepCustom(s: CarSpecs): CarSpecs {
  const out: CarSpecs = {};
  for (const k of s.custom ?? []) out[k] = s[k] as never;
  if (s.custom?.length) out.custom = s.custom;
  return out;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  gridItem: { flexBasis: '47%', flexGrow: 1 },
});
