import { useEffect, useState } from 'react';
import { View, Text, Pressable, FlatList } from 'react-native';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/auth';

export default function Inbox() {
  const { staff } = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  const load = () => supabase.from('pending_actions').select('*').eq('assignee_id', staff?.id).neq('status', 'closed').order('due_at').then(({ data }) => setRows(data ?? []));
  useEffect(() => { if (staff) load(); }, [staff?.id]);
  const close = async (id: string) => {
    await supabase.from('pending_actions').update({ status: 'closed' }).eq('id', id);
    load();
  };
  return (
    <View style={{ flex: 1, padding: 16 }}>
      <FlatList data={rows} keyExtractor={(a) => a.id} renderItem={({ item }) => (
        <View style={{ backgroundColor: '#fff', padding: 14, borderRadius: 10, marginBottom: 8 }}>
          <Text style={{ fontWeight: '700' }}>{item.title}</Text>
          <Text style={{ color: '#64748b' }}>Due {new Date(item.due_at).toLocaleDateString()} · {item.status}</Text>
          <Pressable onPress={() => close(item.id)} style={{ marginTop: 8, backgroundColor: '#0b1f3a', borderRadius: 8, padding: 10, alignItems: 'center' }}>
            <Text style={{ color: '#fff', fontWeight: '700' }}>Close</Text>
          </Pressable>
        </View>
      )} ListEmptyComponent={<Text style={{ color: '#64748b' }}>Inbox zero. 🎉</Text>} />
    </View>
  );
}
