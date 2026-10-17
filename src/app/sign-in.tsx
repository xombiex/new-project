import { useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';

import { LegalLinks } from '@/components/legal-links';
import { ThemedText } from '@/components/themed-text';
import { Button, Segmented, TextField } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { SITE_URL } from '@/lib/legal';
import { goToMap } from '@/lib/go-to-map';
import { supabase } from '@/lib/supabase';

export default function SignInScreen() {
  const theme = useTheme();
  const router = useRouter();
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    setNotice(null);
    const creds = { email: email.trim(), password };
    const { data, error } =
      mode === 'in'
        ? await supabase.auth.signInWithPassword(creds)
        : // The confirmation link opens the Convoy web app (signed in), not the admin portal.
          await supabase.auth.signUp({ ...creds, options: { emailRedirectTo: Platform.OS === 'web' ? window.location.origin : SITE_URL } });
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    if (mode === 'up' && !data.session) {
      setNotice('Check your email to confirm your account, then sign in.');
      setMode('in');
      return;
    }
    // Signed in (or signed up with instant access): straight to the map. New accounts get the
    // profile setup on top of it from the root layout.
    goToMap(router);
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1, backgroundColor: theme.background }}>
      <ScrollView contentContainerStyle={{ padding: Spacing.four, gap: Spacing.three }} keyboardShouldPersistTaps="handled">
        <ThemedText type="subtitle">{mode === 'in' ? 'Welcome back' : 'Create account'}</ThemedText>
        <ThemedText themeColor="textSecondary">
          An account lets you add friends, share your location and join group drives. Trips and the speedometer work
          without one.
        </ThemedText>
        <Segmented
          options={[
            { value: 'in', label: 'Sign in' },
            { value: 'up', label: 'Sign up' },
          ]}
          value={mode}
          onChange={setMode}
        />
        <TextField
          label="Email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          textContentType="emailAddress"
        />
        <TextField
          label="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete={mode === 'in' ? 'current-password' : 'new-password'}
          textContentType={mode === 'in' ? 'password' : 'newPassword'}
          error={error}
        />
        {notice ? <ThemedText style={{ color: theme.success }}>{notice}</ThemedText> : null}
        <View style={{ marginTop: Spacing.two }}>
          <Button
            label={mode === 'in' ? 'Sign in' : 'Create account'}
            size="lg"
            loading={busy}
            disabled={!email.includes('@') || password.length < 8}
            onPress={submit}
          />
        </View>
        {mode === 'up' ? (
          <>
            <ThemedText type="small" themeColor="textSecondary">
              Passwords must be at least 8 characters.
            </ThemedText>
            <LegalLinks prefix="By creating an account you agree to the" style={{ textAlign: 'left' }} />
          </>
        ) : (
          <LegalLinks style={{ textAlign: 'left' }} />
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
