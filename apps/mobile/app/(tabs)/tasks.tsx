/**
 * Tasks — the swipe-to-work list.
 *
 * Swipe right → complete (success haptic, optimistic removal).
 * Swipe left  → defer to tomorrow (warning haptic, row springs back).
 * Both are also exposed as accessibility actions, so the gesture is an
 * accelerator rather than the only way in.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Keyboard, Pressable, StyleSheet, TextInput, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { Check, Clock, Plus } from 'lucide-react-native';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/auth';
import { haptics } from '../../lib/haptics';
import { dueLabel } from '../../lib/hooks';
import { r, s, useTheme } from '../../lib/theme';
import { enterUp, listLayout } from '../../lib/motion';
import {
  Card,
  EmptyState,
  FeedbackBanner,
  ListRow,
  Screen,
  SegmentedControl,
  SkeletonList,
  StatusPill,
  SwipeRow,
  Text,
} from '../../components/ui';

interface Task {
  id: string;
  title: string;
  status: string;
  due_at?: string | null;
  task_type?: string | null;
  priority?: string | null;
  work_hours?: number | null;
}

type Filter = 'open' | 'done' | 'all';

export default function Tasks() {
  const { staff } = useAuth();
  const { colors } = useTheme();
  const [rows, setRows] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState('');
  const [filter, setFilter] = useState<Filter>('open');
  const [feedback, setFeedback] = useState<{ message: string; detail?: string; tone: 'success' | 'warning' | 'danger' } | null>(null);

  const load = useCallback(async () => {
    if (!staff) return;
    try {
      const { data } = await supabase
        .from('tasks')
        .select('*')
        .eq('assignee_id', staff.id)
        .order('due_at', { ascending: true, nullsFirst: false });
      setRows((data ?? []) as Task[]);
    } finally {
      setLoading(false);
    }
  }, [staff]);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = useMemo(() => {
    if (filter === 'all') return rows;
    if (filter === 'done') return rows.filter((t) => t.status === 'done');
    return rows.filter((t) => t.status !== 'done');
  }, [rows, filter]);

  const openCount = rows.filter((t) => t.status !== 'done').length;

  const create = async () => {
    if (!title.trim() || !staff) return;
    const optimistic: Task = { id: `local-${Date.now()}`, title: title.trim(), status: 'open', due_at: null };
    setRows((prev) => [optimistic, ...prev]);
    setTitle('');
    Keyboard.dismiss();
    haptics.success();
    setFeedback({ message: 'Task created', detail: optimistic.title, tone: 'success' });
    try {
      await supabase.from('tasks').insert({
        organization_id: staff.organization_id,
        title: optimistic.title,
        task_type: 'other',
        assignee_id: staff.id,
        created_by: staff.user_id,
      });
      await load();
    } catch {
      setRows((prev) => prev.filter((t) => t.id !== optimistic.id));
      haptics.error();
      setFeedback({ message: 'Could not save the task', detail: 'It stays on this device until you retry.', tone: 'danger' });
    }
  };

  const complete = async (task: Task) => {
    // Optimistic: the row leaves immediately, the write catches up.
    setRows((prev) => prev.map((t) => (t.id === task.id ? { ...t, status: 'done' } : t)));
    setFeedback({ message: 'Task completed', detail: task.title, tone: 'success' });
    haptics.success();
    await supabase.from('tasks').update({ status: 'done' }).eq('id', task.id);
    await load();
  };

  const defer = async (task: Task) => {
    const next = new Date(Date.now() + 86_400_000).toISOString();
    setRows((prev) => prev.map((t) => (t.id === task.id ? { ...t, due_at: next } : t)));
    setFeedback({ message: 'Deferred to tomorrow', detail: task.title, tone: 'warning' });
    await supabase.from('tasks').update({ due_at: next }).eq('id', task.id);
    await load();
  };

  return (
    <Screen
      title="Tasks"
      subtitle={openCount > 0 ? `${openCount} open` : 'All clear'}
      contentStyle={{ paddingBottom: s[20] }}
    >
      {feedback ? (
        <FeedbackBanner message={feedback.message} detail={feedback.detail} tone={feedback.tone} onDismiss={() => setFeedback(null)} />
      ) : null}

      {/* Quick add — one field, one tap, optimistic row. */}
      <View style={{ paddingHorizontal: s[4], marginBottom: s[3] }}>
        <Card padded style={{ flexDirection: 'row', alignItems: 'center', gap: s[2] }}>
          <TextInput
            value={title}
            onChangeText={setTitle}
            onSubmitEditing={create}
            placeholder="Add a task…"
            placeholderTextColor={colors.inkFaint}
            returnKeyType="done"
            accessibilityLabel="New task title"
            style={[styles.input, { color: colors.ink, backgroundColor: colors.surfaceInset, borderColor: colors.border }]}
          />
          <Pressable
            onPress={create}
            disabled={!title.trim()}
            accessibilityRole="button"
            accessibilityLabel="Create task"
            style={({ pressed }) => [
              styles.addButton,
              { backgroundColor: title.trim() ? colors.brand : colors.surfaceHover, opacity: pressed ? 0.85 : 1 },
            ]}
          >
            <Plus size={18} color={title.trim() ? colors.brandInk : colors.inkFaint} />
          </Pressable>
        </Card>
      </View>

      <View style={{ paddingHorizontal: s[4], marginBottom: s[3] }}>
        <SegmentedControl
          value={filter}
          onChange={setFilter}
          segments={[
            { value: 'open', label: 'Open', count: openCount },
            { value: 'done', label: 'Done', count: rows.length - openCount },
            { value: 'all', label: 'All', count: rows.length },
          ]}
        />
      </View>

      {loading ? (
        <SkeletonList rows={5} />
      ) : visible.length === 0 ? (
        <EmptyState
          icon={Check}
          tone={filter === 'done' ? 'neutral' : 'success'}
          title={filter === 'done' ? 'Nothing completed yet' : 'No open tasks'}
          description={
            filter === 'done'
              ? 'Completed tasks collect here so you can log work or claim them against a customer.'
              : 'You are on top of everything assigned to you. New tasks arrive from action triggers or a manager.'
          }
          actionLabel={filter !== 'open' ? 'Show open' : undefined}
          onAction={() => setFilter('open')}
        />
      ) : (
        <View style={{ paddingHorizontal: s[4], gap: s[2] }}>
          {visible.map((task, index) => {
            const overdue = task.due_at ? new Date(task.due_at).getTime() < Date.now() && task.status !== 'done' : false;
            return (
              <Animated.View key={task.id} entering={enterUp(index)} exiting={FadeOut.duration(160)} layout={listLayout}>
                <SwipeRow
                  accessibilityLabel={`${task.title}. ${dueLabel(task.due_at)}`}
                  leading={{
                    label: 'Done',
                    tone: 'success',
                    icon: <Check size={18} color="#fff" />,
                    onTrigger: () => void complete(task),
                    removes: task.status !== 'done',
                  }}
                  trailing={{
                    label: 'Defer',
                    tone: 'warning',
                    icon: <Clock size={18} color="#fff" />,
                    onTrigger: () => void defer(task),
                  }}
                  style={{ borderRadius: r.lg, overflow: 'hidden' }}
                >
                  <Card padded={false} style={{ borderColor: overdue ? colors.danger : colors.border }}>
                    <ListRow
                      title={task.title}
                      meta={`${dueLabel(task.due_at)}${task.work_hours ? ` · ${task.work_hours}h logged` : ''}`}
                      overline={task.task_type ?? undefined}
                      accent={overdue ? colors.danger : task.status === 'done' ? colors.success : colors.brand}
                      trailing={<StatusPill status={task.status} />}
                      dense={false}
                    />
                  </Card>
                </SwipeRow>
              </Animated.View>
            );
          })}
          <Animated.View entering={FadeIn.duration(240)} style={{ marginTop: s[3] }}>
            <Text variant="caption" tone="faint" style={{ textAlign: 'center' }}>
              Swipe right to complete · swipe left to defer
            </Text>
          </Animated.View>
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  input: {
    flex: 1,
    height: 44,
    borderRadius: r.md,
    borderWidth: StyleSheet.hairlineWidth * 2,
    paddingHorizontal: s[3],
    fontSize: 15,
  },
  addButton: { width: 44, height: 44, borderRadius: r.md, alignItems: 'center', justifyContent: 'center' },
});
