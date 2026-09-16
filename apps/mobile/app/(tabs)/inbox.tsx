/**
 * Inbox — pending actions, triaged by thumb.
 *
 * Swipe right → close the action (success haptic + optimistic removal).
 * Swipe left  → snooze 24h (warning haptic, row returns with the new due date).
 * Breached actions carry a red rail and sort first, because the whole point of
 * the queue is that nothing rots silently.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeOut } from 'react-native-reanimated';
import { Check, Clock, RotateCcw } from 'lucide-react-native';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/auth';
import { haptics } from '../../lib/haptics';
import { dueLabel } from '../../lib/hooks';
import { s, useTheme } from '../../lib/theme';
import { enterUp, listLayout } from '../../lib/motion';
import {
  Card,
  FeedbackBanner,
  InboxZeroState,
  ListRow,
  NoResultsState,
  Screen,
  SegmentedControl,
  SkeletonList,
  StatusPill,
  SwipeRow,
  Text,
} from '../../components/ui';

interface PendingAction {
  id: string;
  title: string;
  status: string;
  due_at?: string | null;
  action_types?: { name?: string } | null;
  assignee_id?: string | null;
}

type Filter = 'open' | 'breached' | 'closed';

export default function Inbox() {
  const { staff } = useAuth();
  const { colors } = useTheme();
  const [rows, setRows] = useState<PendingAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('open');
  const [feedback, setFeedback] = useState<{ message: string; detail?: string; tone: 'success' | 'warning' | 'danger' } | null>(null);

  const load = useCallback(async () => {
    if (!staff) return;
    try {
      const { data } = await supabase
        .from('pending_actions')
        .select('*,action_types(name)')
        .eq('assignee_id', staff.id)
        .order('due_at');
      setRows((data ?? []) as PendingAction[]);
    } finally {
      setLoading(false);
    }
  }, [staff]);

  useEffect(() => {
    void load();
  }, [load]);

  const counts = useMemo(
    () => ({
      open: rows.filter((r) => r.status !== 'closed').length,
      breached: rows.filter((r) => r.status === 'breached').length,
      closed: rows.filter((r) => r.status === 'closed').length,
    }),
    [rows],
  );

  const visible = useMemo(() => {
    if (filter === 'closed') return rows.filter((r) => r.status === 'closed');
    if (filter === 'breached') return rows.filter((r) => r.status === 'breached');
    return rows.filter((r) => r.status !== 'closed');
  }, [rows, filter]);

  const close = async (action: PendingAction) => {
    setRows((prev) => prev.map((a) => (a.id === action.id ? { ...a, status: 'closed' } : a)));
    haptics.success();
    setFeedback({ message: 'Action closed', detail: action.title, tone: 'success' });
    await supabase.from('pending_actions').update({ status: 'closed' }).eq('id', action.id);
    await load();
  };

  const reopen = async (action: PendingAction) => {
    setRows((prev) => prev.map((a) => (a.id === action.id ? { ...a, status: 'open' } : a)));
    haptics.select();
    setFeedback({ message: 'Action reopened', detail: action.title, tone: 'success' });
    await supabase.from('pending_actions').update({ status: 'open' }).eq('id', action.id);
    await load();
  };

  const snooze = async (action: PendingAction) => {
    const next = new Date(Date.now() + 86_400_000).toISOString();
    setRows((prev) => prev.map((a) => (a.id === action.id ? { ...a, due_at: next, status: 'open' } : a)));
    haptics.warning();
    setFeedback({ message: 'Snoozed for 24 hours', detail: action.title, tone: 'warning' });
    await supabase.from('pending_actions').update({ due_at: next, status: 'open' }).eq('id', action.id);
    await load();
  };

  const nothingAtAll = !loading && rows.length === 0;

  return (
    <Screen title="Inbox" subtitle={counts.breached > 0 ? `${counts.breached} breached` : 'Action queue'} contentStyle={{ paddingBottom: s[20] }}>
      {feedback ? (
        <FeedbackBanner message={feedback.message} detail={feedback.detail} tone={feedback.tone} onDismiss={() => setFeedback(null)} />
      ) : null}

      {!nothingAtAll ? (
        <View style={{ paddingHorizontal: s[4], marginBottom: s[3] }}>
          <SegmentedControl
            value={filter}
            onChange={setFilter}
            segments={[
              { value: 'open', label: 'Open', count: counts.open },
              { value: 'breached', label: 'Breached', count: counts.breached },
              { value: 'closed', label: 'Closed', count: counts.closed },
            ]}
          />
        </View>
      ) : null}

      {loading ? (
        <SkeletonList rows={4} />
      ) : nothingAtAll ? (
        <InboxZeroState />
      ) : visible.length === 0 ? (
        <NoResultsState onClear={() => setFilter('open')} />
      ) : (
        <View style={{ paddingHorizontal: s[4], gap: s[2] }}>
          {visible.map((action, index) => {
            const breached = action.status === 'breached';
            const closed = action.status === 'closed';
            return (
              <Animated.View key={action.id} entering={enterUp(index)} exiting={FadeOut.duration(160)} layout={listLayout}>
                <SwipeRow
                  accessibilityLabel={`${action.title}. ${dueLabel(action.due_at)}`}
                  leading={{
                    label: closed ? 'Reopen' : 'Close',
                    tone: closed ? 'brand' : 'success',
                    icon: <Check size={18} color="#fff" />,
                    onTrigger: () => void close(action),
                    removes: !closed,
                  }}
                  trailing={{
                    label: 'Snooze',
                    tone: 'warning',
                    icon: <Clock size={18} color="#fff" />,
                    onTrigger: () => void snooze(action),
                  }}
                  style={{ borderRadius: 16, overflow: 'hidden' }}
                >
                  <Card padded={false} style={{ borderColor: breached ? colors.danger : colors.border }}>
                    <ListRow
                      title={action.title}
                      meta={`${dueLabel(action.due_at)}${action.action_types?.name ? ` · ${action.action_types.name}` : ''}`}
                      accent={breached ? colors.danger : closed ? colors.inkFaint : colors.brand}
                      trailing={<StatusPill status={action.status} />}
                    />
                  </Card>
                </SwipeRow>
              </Animated.View>
            );
          })}
          <View style={{ marginTop: s[3] }}>
            <Text variant="caption" tone="faint" style={{ textAlign: 'center' }}>
              Swipe right to close · swipe left to snooze 24h
            </Text>
          </View>
        </View>
      )}
    </Screen>
  );
}


