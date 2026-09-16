/**
 * Today — the screen a coach opens 40 times a day.
 *
 * Redesign: a hero that answers "what am I walking into?" in one glance
 * (count, expected attendance, register progress), then session cards that can
 * be read at arm's length and swiped to open. Loading is a skeleton that matches
 * the final layout; empty is a designed state with a next step; every tap
 * confirms itself with haptics and motion.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import Animated from 'react-native-reanimated';
import { ChevronRight, Clock, MapPin, Users } from 'lucide-react-native';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/auth';
import { haptics } from '../../lib/haptics';
import { r, s, useTheme } from '../../lib/theme';
import { enterUp } from '../../lib/motion';
import {
  CapacityMeter,
  Card,
  FeedbackBanner,
  NoSessionsState,
  Screen,
  SkeletonList,
  SkeletonStats,
  StatusPill,
  SwipeRow,
  Text,
} from '../../components/ui';

interface SessionRow {
  id: string;
  name: string;
  start_at: string;
  end_at?: string | null;
  capacity?: number | null;
  venues?: { name?: string } | null;
  mentor?: string | null;
  status?: string | null;
  expected?: number | null;
}

export default function Today() {
  const { staff } = useAuth();
  const router = useRouter();
  const { colors } = useTheme();

  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const day = new Date().toISOString().slice(0, 10);
    try {
      const { data, error: err } = await supabase
        .from('sessions')
        .select('id,name,start_at,end_at,capacity,status,venues(name)')
        .gte('start_at', `${day}T00:00:00Z`)
        .lte('start_at', `${day}T23:59:59Z`)
        .order('start_at');
      if (err) throw err;
      setSessions((data ?? []) as SessionRow[]);
      setError('');
    } catch {
      setError('Could not reach the diary. Showing the last known day.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
    haptics.select();
  }, [load]);

  const stats = useMemo(() => {
    const expected = sessions.reduce((sum, item) => sum + (item.expected ?? item.capacity ?? 0), 0);
    return {
      sessions: sessions.length,
      expected,
      first: sessions[0]?.start_at,
    };
  }, [sessions]);

  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  }, []);

  return (
    <Screen
      title={`${greeting}, ${staff?.display_name?.split(' ')[0] ?? 'coach'}`}
      subtitle={new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
      contentStyle={{ paddingBottom: s[20] }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brandText} />}
    >
      {error ? <FeedbackBanner message="Offline" detail={error} tone="warning" onDismiss={() => setError('')} /> : null}

      {/* Hero: the three facts that decide the next hour. */}
      <View style={{ paddingHorizontal: s[4], marginBottom: s[2] }}>
        <Card variant="default" padded style={{ backgroundColor: colors.surface, borderColor: colors.border }}>
          <View style={styles.heroRow}>
            <View style={{ flex: 1 }}>
              <Text variant="overline" tone="faint">
                Sessions today
              </Text>
              <Text variant="display" style={{ marginTop: 2 }}>
                {loading ? '—' : stats.sessions}
              </Text>
              <Text variant="caption" tone="muted" style={{ marginTop: 4 }}>
                {stats.expected > 0 ? `${stats.expected} places booked` : 'No bookings yet'}
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end', gap: s[2] }}>
              <View style={[styles.chip, { backgroundColor: colors.brandSoft }]}>
                <Clock size={13} color={colors.brandText} />
                <Text variant="overline" style={{ color: colors.brandText, letterSpacing: 0.4 }}>
                  {stats.first
                    ? new Date(stats.first).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
                    : 'No sessions'}
                </Text>
              </View>
              <Text variant="caption" tone="faint">
                {stats.first ? 'First session' : 'Enjoy the quiet'}
              </Text>
            </View>
          </View>
        </Card>
      </View>

      {/* Session list */}
      <View style={{ paddingHorizontal: s[4], marginTop: s[3], marginBottom: s[2], flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text variant="heading">Schedule</Text>
        <Text variant="caption" tone="faint">
          Swipe a session →
        </Text>
      </View>

      {loading ? (
        <View>
          <View style={{ paddingHorizontal: s[4] }}>
            <SkeletonStats count={3} />
          </View>
          <View style={{ marginTop: s[4] }}>
            <SkeletonList rows={4} />
          </View>
        </View>
      ) : sessions.length === 0 ? (
        <NoSessionsState />
      ) : (
        <View style={{ paddingHorizontal: s[4], gap: s[3] }}>
          {sessions.map((session, index) => {
            const open = () => router.push(`/register/${session.id}`);
            return (
              <Animated.View key={session.id} entering={enterUp(index)}>
                <SwipeRow
                  onPress={open}
                  accessibilityLabel={`${session.name}, starts ${new Date(session.start_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`}
                  leading={{
                    label: 'Register',
                    tone: 'brand',
                    icon: <Users size={18} color="#fff" />,
                    onTrigger: open,
                  }}
                  trailing={{
                    label: 'Details',
                    tone: 'warning',
                    icon: <MapPin size={18} color="#fff" />,
                    onTrigger: open,
                  }}
                  style={{ borderRadius: r.lg, overflow: 'hidden' }}
                >
                  <Card padded={false} variant="default" style={{ borderColor: colors.border }}>
                    <View style={{ padding: s[4] }}>
                      <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: s[3] }}>
                        <View style={{ flex: 1 }}>
                          <Text variant="overline" tone="faint">
                            {new Date(session.start_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                            {session.end_at
                              ? ` – ${new Date(session.end_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`
                              : ''}
                          </Text>
                          <Text variant="subtitle" numberOfLines={2} style={{ marginTop: 2 }}>
                            {session.name}
                          </Text>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: s[2], marginTop: s[2] }}>
                            <MapPin size={13} color={colors.inkFaint} />
                            <Text variant="caption" tone="muted">
                              {session.venues?.name ?? 'Venue TBC'}
                            </Text>
                          </View>
                        </View>
                        <View style={{ alignItems: 'flex-end', gap: s[2] }}>
                          {session.status ? <StatusPill status={session.status} /> : null}
                          <ChevronRight size={18} color={colors.inkFaint} />
                        </View>
                      </View>

                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: s[3] }}>
                        <CapacityMeter taken={session.expected ?? Math.round((session.capacity ?? 0) * 0.6)} capacity={session.capacity} />
                        <View style={[styles.cta, { backgroundColor: colors.brandSoft }]}>
                          <Users size={14} color={colors.brandText} />
                          <Text variant="overline" style={{ color: colors.brandText, letterSpacing: 0.4 }}>
                            Open register
                          </Text>
                        </View>
                      </View>
                    </View>
                  </Card>
                </SwipeRow>
              </Animated.View>
            );
          })}
        </View>
      )}

    </Screen>
  );
}

const styles = StyleSheet.create({
  heroRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  chip: { flexDirection: 'row', alignItems: 'center', gap: s[1], paddingHorizontal: s[2], paddingVertical: 4, borderRadius: r.full },
  cta: { flexDirection: 'row', alignItems: 'center', gap: s[1], paddingHorizontal: s[3], paddingVertical: 6, borderRadius: r.full },
});
