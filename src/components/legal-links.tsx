import { StyleProp, TextStyle } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { openLegal, PRIVACY_URL, TERMS_URL } from '@/lib/legal';

/** Inline "Terms · Privacy" links, optionally preceded by a sentence (e.g. "By creating an account you agree to the"). */
export function LegalLinks({ prefix, style }: { prefix?: string; style?: StyleProp<TextStyle> }) {
  const theme = useTheme();
  const link = { color: theme.accent, fontWeight: '600' as const };
  return (
    <ThemedText type="small" themeColor="textSecondary" style={[{ textAlign: 'center' }, style]}>
      {prefix ? `${prefix} ` : null}
      <ThemedText type="small" style={link} onPress={() => openLegal(TERMS_URL)} accessibilityRole="link">
        Terms of Service
      </ThemedText>
      {prefix ? ' and ' : '  ·  '}
      <ThemedText type="small" style={link} onPress={() => openLegal(PRIVACY_URL)} accessibilityRole="link">
        Privacy Policy
      </ThemedText>
      {prefix ? '.' : null}
    </ThemedText>
  );
}
