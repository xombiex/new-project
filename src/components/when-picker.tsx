import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const TIMES: number[] = [];
for (let m = 6 * 60; m <= 23 * 60 + 30; m += 30) TIMES.push(m); // 6:00 AM – 11:30 PM

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/** Day chips (next 60 days) + half-hour time chips. No native date picker dependency. */
export function WhenPicker({ value, onChange }: { value: Date; onChange: (d: Date) => void }) {
  const theme = useTheme();
  const days = useMemo(() => {
    const today = startOfDay(new Date());
    return Array.from({ length: 60 }, (_, i) => {
      const d = new Date(today);
      d.setDate(d.getDate() + i);
      return d;
    });
  }, []);
  const minutes = value.getHours() * 60 + value.getMinutes();
  const now = Date.now();

  function pick(day: Date, mins: number) {
    const d = new Date(day);
    d.setHours(Math.floor(mins / 60), mins % 60, 0, 0);
    onChange(d);
  }

  const chip = (selected: boolean, disabled = false) => [
    styles.chip,
    { backgroundColor: selected ? theme.accent : theme.backgroundSelected, opacity: disabled ? 0.35 : 1 },
  ];

  return (
    <View style={{ gap: Spacing.two }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {days.map((d, i) => {
          const selected = startOfDay(value).getTime() === d.getTime();
          return (
            <Pressable key={d.getTime()} onPress={() => pick(d, minutes)} style={chip(selected)} accessibilityRole="button" accessibilityState={{ selected }}>
              <ThemedText type="smallBold" style={{ color: selected ? theme.accentText : theme.textSecondary }}>
                {i === 0 ? 'Today' : i === 1 ? 'Tmrw' : d.toLocaleDateString([], { weekday: 'short' })}
              </ThemedText>
              <ThemedText style={{ fontWeight: 800, color: selected ? theme.accentText : theme.text }}>{d.getDate()}</ThemedText>
            </Pressable>
          );
        })}
      </ScrollView>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {TIMES.map((m) => {
          const candidate = new Date(startOfDay(value));
          candidate.setHours(Math.floor(m / 60), m % 60);
          const past = candidate.getTime() < now;
          const selected = m === minutes;
          return (
            <Pressable
              key={m}
              disabled={past}
              onPress={() => pick(startOfDay(value), m)}
              style={chip(selected, past)}
              accessibilityRole="button"
              accessibilityState={{ selected, disabled: past }}>
              <ThemedText type="smallBold" style={{ color: selected ? theme.accentText : theme.text }}>
                {candidate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
              </ThemedText>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { gap: Spacing.two },
  chip: { minWidth: 56, paddingHorizontal: Spacing.two + 2, paddingVertical: Spacing.two, borderRadius: Radius.md, alignItems: 'center' },
});
