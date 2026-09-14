/* The crown jewel on mobile: sub-60s marking, big touch targets,
 * medical alerts with tap-to-call, taster section, offline-first sync. */
import { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, FlatList, Linking } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/auth';
import { cacheRegister, cachedRegister, enqueueAttendance, flushQueue } from '../../lib/sync';
import { createRegister, cycleAttendance, markAllPresent, undoLast, type AttendanceRecord, type RegisterState } from '@mentis/core';

interface Row { key: string; memberId: string; name: string; customer?: string; phone?: string; alert: boolean; taster?: boolean }

export default function Register() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { staff, userId, canDo } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [state, setState] = useState<RegisterState>(() => createRegister());
  const [filter, setFilter] = useState<'all' | 'alert' | 'taster' | 'unmarked'>('all');
  const [alertFor, setAlertFor] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [syncMsg, setSyncMsg] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const { data: enroll } = await supabase.from('enrollments')
          .select('id,member_id,members(id,name,special_needs_flag,customers(name,phone))')
          .eq('session_id', id).in('status', ['active', 'invited']).eq('expected', true);
        const list: Row[] = (enroll ?? []).map((e: any) => ({
          key: e.id, memberId: e.member_id, name: e.members?.name ?? '—',
          customer: e.members?.customers?.name, phone: e.members?.customers?.phone,
          alert: !!e.members?.special_needs_flag,
        }));
        const { data: tasters } = await supabase.from('prospects').select('id,name').eq('status', 'approved');
        for (const t of tasters ?? []) list.push({ key: `t-${t.id}`, memberId: '', name: t.name, alert: false, taster: true });
        setRows(list);
        await cacheRegister(id, list);
        seed(list);
      } catch {
        const cached = await cachedRegister<Row[]>(id);
        if (cached) { setRows(cached); seed(cached); setSyncMsg('Offline — showing cached register'); }
      }
    })();
    function seed(list: Row[]) {
      const records: AttendanceRecord[] = list.map((r) => ({
        id: r.key, sessionInstanceId: id, memberId: r.memberId || undefined,
        status: 'absent', recordedAt: new Date().toISOString(), recordedBy: staff?.id ?? '', offline: true,
      }));
      setState(createRegister(records));
    }
  }, [id]);

  const marked = useMemo(() => Object.values(state.records).filter((r) => r.status === 'present').length, [state]);
  const visible = rows.filter((r) => {
    if (filter === 'alert') return r.alert;
    if (filter === 'taster') return r.taster;
    if (filter === 'unmarked') return state.records[r.key]?.status !== 'present';
    return true;
  });

  const tap = (key: string) => {
    setState((s) => {
      const next = cycleAttendance(s, key);
      const op = next.queue[next.queue.length - 1];
      if (op) void enqueueAttendance(op.record);
      return next;
    });
  };
  const openAlert = async (memberId: string) => {
    setAlertFor(alertFor === memberId ? null : memberId);
    if (!notes[memberId]) {
      const { data } = await supabase.from('member_medical').select('notes').eq('member_id', memberId).single();
      if (data) setNotes((n) => ({ ...n, [memberId]: data.notes }));
      await supabase.from('audit_log').insert({
        organization_id: staff?.organization_id, actor_id: userId,
        action: 'medical.read', entity: 'member_medical', entity_id: memberId,
      });
    }
  };
  const save = async () => {
    setSyncMsg('Syncing…');
    const r = await flushQueue(userId ?? '');
    setSyncMsg(`Synced ${r.pushed}, failed ${r.failed}`);
  };

  return (
    <View style={{ flex: 1, padding: 12 }}>
      <Text style={{ fontSize: 20, fontWeight: '800' }}>{marked}/{rows.length} marked</Text>
      {!!syncMsg && <Text style={{ color: '#64748b' }}>{syncMsg}</Text>}
      <View style={{ flexDirection: 'row', gap: 6, marginVertical: 8 }}>
        {(['all', 'alert', 'taster', 'unmarked'] as const).map((f) => (
          <Pressable key={f} onPress={() => setFilter(f)}
            style={{ padding: 8, borderRadius: 8, backgroundColor: filter === f ? '#0b1f3a' : '#e2e8f0' }}>
            <Text style={{ color: filter === f ? '#fff' : '#0f172a', fontWeight: '700' }}>{f === 'alert' ? '⚠️' : f}</Text>
          </Pressable>
        ))}
      </View>
      <FlatList
        data={visible}
        keyExtractor={(r) => r.key}
        renderItem={({ item: r }) => {
          const present = state.records[r.key]?.status === 'present';
          return (
            <View>
              <Pressable onPress={() => canDo('attendance.mark') && tap(r.key)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, minHeight: 64,
                  backgroundColor: present ? '#dcfce7' : '#fff', borderRadius: 12, marginBottom: 6 }}>
                <Text style={{ fontSize: 24, fontWeight: '900' }}>{present ? '✓' : '○'}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: '700', fontSize: 16 }}>{r.alert ? '⚠️ ' : ''}{r.name}{r.taster ? '  ·  Taster' : ''}</Text>
                  {!!r.customer && <Text style={{ color: '#64748b' }}>{r.customer}{r.phone ? ` · ${r.phone}` : ''}</Text>}
                </View>
                {r.alert && <Pressable onPress={() => openAlert(r.memberId)} style={{ padding: 10 }}><Text style={{ fontWeight: '800' }}>Alert</Text></Pressable>}
                {!!r.phone && <Pressable onPress={() => Linking.openURL(`tel:${r.phone}`)} style={{ padding: 10 }}><Text style={{ fontWeight: '800' }}>Call</Text></Pressable>}
              </Pressable>
              {alertFor === r.memberId && (
                <View style={{ backgroundColor: '#fee2e2', padding: 12, borderRadius: 8, marginBottom: 6 }}>
                  <Text><Text style={{ fontWeight: '800' }}>Medical: </Text>{notes[r.memberId] ?? 'Loading… (access audit-logged)'}</Text>
                </View>
              )}
            </View>
          );
        }}
      />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Pressable onPress={() => setState((s) => undoLast(s))} style={{ flex: 1, padding: 14, backgroundColor: '#e2e8f0', borderRadius: 10, alignItems: 'center' }}>
          <Text style={{ fontWeight: '700' }}>Undo</Text>
        </Pressable>
        <Pressable onPress={() => setState((s) => markAllPresent(s, rows.map((r) => r.key)))} style={{ flex: 1, padding: 14, backgroundColor: '#e2e8f0', borderRadius: 10, alignItems: 'center' }}>
          <Text style={{ fontWeight: '700' }}>All present</Text>
        </Pressable>
        <Pressable onPress={save} style={{ flex: 1, padding: 14, backgroundColor: '#0b1f3a', borderRadius: 10, alignItems: 'center' }}>
          <Text style={{ fontWeight: '700', color: '#fff' }}>Save</Text>
        </Pressable>
      </View>
    </View>
  );
}
