import { Stack, useRouter, useSegments } from 'expo-router';
import { useEffect } from 'react';
import { View, Text, Pressable } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider, useAuth } from '../lib/auth';
import { LockProvider, useLock } from '../lib/lock';

function Gate({ children }: { children: React.ReactNode }) {
  const { userId, staff, loading } = useAuth();
  const { locked, unlock } = useLock();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    const inLogin = segments[0] === 'login';
    if (!userId && !inLogin) router.replace('/login');
    else if (userId && inLogin) router.replace('/(tabs)/today');
  }, [userId, loading, segments]);

  if (loading) return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><Text>Loading…</Text></View>;
  if (userId && staff && locked) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, backgroundColor: '#0b1f3a' }}>
        <Text style={{ color: '#fff', fontSize: 28, fontWeight: '900' }}>Mentis</Text>
        <Pressable onPress={unlock} style={{ backgroundColor: '#14b8a6', padding: 14, borderRadius: 10 }}>
          <Text style={{ fontWeight: '700' }}>Unlock with biometrics / PIN</Text>
        </Pressable>
      </View>
    );
  }
  return <>{children}</>;
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <LockProvider>
        <Gate>
          <StatusBar style="auto" />
          <Stack screenOptions={{ headerShown: false }} />
        </Gate>
      </LockProvider>
    </AuthProvider>
  );
}
