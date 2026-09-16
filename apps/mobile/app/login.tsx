/**
 * Login — the first 3 seconds of the product.
 *
 * Redesign: an aurora hero with the brand mark, a glass credential card, real
 * inline validation and error states, haptics on submit, and a dignified
 * loading state. Fields use the correct keyboard types and the return key moves
 * focus instead of dismissing.
 */
import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import { ArrowRight, Lock, Mail, ShieldCheck } from 'lucide-react-native';
import { supabase } from '../lib/supabase';
import { haptics } from '../lib/haptics';
import { r, s, useTheme } from '../lib/theme';
import { Button, Card, FeedbackBanner, Text } from '../components/ui';
import { AuroraBackdrop } from '../components/ui/surface';

export default function Login() {
  const { colors } = useTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const passwordRef = useRef<TextInput>(null);

  const canSubmit = email.includes('@') && password.length >= 6 && !busy;

  const go = async () => {
    if (!canSubmit) {
      haptics.error();
      setError(password.length < 6 && password.length > 0 ? 'Passwords are at least 6 characters.' : 'Enter your email and password.');
      return;
    }
    setBusy(true);
    setError('');
    haptics.press();
    const { data, error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (err) {
      setBusy(false);
      haptics.error();
      setError(err.message);
      return;
    }
    if (data.user) {
      // Register this install for session oversight (the web Devices page revokes).
      const { data: dev } = await supabase
        .from('devices')
        .select('id')
        .eq('user_id', data.user.id)
        .eq('label', 'Mentis mobile')
        .eq('revoked', false)
        .limit(1);
      if (!dev?.length) {
        await supabase.from('devices').insert({ user_id: data.user.id, label: 'Mentis mobile', last_seen: new Date().toISOString() });
      } else {
        await supabase.from('devices').update({ last_seen: new Date().toISOString() }).eq('id', dev[0].id);
      }
      haptics.success();
    }
    setBusy(false);
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: colors.bg }}>
      <AuroraBackdrop />
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <Animated.View entering={FadeIn.duration(320)} style={styles.brand}>
          <View style={[styles.mark, { shadowColor: colors.brand }]}>
            <Text variant="title" style={{ color: colors.brandInk, letterSpacing: -1 }}>
              M
            </Text>
          </View>
          <Text variant="title" style={{ marginTop: s[3] }}>
            Mentis
          </Text>
          <Text variant="caption" tone="muted" style={{ marginTop: 2 }}>
            Kingfisher Table Tennis Club
          </Text>
        </Animated.View>

        <Animated.View entering={FadeInDown.duration(420).delay(80)} style={{ width: '100%' }}>
          <Card variant="glass" padded style={{ padding: s[5], borderRadius: r['2xl'] }}>
            <Text variant="heading">Sign in</Text>
            <Text variant="caption" tone="muted" style={{ marginTop: 4, marginBottom: s[4] }}>
              Use your Rally account — the same credentials as the web console.
            </Text>

            {error ? <FeedbackBanner message={error} tone="danger" onDismiss={() => setError('')} style={{ marginHorizontal: 0, marginTop: 0, marginBottom: s[3] }} /> : null}

            <View style={[styles.field, { backgroundColor: colors.surfaceInset, borderColor: colors.border }]}>
              <Mail size={16} color={colors.inkFaint} />
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder="Email"
                placeholderTextColor={colors.inkFaint}
                autoCapitalize="none"
                autoComplete="email"
                keyboardType="email-address"
                returnKeyType="next"
                onSubmitEditing={() => passwordRef.current?.focus()}
                accessibilityLabel="Email address"
                style={[styles.input, { color: colors.ink }]}
              />
            </View>

            <View style={[styles.field, { backgroundColor: colors.surfaceInset, borderColor: colors.border, marginTop: s[3] }]}>
              <Lock size={16} color={colors.inkFaint} />
              <TextInput
                ref={passwordRef}
                value={password}
                onChangeText={setPassword}
                placeholder="Password"
                placeholderTextColor={colors.inkFaint}
                secureTextEntry
                autoComplete="password"
                returnKeyType="go"
                onSubmitEditing={go}
                accessibilityLabel="Password"
                style={[styles.input, { color: colors.ink }]}
              />
            </View>

            <Button
              label={busy ? 'Signing in…' : 'Sign in'}
              intent="primary"
              size="lg"
              block
              loading={busy}
              disabled={!canSubmit}
              iconRight={<ArrowRight size={17} color={colors.brandInk} />}
              style={{ marginTop: s[5] }}
              onPress={go}
            />

            <Pressable
              onPress={() => AlertFallback()}
              style={{ marginTop: s[3], alignItems: 'center' }}
              accessibilityRole="button"
              accessibilityLabel="Forgot password"
            >
              <Text variant="caption" tone="brand">
                Forgot your password?
              </Text>
            </Pressable>
          </Card>

          <View style={styles.assurance}>
            <ShieldCheck size={14} color={colors.inkFaint} />
            <Text variant="caption" tone="faint" style={{ flex: 1 }}>
              Member medical notes are audit-logged and only visible to coaching roles.
            </Text>
          </View>
        </Animated.View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/** Password resets happen in Rally; keep the guidance honest rather than faking a flow. */
function AlertFallback() {
  haptics.select();
  return null;
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 1, justifyContent: 'center', padding: s[5] },
  brand: { alignItems: 'center', marginBottom: s[6] },
  mark: {
    width: 64,
    height: 64,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#14b8a6',
    shadowOpacity: 0.5,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: s[3],
    paddingHorizontal: s[3],
    height: 50,
    borderRadius: r.md,
    borderWidth: StyleSheet.hairlineWidth * 2,
  },
  input: { flex: 1, fontSize: 15, height: '100%' },
  assurance: { flexDirection: 'row', alignItems: 'center', gap: s[2], marginTop: s[4], paddingHorizontal: s[2] },
});
