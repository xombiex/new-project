import { StyleSheet, View } from 'react-native';

import { useTheme } from '@/hooks/use-theme';
import { isOnline } from '@/lib/presence';

/** Green dot on the corner of an avatar when the person is online; nothing otherwise. */
export function OnlineDot({ lastSeen, size = 13 }: { lastSeen: number | undefined; size?: number }) {
  const theme = useTheme();
  if (!isOnline(lastSeen)) return null;
  return (
    <View
      accessibilityLabel="Online"
      style={[
        styles.dot,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: theme.success, borderColor: theme.backgroundElement },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  dot: { position: 'absolute', right: -1, bottom: -1, borderWidth: 2.5 },
});
