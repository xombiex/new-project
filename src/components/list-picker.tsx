import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { MenuItem } from '@/lib/car-specs';

/** Full-screen searchable list (Year → Make → Model → Trim). */
export function ListPicker({
  title,
  items,
  loading,
  error,
  onPick,
  onClose,
}: {
  title: string;
  items: MenuItem[] | null;
  loading: boolean;
  error: string | null;
  onPick: (item: MenuItem) => void;
  onClose: () => void;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (items ?? []).filter((i) => !q || i.text.toLowerCase().includes(q));
  }, [items, query]);

  return (
    <Modal visible animationType="slide" onRequestClose={onClose} presentationStyle="pageSheet">
      <View style={{ flex: 1, backgroundColor: theme.background, paddingTop: Spacing.three, paddingBottom: insets.bottom }}>
        <View style={styles.head}>
          <ThemedText style={{ fontSize: 20, fontWeight: 800, flex: 1 }}>{title}</ThemedText>
          <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button">
            <ThemedText style={{ color: theme.accent, fontWeight: 700 }}>Cancel</ThemedText>
          </Pressable>
        </View>
        {(items?.length ?? 0) > 12 ? (
          <View style={[styles.search, { backgroundColor: theme.backgroundSelected }]}>
            <MaterialCommunityIcons name="magnify" size={20} color={theme.textSecondary} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search"
              placeholderTextColor={theme.textSecondary}
              autoCorrect={false}
              style={[styles.input, { color: theme.text }]}
            />
          </View>
        ) : null}
        {loading ? <ActivityIndicator color={theme.accent} style={{ marginTop: Spacing.four }} /> : null}
        {error ? <ThemedText style={{ color: theme.danger, padding: Spacing.three }}>{error}</ThemedText> : null}
        <FlatList
          data={shown}
          keyExtractor={(i) => i.value}
          keyboardShouldPersistTaps="handled"
          ItemSeparatorComponent={() => <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: theme.border, marginLeft: Spacing.three }} />}
          renderItem={({ item }) => (
            <Pressable onPress={() => onPick(item)} accessibilityRole="button" style={({ pressed }) => [styles.row, pressed && { backgroundColor: theme.backgroundSelected }]}>
              <ThemedText style={{ flex: 1 }}>{item.text}</ThemedText>
              <MaterialCommunityIcons name="chevron-right" size={20} color={theme.textSecondary} />
            </Pressable>
          )}
          ListEmptyComponent={
            !loading && !error && items ? (
              <ThemedText themeColor="textSecondary" style={{ padding: Spacing.three }}>
                Nothing found.
              </ThemedText>
            ) : undefined
          }
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.three, paddingBottom: Spacing.two },
  search: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, marginHorizontal: Spacing.three, marginBottom: Spacing.two, paddingHorizontal: Spacing.three, borderRadius: Radius.md, minHeight: 44 },
  input: { flex: 1, fontSize: 16, paddingVertical: Spacing.two, outlineStyle: 'none' } as never,
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.three, paddingVertical: Spacing.three },
});
