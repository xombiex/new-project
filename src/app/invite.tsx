import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, Share, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Avatar, Button, Card, SectionTitle } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { notify } from '@/lib/notifications';
import { useDrive } from '@/store/drive';
import { useFriends } from '@/store/friends';

/** Invite friends to the current group drive by push notification (or share the code anywhere). */
export default function InviteScreen() {
  const theme = useTheme();
  const router = useRouter();
  const drive = useDrive((s) => s.drive);
  const members = useDrive((s) => s.members);
  const { friendships, refresh } = useFriends();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sent, setSent] = useState(false);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (!drive) return null;
  const friends = friendships.filter((f) => f.status === 'accepted' && !members[f.other.id]);

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }

  async function send() {
    await notify({ type: 'drive_invite', drive_id: drive!.id, to: [...selected] });
    setSent(true);
    setTimeout(() => router.back(), 900);
  }

  return (
    <ScrollView style={{ backgroundColor: theme.background }} contentContainerStyle={{ padding: Spacing.three, gap: Spacing.three }}>
      <Button
        label={`Share code ${drive.code}`}
        variant="secondary"
        icon={<MaterialCommunityIcons name="share-variant" size={20} color={theme.text} />}
        onPress={() => void Share.share({ message: `Join my Convoy drive "${drive.name}" with code ${drive.code}` })}
      />
      <SectionTitle>Friends</SectionTitle>
      {friends.length === 0 ? (
        <ThemedText themeColor="textSecondary">All your friends are already here, or you haven&apos;t added any yet.</ThemedText>
      ) : (
        <Card style={{ paddingVertical: Spacing.one }}>
          {friends.map((f, i) => {
            const on = selected.has(f.other.id);
            return (
              <Pressable
                key={f.other.id}
                onPress={() => toggle(f.other.id)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on }}
                style={[styles.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border }]}>
                <Avatar name={f.other.display_name} color={f.other.avatar_color} />
                <View style={{ flex: 1 }}>
                  <ThemedText style={{ fontWeight: 700 }}>{f.other.display_name}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    @{f.other.username}
                  </ThemedText>
                </View>
                <MaterialCommunityIcons
                  name={on ? 'checkbox-marked-circle' : 'checkbox-blank-circle-outline'}
                  size={26}
                  color={on ? theme.accent : theme.textSecondary}
                />
              </Pressable>
            );
          })}
        </Card>
      )}
      <Button
        label={sent ? 'Invites sent' : `Send ${selected.size || ''} invite${selected.size === 1 ? '' : 's'}`}
        size="lg"
        disabled={selected.size === 0 || sent}
        onPress={send}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, paddingVertical: Spacing.two + 2 },
});
