import { MaterialCommunityIcons } from '@expo/vector-icons';
import { TabList, TabSlot, TabTrigger, Tabs, type TabTriggerSlotProps } from 'expo-router/ui';
import { type ComponentProps } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/hooks/use-theme';

type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

/** Same tabs as the native layout. NativeTabs on web can only show text labels, so the web gets its own icon bar. */
const TABS: { name: string; href: '/' | '/convoy' | '/friends' | '/garage' | '/stats'; label: string; icon: IconName; iconFocused: IconName }[] = [
  { name: 'index', href: '/', label: 'Drive', icon: 'speedometer', iconFocused: 'speedometer' },
  { name: 'convoy', href: '/convoy', label: 'Convoy', icon: 'car-multiple', iconFocused: 'car-multiple' },
  { name: 'friends', href: '/friends', label: 'Friends', icon: 'account-multiple-outline', iconFocused: 'account-multiple' },
  { name: 'garage', href: '/garage', label: 'Garage', icon: 'garage-variant', iconFocused: 'garage-variant' },
  { name: 'stats', href: '/stats', label: 'Stats', icon: 'trophy-outline', iconFocused: 'trophy' },
];

export default function WebTabLayout() {
  const theme = useTheme();
  // iPhone home indicator: keep the tabs above it, with the bar's color running underneath.
  const insets = useSafeAreaInsets();
  return (
    <Tabs style={{ flex: 1, backgroundColor: theme.background }}>
      <TabSlot style={{ flex: 1 }} />
      <TabList style={[styles.bar, { backgroundColor: theme.backgroundElement, borderTopColor: theme.backgroundSelected, paddingBottom: Math.max(8, insets.bottom) }]}>
        {TABS.map((t) => (
          <TabTrigger key={t.name} name={t.name} href={t.href} asChild>
            <TabButton label={t.label} icon={t.icon} iconFocused={t.iconFocused} />
          </TabTrigger>
        ))}
      </TabList>
    </Tabs>
  );
}

type TabButtonProps = TabTriggerSlotProps & { label: string; icon: IconName; iconFocused: IconName };

// React 19: TabTrigger passes `ref` as a normal prop.
function TabButton({ label, icon, iconFocused, isFocused, style, ref, ...rest }: TabButtonProps) {
  const theme = useTheme();
  const color = isFocused ? theme.accent : theme.textSecondary;
  return (
    <Pressable ref={ref as never} {...rest} accessibilityRole="tab" accessibilityLabel={label} style={styles.button}>
      <View style={[styles.pill, isFocused && { backgroundColor: theme.backgroundSelected }]}>
        <MaterialCommunityIcons name={isFocused ? iconFocused : icon} size={24} color={color} />
      </View>
      <Text style={[styles.label, { color }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 6,
    paddingBottom: 8,
  },
  button: { flex: 1, maxWidth: 120, alignItems: 'center', gap: 2, cursor: 'pointer' } as never,
  pill: { width: 56, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 11, fontWeight: '600' },
});
