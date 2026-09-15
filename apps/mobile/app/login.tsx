import { useState } from 'react';
import { View, Text, TextInput, Pressable } from 'react-native';
import { supabase } from '../lib/supabase';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const go = async () => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    setErr(error?.message ?? '');
    if (!error && data.user) {
      // Register this install for session oversight (Devices page can revoke).
      const { data: dev } = await supabase.from('mentis_devices').select('id')
        .eq('user_id', data.user.id).eq('label', 'Mentis mobile').eq('revoked', false).limit(1);
      if (!dev?.length) {
        await supabase.from('mentis_devices').insert({ user_id: data.user.id, label: 'Mentis mobile', last_seen: new Date().toISOString() });
      } else {
        await supabase.from('mentis_devices').update({ last_seen: new Date().toISOString() }).eq('id', dev[0].id);
      }
    }
  };
  return (
    <View style={{ flex: 1, justifyContent: 'center', padding: 24, backgroundColor: '#0b1f3a' }}>
      <Text style={{ color: '#fff', fontSize: 32, fontWeight: '900' }}>Mentis</Text>
      <Text style={{ color: '#94a3b8', marginBottom: 16 }}>Kingfisher TTC — sign in with your Rally account</Text>
      <TextInput value={email} onChangeText={setEmail} placeholder="Email" autoCapitalize="none"
        style={{ backgroundColor: '#fff', borderRadius: 8, padding: 12, marginBottom: 8 }} />
      <TextInput value={password} onChangeText={setPassword} placeholder="Password" secureTextEntry
        style={{ backgroundColor: '#fff', borderRadius: 8, padding: 12, marginBottom: 8 }} />
      {!!err && <Text style={{ color: '#f87171', marginBottom: 8 }}>{err}</Text>}
      <Pressable onPress={go} style={{ backgroundColor: '#14b8a6', borderRadius: 8, padding: 14, alignItems: 'center' }}>
        <Text style={{ fontWeight: '700' }}>Sign in</Text>
      </Pressable>
    </View>
  );
}
