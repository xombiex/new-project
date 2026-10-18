import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { useInbox } from '@/store/inbox';

/** Red count on the profile avatar when the Convoy team has sent you something new. */
export function UnreadBadge() {
  const theme = useTheme();
  const unread = useInbox((s) => s.unread);
  if (!unread) return null;
  return (
    <View style={[styles.badge, { backgroundColor: theme.danger, borderColor: theme.background }]} accessibilityLabel={`${unread} new messages`}>
      <ThemedText style={styles.text}>{unread > 9 ? '9+' : unread}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { position: 'absolute', top: -3, right: -3, minWidth: 20, height: 20, borderRadius: 10, borderWidth: 2, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center' },
  text: { color: '#fff', fontSize: 11, lineHeight: 13, fontWeight: 800 },
});
