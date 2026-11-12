import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { HitTarget, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type IconName = keyof typeof MaterialCommunityIcons.glyphMap;

export type MenuAction = { icon: IconName; label: string; hint?: string; destructive?: boolean; onPress: () => void };

/**
 * A sheet that rises from the bottom, on phones and on the web alike. Used for "more" menus and
 * anything that needs a few choices: the browser's own prompt boxes can't show icons or wording.
 */
export function Sheet({ visible, onClose, title, children }: { visible: boolean; onClose: () => void; title?: string; children: ReactNode }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.fill}>
        <Pressable style={[StyleSheet.absoluteFill, styles.scrim]} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" />
        <View style={[styles.sheet, { backgroundColor: theme.backgroundElement, borderColor: theme.border, paddingBottom: Math.max(insets.bottom, Spacing.three) }]} accessibilityViewIsModal>
          <View style={[styles.grabber, { backgroundColor: theme.backgroundSelected }]} />
          {title ? (
            <ThemedText type="heading" style={styles.title} accessibilityRole="header">
              {title}
            </ThemedText>
          ) : null}
          {children}
        </View>
      </View>
    </Modal>
  );
}

/** A "more" menu: a short list of things to do with one item. */
export function ActionMenu({ visible, onClose, title, actions }: { visible: boolean; onClose: () => void; title?: string; actions: MenuAction[] }) {
  const theme = useTheme();
  return (
    <Sheet visible={visible} onClose={onClose} title={title}>
      {actions.map((a) => (
        <Pressable
          key={a.label}
          accessibilityRole="button"
          accessibilityLabel={a.label}
          accessibilityHint={a.hint}
          onPress={() => {
            onClose();
            a.onPress();
          }}
          style={({ pressed }) => [styles.row, { backgroundColor: pressed ? theme.backgroundSelected : 'transparent' }]}>
          <MaterialCommunityIcons name={a.icon} size={24} color={a.destructive ? theme.danger : theme.text} />
          <View style={{ flex: 1 }}>
            <ThemedText type="lead" style={a.destructive ? { color: theme.danger } : undefined}>
              {a.label}
            </ThemedText>
            {a.hint ? (
              <ThemedText type="small" themeColor="textSecondary">
                {a.hint}
              </ThemedText>
            ) : null}
          </View>
        </Pressable>
      ))}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, justifyContent: 'flex-end', alignItems: 'center' },
  scrim: { backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: {
    width: '100%',
    maxWidth: 520,
    borderTopLeftRadius: Radius.lg,
    borderTopRightRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: 0,
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
    gap: Spacing.one,
  },
  grabber: { width: 40, height: 5, borderRadius: 3, alignSelf: 'center', marginBottom: Spacing.two },
  title: { marginBottom: Spacing.two },
  row: { minHeight: HitTarget.driving, flexDirection: 'row', alignItems: 'center', gap: Spacing.three, paddingHorizontal: Spacing.two, borderRadius: Radius.md },
});
