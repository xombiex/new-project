import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Avatar, Button, Card, EmptyState, ErrorState, LoadingRows, Notice, Screen } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { safety, type BlockedPerson } from '@/services/safety';

/** Everyone this person has blocked, with a way back. Reached from Profile → Privacy. */
export default function BlockedScreen() {
  const theme = useTheme();
  const [people, setPeople] = useState<BlockedPerson[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const res = await safety.blocked();
    if (res.ok) setPeople(res.data);
    else setError(res.error.message);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function unblock(person: BlockedPerson) {
    const before = people ?? [];
    // Off the list at once; back on it if the server says no.
    setPeople(before.filter((p) => p.id !== person.id));
    setNotice(null);
    const res = await safety.unblock(person.id);
    if (res.ok) setNotice(`${person.display_name} is unblocked. You're not friends again until one of you sends a request.`);
    else {
      setPeople(before);
      setNotice(res.error.message);
    }
  }

  return (
    <Screen safeTop={false}>
      <View style={styles.column}>
        <ThemedText themeColor="textSecondary">
          People you block can&apos;t send you friend requests or see your location, drives, comments or garage, and you don&apos;t see theirs. They aren&apos;t told.
        </ThemedText>
        {notice ? <Notice tone="info">{notice}</Notice> : null}
        {error ? (
          <ErrorState message={error} onRetry={() => void load()} />
        ) : people === null ? (
          <LoadingRows count={2} />
        ) : people.length === 0 ? (
          <EmptyState icon="account-check-outline" title="Nobody blocked" body="To block someone, open the menu on their drive or comment, or press and hold them in your friends list." />
        ) : (
          <Card style={{ paddingVertical: Spacing.one }}>
            {people.map((p, i) => (
              <View key={p.id} style={[styles.person, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border }]}>
                <Avatar name={p.display_name} color={p.avatar_color} />
                <View style={{ flex: 1 }}>
                  <ThemedText type="lead" numberOfLines={1}>
                    {p.display_name}
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                    @{p.username}
                  </ThemedText>
                </View>
                <Button label="Unblock" variant="secondary" onPress={() => void unblock(p)} />
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
  person: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, paddingVertical: Spacing.two + 2 },
});
