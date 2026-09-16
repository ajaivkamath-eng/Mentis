/**
 * Register — the crown jewel: sub-60-second attendance marking.
 *
 * Design decisions that make the 60-second target achievable:
 *  • one tap marks present (big target, colour + haptic + animated tick in the
 *    same frame) — no confirm dialog, because Undo is always one tap away
 *  • the header ring shows progress, so a coach knows when to stop looking
 *  • filters carry counts, so "who is left?" is a single tap
 *  • swipe right marks present, swipe left calls the guardian
 *  • medical alerts expand inline (tap-to-call) and every read is audit-logged
 *  • offline is a first-class state: the register renders from SQLite cache and
 *    marks queue locally with a visible pending count
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Animated, { FadeIn, LinearTransition } from 'react-native-reanimated';
import { ChevronLeft, Phone, Save, TriangleAlert, Undo2, UserCheck, Users } from 'lucide-react-native';
import {
  createRegister,
  cycleAttendance,
  markAllPresent,
  undoLast,
  type AttendanceRecord,
  type RegisterState,
} from '@mentis/core';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/auth';
import { cacheRegister, cachedRegister, enqueueAttendance, flushQueue } from '../../lib/sync';
import { haptics } from '../../lib/haptics';
import { r, s, useTheme } from '../../lib/theme';
import { enterUp } from '../../lib/motion';
import {
  AnimatedCheck,
  Button,
  CapacityMeter,
  Card,
  FeedbackBanner,
  ProgressRing,
  Screen,
  SegmentedControl,
  SkeletonList,
  SwipeRow,
  Text,
} from '../../components/ui';

interface Row {
  key: string;
  memberId: string;
  name: string;
  customer?: string;
  phone?: string;
  alert: boolean;
  taster?: boolean;
}

type Filter = 'all' | 'alert' | 'taster' | 'unmarked';

export default function Register() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { staff, userId, canDo } = useAuth();
  const { colors } = useTheme();

  const [rows, setRows] = useState<Row[]>([]);
  const [state, setState] = useState<RegisterState>(() => createRegister());
  const [filter, setFilter] = useState<Filter>('all');
  const [alertFor, setAlertFor] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<{ message: string; detail?: string; tone: 'info' | 'warning' | 'success' | 'danger' } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { data: enroll } = await supabase
          .from('enrollments')
          .select('id,member_id,members(id,name,special_needs_flag,customers(name,phone))')
          .eq('session_id', id)
          .in('status', ['active', 'invited'])
          .eq('expected', true);

        const list: Row[] = (enroll ?? []).map((e: any) => ({
          key: e.id,
          memberId: e.member_id,
          name: e.members?.name ?? '—',
          customer: e.members?.customers?.name,
          phone: e.members?.customers?.phone,
          alert: !!e.members?.special_needs_flag,
        }));

        const { data: tasters } = await supabase.from('prospects').select('id,name').eq('status', 'approved');
        for (const t of tasters ?? []) list.push({ key: `t-${t.id}`, memberId: '', name: t.name, alert: false, taster: true });

        setRows(list);
        await cacheRegister(id, list);
        seed(list);
      } catch {
        const cached = await cachedRegister<Row[]>(id);
        if (cached) {
          setRows(cached);
          seed(cached);
          setBanner({ message: 'Working offline', detail: 'Showing the last synced register. Marks queue on this device.', tone: 'warning' });
        }
      } finally {
        setLoading(false);
      }

      function seed(list: Row[]) {
        const records: AttendanceRecord[] = list.map((row) => ({
          id: row.key,
          sessionInstanceId: id,
          memberId: row.memberId || undefined,
          status: 'absent',
          recordedAt: new Date().toISOString(),
          recordedBy: staff?.id ?? '',
          offline: true,
        }));
        setState(createRegister(records));
      }
    })();
  }, [id, staff?.id]);

  const marked = useMemo(() => Object.values(state.records).filter((rec) => rec.status === 'present').length, [state]);
  const pending = state.queue.length;

  const counts = useMemo(
    () => ({
      all: rows.length,
      alert: rows.filter((row) => row.alert).length,
      taster: rows.filter((row) => row.taster).length,
      unmarked: rows.filter((row) => state.records[row.key]?.status !== 'present').length,
    }),
    [rows, state],
  );

  const visible = useMemo(
    () =>
      rows.filter((row) => {
        if (filter === 'alert') return row.alert;
        if (filter === 'taster') return row.taster;
        if (filter === 'unmarked') return state.records[row.key]?.status !== 'present';
        return true;
      }),
    [rows, state, filter],
  );

  const tap = useCallback(
    (key: string) => {
      if (!canDo('attendance.mark')) return;
      setState((current) => {
        const next = cycleAttendance(current, key);
        const op = next.queue[next.queue.length - 1];
        const nowPresent = next.records[key]?.status === 'present';
        if (nowPresent) haptics.tap();
        else haptics.select();
        if (op) void enqueueAttendance(op.record);
        return next;
      });
    },
    [canDo],
  );

  const openAlert = useCallback(
    async (memberId: string) => {
      setAlertFor((current) => (current === memberId ? null : memberId));
      haptics.warning();
      if (!notes[memberId]) {
        const { data } = await supabase.from('member_medical').select('notes').eq('member_id', memberId).single();
        if (data) setNotes((prev) => ({ ...prev, [memberId]: data.notes }));
        // Reading medical notes is an auditable event, not a background fetch.
        await supabase.from('audit_log').insert({
          organization_id: staff?.organization_id,
          actor_id: userId,
          action: 'medical.read',
          entity: 'member_medical',
          entity_id: memberId,
        });
      }
    },
    [notes, staff?.organization_id, userId],
  );

  const save = useCallback(async () => {
    setSaving(true);
    setBanner({ message: 'Syncing…', detail: `${pending} mark${pending === 1 ? '' : 's'} queued`, tone: 'info' });
    const result = await flushQueue(userId ?? '');
    setSaving(false);
    if (result.failed > 0) {
      haptics.warning();
      setBanner({ message: `Synced ${result.pushed}, ${result.failed} still queued`, detail: 'They will retry automatically.', tone: 'warning' });
    } else {
      haptics.success();
      setBanner({ message: 'Register saved', detail: `${marked} of ${rows.length} marked present`, tone: 'success' });
    }
  }, [pending, rows.length, marked, userId]);

  const sessionTitle = rows.length ? `Register · ${rows.length} expected` : 'Register';

  return (
    <Screen
      title={sessionTitle}
      subtitle="Attendance"
      scroll
      contentStyle={{ paddingBottom: s[20] }}
      right={
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Close register" hitSlop={10} style={styles.back}>
          <ChevronLeft size={22} color={colors.inkMuted} />
        </Pressable>
      }
      footer={
        <View style={[styles.footer, { backgroundColor: colors.surfaceRaised, borderTopColor: colors.border }]}>
          <Button
            label="Undo"
            intent="secondary"
            iconLeft={<Undo2 size={16} color={colors.ink} />}
            haptic={false}
            onPress={() => {
              setState((current) => undoLast(current));
              haptics.select();
            }}
            style={{ flex: 1 }}
          />
          <Button
            label="All present"
            intent="soft"
            iconLeft={<UserCheck size={16} color={colors.brandText} />}
            haptic={false}
            onPress={() => {
              setState((current) => markAllPresent(current, rows.map((row) => row.key)));
              haptics.success();
              setBanner({ message: 'Everyone marked present', detail: 'Tap a name to correct anyone.', tone: 'success' });
            }}
            style={{ flex: 1.2 }}
          />
          <Button
            label={pending > 0 ? `Save ${pending}` : 'Save'}
            intent="primary"
            loading={saving}
            iconLeft={<Save size={16} color={colors.brandInk} />}
            onPress={save}
            style={{ flex: 1 }}
          />
        </View>
      }
    >
      {banner ? (
        <FeedbackBanner message={banner.message} detail={banner.detail} tone={banner.tone} onDismiss={() => setBanner(null)} />
      ) : null}

      {/* Progress header */}
      <View style={{ paddingHorizontal: s[4], marginBottom: s[3] }}>
        <Card padded style={{ flexDirection: 'row', alignItems: 'center', gap: s[4] }}>
          <ProgressRing
            value={marked}
            max={Math.max(rows.length, 1)}
            size={64}
            strokeWidth={6}
            tone={marked === rows.length && rows.length > 0 ? 'success' : 'brand'}
            label={`${marked}`}
          />
          <View style={{ flex: 1 }}>
            <Text variant="heading">
              {marked} of {rows.length} marked
            </Text>
            <Text variant="caption" tone="muted" style={{ marginTop: 2 }}>
              {pending > 0 ? `${pending} mark${pending === 1 ? '' : 's'} waiting to sync` : 'Everything synced'}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: s[2], marginTop: s[2] }}>
              {counts.alert > 0 ? (
                <View style={[styles.flag, { backgroundColor: colors.dangerSoft }]}>
                  <TriangleAlert size={12} color={colors.danger} />
                  <Text variant="overline" style={{ color: colors.danger, letterSpacing: 0.3 }}>
                    {counts.alert} medical
                  </Text>
                </View>
              ) : null}
              {counts.taster > 0 ? (
                <View style={[styles.flag, { backgroundColor: colors.accentSoft }]}>
                  <Text variant="overline" style={{ color: colors.accent, letterSpacing: 0.3 }}>
                    {counts.taster} taster
                  </Text>
                </View>
              ) : null}
            </View>
          </View>
        </Card>
      </View>

      <View style={{ paddingHorizontal: s[4], marginBottom: s[3] }}>
        <SegmentedControl
          size="sm"
          value={filter}
          onChange={setFilter}
          segments={[
            { value: 'all', label: 'All', count: counts.all },
            { value: 'unmarked', label: 'Left', count: counts.unmarked },
            { value: 'alert', label: 'Medical', count: counts.alert },
            { value: 'taster', label: 'Taster', count: counts.taster },
          ]}
        />
      </View>

      {loading ? (
        <SkeletonList rows={6} />
      ) : visible.length === 0 ? (
        <View style={{ paddingHorizontal: s[4] }}>
          <Card padded>
            <Text variant="subtitle">{filter === 'unmarked' ? 'Everyone is marked' : 'Nothing in this view'}</Text>
            <Text variant="caption" tone="muted" style={{ marginTop: 4 }}>
              {filter === 'unmarked'
                ? 'Nice — the register is complete. Save to push the marks to the console.'
                : 'Try another filter, or pull the register again when enrolments change.'}
            </Text>
            <Button label="Show everyone" intent="ghost" size="sm" style={{ marginTop: s[3] }} onPress={() => setFilter('all')} />
          </Card>
        </View>
      ) : (
        <View style={{ paddingHorizontal: s[4], gap: s[2] }}>
          {visible.map((row, index) => {
            const present = state.records[row.key]?.status === 'present';
            const expanded = alertFor === row.memberId;
            return (
              <Animated.View key={row.key} entering={enterUp(index)} layout={LinearTransition.duration(180)}>
                <SwipeRow
                  onPress={() => tap(row.key)}
                  accessibilityLabel={`${row.name}${present ? ', marked present' : ', not marked'}`}
                  leading={{
                    label: present ? 'Unmark' : 'Present',
                    tone: present ? 'warning' : 'success',
                    icon: <UserCheck size={18} color="#fff" />,
                    onTrigger: () => tap(row.key),
                  }}
                  trailing={
                    row.phone
                      ? {
                          label: 'Call',
                          tone: 'brand',
                          icon: <Phone size={18} color="#fff" />,
                          onTrigger: () => void Linking.openURL(`tel:${row.phone}`),
                        }
                      : undefined
                  }
                  style={{ borderRadius: r.lg, overflow: 'hidden' }}
                >
                  <Pressable
                    onPress={() => tap(row.key)}
                    style={[
                      styles.row,
                      {
                        backgroundColor: present ? colors.successSoft : colors.surface,
                        borderColor: present ? 'transparent' : colors.border,
                      },
                    ]}
                    accessibilityRole="button"
                    accessibilityState={{ checked: present }}
                  >
                    <AnimatedCheck checked={present} />
                    <View style={{ flex: 1, marginLeft: s[3] }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: s[2] }}>
                        <Text variant="bodyStrong" numberOfLines={1} style={{ flexShrink: 1 }}>
                          {row.name}
                        </Text>
                        {row.taster ? (
                          <View style={[styles.flag, { backgroundColor: colors.accentSoft }]}>
                            <Text variant="overline" style={{ color: colors.accent, letterSpacing: 0.3 }}>
                              Taster
                            </Text>
                          </View>
                        ) : null}
                      </View>
                      <Text variant="caption" tone="muted" numberOfLines={1} style={{ marginTop: 1 }}>
                        {row.customer ?? 'No guardian on file'}
                        {row.phone ? ` · ${row.phone}` : ''}
                      </Text>
                    </View>

                    {row.alert ? (
                      <Pressable
                        onPress={() => void openAlert(row.memberId)}
                        hitSlop={8}
                        accessibilityRole="button"
                        accessibilityLabel={`Medical note for ${row.name}`}
                        accessibilityHint="Reads the note and writes an audit entry"
                        style={[styles.alertButton, { backgroundColor: colors.dangerSoft }]}
                      >
                        <TriangleAlert size={16} color={colors.danger} />
                      </Pressable>
                    ) : null}
                  </Pressable>
                </SwipeRow>

                {expanded ? (
                  <Animated.View entering={FadeIn.duration(200)} style={{ marginTop: s[2] }}>
                    <Card variant="default" padded style={{ borderColor: colors.danger, backgroundColor: colors.dangerSoft }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: s[2] }}>
                        <TriangleAlert size={15} color={colors.danger} />
                        <Text variant="overline" style={{ color: colors.danger, letterSpacing: 0.5 }}>
                          Medical · access logged
                        </Text>
                      </View>
                      <Text variant="body" style={{ marginTop: s[2], color: colors.ink }}>
                        {notes[row.memberId] ?? 'Loading…'}
                      </Text>
                      {row.phone ? (
                        <Button
                          label="Call guardian"
                          intent="danger"
                          size="sm"
                          iconLeft={<Phone size={14} color={colors.danger} />}
                          style={{ marginTop: s[3], alignSelf: 'flex-start' }}
                          onPress={() => void Linking.openURL(`tel:${row.phone}`)}
                        />
                      ) : null}
                    </Card>
                  </Animated.View>
                ) : null}
              </Animated.View>
            );
          })}
        </View>
      )}

      <View style={{ paddingHorizontal: s[4], marginTop: s[4] }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: s[2], justifyContent: 'center' }}>
          <Users size={14} color={colors.inkFaint} />
          <Text variant="caption" tone="faint">
            Tap to mark · swipe for quick actions
          </Text>
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  back: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 64,
    paddingHorizontal: s[3],
    paddingVertical: s[2],
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderRadius: r.lg,
  },
  flag: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: s[2], paddingVertical: 3, borderRadius: r.full },
  alertButton: { width: 38, height: 38, borderRadius: r.md, alignItems: 'center', justifyContent: 'center', marginLeft: s[2] },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    gap: s[2],
    padding: s[3],
    paddingBottom: s[6],
    borderTopWidth: StyleSheet.hairlineWidth * 2,
  },
});
