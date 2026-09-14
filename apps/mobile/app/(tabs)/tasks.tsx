import { useEffect, useState } from 'react';
import { View, Text, Pressable, FlatList, TextInput } from 'react-native';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/auth';

export default function Tasks() {
  const { staff } = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  const [title, setTitle] = useState('');
  const load = () => supabase.from('tasks').select('*').eq('assignee_id', staff?.id).neq('status', 'done').then(({ data }) => setRows(data ?? []));
  useEffect(() => { if (staff) load(); }, [staff?.id]);
  const create = async () => {
    if (!title.trim()) return;
    await supabase.from('tasks').insert({ organization_id: staff?.organization_id, title, task_type: 'other', assignee_id: staff?.id, created_by: staff?.user_id });
    setTitle(''); load();
  };
  const done = async (id: string) => {
    await supabase.from('tasks').update({ status: 'done' }).eq('id', id);
    load();
  };
  return (
    <View style={{ flex: 1, padding: 16 }}>
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
        <TextInput value={title} onChangeText={setTitle} placeholder="New task…" style={{ flex: 1, backgroundColor: '#fff', borderRadius: 8, padding: 12 }} />
        <Pressable onPress={create} style={{ backgroundColor: '#0b1f3a', borderRadius: 8, padding: 12 }}><Text style={{ color: '#fff', fontWeight: '700' }}>Add</Text></Pressable>
      </View>
      <FlatList data={rows} keyExtractor={(t) => t.id} renderItem={({ item }) => (
        <View style={{ backgroundColor: '#fff', padding: 14, borderRadius: 10, marginBottom: 8, flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text style={{ fontWeight: '600', flex: 1 }}>{item.title}</Text>
          <Pressable onPress={() => done(item.id)}><Text style={{ fontWeight: '800', color: '#0b1f3a' }}>Done</Text></Pressable>
        </View>
      )} />
    </View>
  );
}
