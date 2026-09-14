import { useEffect, useState } from 'react';
import { View, Text, Pressable, FlatList } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/auth';

export default function Today() {
  const { staff } = useAuth();
  const router = useRouter();
  const [sessions, setSessions] = useState<any[]>([]);
  useEffect(() => {
    const day = new Date().toISOString().slice(0, 10);
    supabase.from('sessions').select('id,name,start_at,venues(name)')
      .gte('start_at', `${day}T00:00:00Z`).lte('start_at', `${day}T23:59:59Z`).order('start_at')
      .then(({ data }) => setSessions(data ?? []));
  }, []);
  return (
    <View style={{ flex: 1, padding: 16 }}>
      <Text style={{ fontSize: 22, fontWeight: '800', marginBottom: 4 }}>Today</Text>
      <Text style={{ color: '#64748b', marginBottom: 12 }}>{staff?.display_name} · {staff?.roles.join(', ')}</Text>
      <FlatList
        data={sessions}
        keyExtractor={(s) => s.id}
        renderItem={({ item }) => (
          <Pressable onPress={() => router.push(`/register/${item.id}`)}
            style={{ backgroundColor: '#fff', padding: 16, borderRadius: 12, marginBottom: 8 }}>
            <Text style={{ fontWeight: '700', fontSize: 16 }}>{item.name}</Text>
            <Text style={{ color: '#64748b' }}>{new Date(item.start_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · {item.venues?.name}</Text>
            <Text style={{ color: '#0b1f3a', fontWeight: '700', marginTop: 4 }}>Open register →</Text>
          </Pressable>
        )}
        ListEmptyComponent={<Text style={{ color: '#64748b' }}>No sessions today.</Text>}
      />
    </View>
  );
}
