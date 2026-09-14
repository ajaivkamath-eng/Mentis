import { View, Text, Pressable } from 'react-native';
import { useAuth } from '../../lib/auth';
import { switchableRoles } from '@mentis/core';

export default function More() {
  const { staff, roles, role, setRole, signOut } = useAuth();
  return (
    <View style={{ flex: 1, padding: 16, gap: 12 }}>
      <Text style={{ fontSize: 20, fontWeight: '800' }}>{staff?.display_name}</Text>
      <Text style={{ color: '#64748b' }}>Active role: {role}</Text>
      {switchableRoles(roles).map((r) => (
        <Pressable key={r} onPress={() => setRole(r)}
          style={{ padding: 14, borderRadius: 10, backgroundColor: r === role ? '#0b1f3a' : '#e2e8f0' }}>
          <Text style={{ fontWeight: '700', color: r === role ? '#fff' : '#0f172a' }}>{r}</Text>
        </Pressable>
      ))}
      <Pressable onPress={signOut} style={{ padding: 14, borderRadius: 10, backgroundColor: '#fee2e2' }}>
        <Text style={{ fontWeight: '700' }}>Sign out</Text>
      </Pressable>
    </View>
  );
}
