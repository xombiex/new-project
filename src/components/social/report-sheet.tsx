import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Switch, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, TextField } from '@/components/ui';
import { HitTarget, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { ContentReportKind, ContentReportReason } from '@/services/database.types';
import { REPORT_REASONS, safety } from '@/services/safety';
import { useFriends } from '@/store/friends';

import { Sheet } from './action-menu';

export type ReportTarget = { kind: ContentReportKind; id: string; /** who it's about, for the "also block" switch */ userId: string; name: string };

const WHAT: Record<ContentReportKind, string> = { user: 'this person', activity: 'this drive', comment: 'this comment' };

/** Report a person, a shared drive or a comment to the Convoy team, and optionally block them too. */
export function ReportSheet({ target, onClose, onBlocked }: { target: ReportTarget | null; onClose: () => void; onBlocked?: (userId: string) => void }) {
  const theme = useTheme();
  const block = useFriends((s) => s.block);
  const [reason, setReason] = useState<ContentReportReason | null>(null);
  const [details, setDetails] = useState('');
  const [alsoBlock, setAlsoBlock] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  // A fresh form each time it opens.
  useEffect(() => {
    if (target) {
      setReason(null);
      setDetails('');
      setAlsoBlock(false);
      setError(null);
      setSent(false);
    }
  }, [target]);

  async function send() {
    if (!target || !reason) return;
    setBusy(true);
    setError(null);
    const res = await safety.report({ kind: target.kind, id: target.id }, reason, details);
    if (res.ok && alsoBlock) {
      const blockError = await block(target.userId);
      if (!blockError) onBlocked?.(target.userId);
    }
    setBusy(false);
    if (res.ok) setSent(true);
    else setError(res.error.message);
  }

  return (
    <Sheet visible={Boolean(target)} onClose={onClose} title={sent ? undefined : `Report ${target ? WHAT[target.kind] : ''}`}>
      {sent ? (
        <View style={styles.done}>
          <MaterialCommunityIcons name="check-circle" size={44} color={theme.success} />
          <ThemedText type="heading">Report sent</ThemedText>
          <ThemedText themeColor="textSecondary" style={{ textAlign: 'center' }}>
            The Convoy team will take a look. {target?.name} isn&apos;t told who reported them.
          </ThemedText>
          <Button label="Done" onPress={onClose} style={{ alignSelf: 'stretch' }} />
        </View>
      ) : (
        <View style={{ gap: Spacing.two }}>
          <View accessibilityRole="radiogroup" style={{ gap: Spacing.one }}>
            {REPORT_REASONS.map((r) => {
              const selected = reason === r.value;
              return (
                <Pressable
                  key={r.value}
                  onPress={() => setReason(r.value)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  accessibilityLabel={r.label}
                  accessibilityHint={r.hint}
                  style={[styles.reason, { borderColor: selected ? theme.accent : theme.border, backgroundColor: selected ? theme.backgroundSelected : 'transparent' }]}>
                  <MaterialCommunityIcons name={selected ? 'radiobox-marked' : 'radiobox-blank'} size={22} color={selected ? theme.accent : theme.textSecondary} />
                  <View style={{ flex: 1 }}>
                    <ThemedText style={{ fontWeight: 700 }}>{r.label}</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {r.hint}
                    </ThemedText>
                  </View>
                </Pressable>
              );
            })}
          </View>
          <TextField placeholder="Anything else we should know? (optional)" value={details} onChangeText={setDetails} maxLength={500} multiline style={{ minHeight: 72, paddingTop: Spacing.two, textAlignVertical: 'top' }} />
          <View style={styles.blockRow}>
            <View style={{ flex: 1 }}>
              <ThemedText style={{ fontWeight: 700 }}>Also block {target?.name}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                They won&apos;t see your drives or location, and you won&apos;t see theirs.
              </ThemedText>
            </View>
            <Switch value={alsoBlock} onValueChange={setAlsoBlock} trackColor={{ true: theme.accent }} accessibilityLabel={`Also block ${target?.name}`} />
          </View>
          {error ? (
            <ThemedText type="small" style={{ color: theme.danger }} accessibilityRole="alert">
              {error}
            </ThemedText>
          ) : null}
          <Button label="Send report" variant="danger" onPress={() => void send()} loading={busy} disabled={!reason} />
        </View>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  reason: { minHeight: HitTarget.min, flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two, borderRadius: Radius.md, borderWidth: 1.5 },
  blockRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, paddingVertical: Spacing.two },
  done: { alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.three },
});
