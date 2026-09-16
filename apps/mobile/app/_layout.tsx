/**
 * Root layout — providers, navigation transitions and the lock gate.
 *
 * Redesign notes
 *  • GestureHandlerRootView wraps everything (swipe actions require it)
 *  • ThemeProvider owns light/dark and hands the resolved palette to every screen
 *  • the biometric lock is now a designed screen with the same brand treatment as
 *    the web login, instead of a bare button on a navy background
 *  • navigation transitions come from the shared motion tokens
 *    (slide on push, fade for tabs, bottom sheet for the register)
 */
import { Stack } from 'expo-router';
import { useRouter, useSegments } from 'expo-router';
import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';
import { Fingerprint, Lock } from 'lucide-react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { AuthProvider, useAuth } from '../lib/auth';
import { LockProvider, useLock } from '../lib/lock';
import { ThemeProvider, useTheme } from '../lib/theme';
import { haptics } from '../lib/haptics';
import { Button, Text } from '../components/ui';
import { AuroraBackdrop } from '../components/ui/surface';

function Gate({ children }: { children: React.ReactNode }) {
  const { userId, staff, loading } = useAuth();
  const { locked, unlock } = useLock();
  const segments = useSegments();
  const router = useRouter();
  const { colors } = useTheme();

  useEffect(() => {
    if (loading) return;
    const inLogin = segments[0] === 'login';
    if (!userId && !inLogin) router.replace('/login');
    else if (userId && inLogin) router.replace('/(tabs)/today');
  }, [userId, loading, segments, router]);

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.bg }]}>
        <AuroraBackdrop />
        <Animated.View entering={FadeIn.duration(240)} style={[styles.mark, { backgroundColor: colors.brand }]} />
        <Text variant="overline" tone="faint" style={{ marginTop: 14 }}>
          Mentis
        </Text>
      </View>
    );
  }

  if (userId && staff && locked) {
    return (
      <View style={[styles.center, { backgroundColor: colors.bg, paddingHorizontal: 28 }]}>
        <AuroraBackdrop />
        <Animated.View entering={FadeInDown.duration(400)} style={{ alignItems: 'center' }}>
          <View style={[styles.lockBadge, { backgroundColor: colors.brandSoft }]}>
            <Lock size={26} color={colors.brandText} />
          </View>
          <Text variant="title" style={{ marginTop: 18 }}>
            Locked
          </Text>
          <Text variant="caption" tone="muted" style={{ textAlign: 'center', marginTop: 6, maxWidth: 280 }}>
            {staff.display_name}, unlock Mentis to see today’s registers. Member medical notes stay behind this screen.
          </Text>
          <Button
            label="Unlock"
            intent="primary"
            size="lg"
            iconLeft={<Fingerprint size={18} color={colors.brandInk} />}
            style={{ marginTop: 24, paddingHorizontal: 28 }}
            onPress={() => {
              haptics.success();
              void unlock();
            }}
          />
          <Pressable
            onPress={() => void unlock()}
            style={{ marginTop: 14, padding: 8 }}
            accessibilityRole="button"
            accessibilityLabel="Use device passcode instead"
          >
            <Text variant="caption" tone="muted">
              Use passcode instead
            </Text>
          </Pressable>
        </Animated.View>
      </View>
    );
  }

  return <>{children}</>;
}

/** The navigator itself, inside the providers so it can read the palette. */
function RootNavigator() {
  const { colors, isDark } = useTheme();
  return (
    <>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.bg },
          animation: 'slide_from_right',
          animationDuration: 260,
        }}
      >
        <Stack.Screen name="(tabs)" options={{ animation: 'fade' }} />
        <Stack.Screen name="login" options={{ animation: 'fade' }} />
        <Stack.Screen name="register/[id]" options={{ animation: 'slide_from_bottom', presentation: 'modal' }} />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider>
        <AuthProvider>
          <LockProvider>
            <Gate>
              <RootNavigator />
            </Gate>
          </LockProvider>
        </AuthProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  mark: { width: 46, height: 46, borderRadius: 15 },
  lockBadge: { width: 64, height: 64, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
});
