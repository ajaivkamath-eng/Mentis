/**
 * EmptyState — the screen nobody designs, so we designed it once.
 *
 * Every empty region answers: what is missing, why it might be missing, and the
 * single next action. Presets cover the four real cases in Mentis and are
 * mirrored on web (`apps/web/src/components/ui/empty-state.tsx`).
 */
import { AlertTriangle, CalendarX2, Inbox, PartyPopper, SearchX, WifiOff, type LucideIcon } from 'lucide-react-native';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import Animated from 'react-native-reanimated';
import { r, s, useTheme } from '../../lib/theme';
import { enterUp } from '../../lib/motion';
import { Text } from './text';
import { Button } from './button';

export type EmptyTone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger';

export interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
  tone?: EmptyTone;
  footnote?: string;
  style?: ViewStyle;
}

export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  actionLabel,
  onAction,
  secondaryLabel,
  onSecondary,
  tone = 'neutral',
  footnote,
  style,
}: EmptyStateProps) {
  const { colors } = useTheme();
  const tones: Record<EmptyTone, { bg: string; fg: string }> = {
    neutral: { bg: colors.surfaceHover, fg: colors.inkMuted },
    brand: { bg: colors.brandSoft, fg: colors.brandText },
    success: { bg: colors.successSoft, fg: colors.success },
    warning: { bg: colors.warningSoft, fg: colors.warning },
    danger: { bg: colors.dangerSoft, fg: colors.danger },
  };
  const t = tones[tone];

  return (
    <Animated.View entering={enterUp(0)} style={[styles.wrap, style]}>
      <View style={[styles.iconWrap, { backgroundColor: t.bg }]}>
        <Icon size={22} color={t.fg} />
      </View>
      <Text variant="heading" style={{ textAlign: 'center', marginTop: s[3] }}>
        {title}
      </Text>
      {description ? (
        <Text variant="caption" tone="muted" style={{ textAlign: 'center', marginTop: s[2], maxWidth: 320 }}>
          {description}
        </Text>
      ) : null}
      {(actionLabel || secondaryLabel) && (
        <View style={{ flexDirection: 'row', gap: s[2], marginTop: s[4] }}>
          {actionLabel ? <Button label={actionLabel} intent="primary" size="sm" onPress={onAction} /> : null}
          {secondaryLabel ? <Button label={secondaryLabel} intent="ghost" size="sm" onPress={onSecondary} haptic={false} /> : null}
        </View>
      )}
      {footnote ? (
        <Text variant="caption" tone="faint" style={{ textAlign: 'center', marginTop: s[3] }}>
          {footnote}
        </Text>
      ) : null}
    </Animated.View>
  );
}

/* ------------------------------- Presets -------------------------------- */

export function NoResultsState({ query, onClear }: { query?: string; onClear?: () => void }) {
  return (
    <EmptyState
      icon={SearchX}
      title="No matches"
      description={query ? `Nothing matched “${query}”. Try a shorter search.` : 'Adjust your filters to see more.'}
      actionLabel={onClear ? 'Clear filters' : undefined}
      onAction={onClear}
    />
  );
}

export function NoSessionsState() {
  return (
    <EmptyState
      icon={CalendarX2}
      tone="brand"
      title="No sessions today"
      description="Nothing is scheduled. Pull down to refresh — the diary updates as soon as a pattern generates."
    />
  );
}

export function InboxZeroState() {
  return (
    <EmptyState
      icon={PartyPopper}
      tone="success"
      title="Inbox zero"
      description="Every pending action is closed. New ones appear automatically when a trigger fires or a task comes due."
      footnote="Nice work — this is the good kind of empty."
    />
  );
}

export function OfflineState({ onRetry }: { onRetry?: () => void }) {
  return (
    <EmptyState
      icon={WifiOff}
      tone="warning"
      title="Working offline"
      description="You are seeing the last synced register. Marks are queued locally and upload automatically when you have signal."
      actionLabel={onRetry ? 'Try syncing now' : undefined}
      onAction={onRetry}
    />
  );
}

export function ErrorState({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  return (
    <EmptyState
      icon={AlertTriangle}
      tone="danger"
      title="Something went wrong"
      description={message ?? 'The connection may have dropped. Your data is safe.'}
      actionLabel={onRetry ? 'Try again' : undefined}
      onAction={onRetry}
    />
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center', paddingVertical: s[12], paddingHorizontal: s[6] },
  iconWrap: { width: 52, height: 52, borderRadius: r.xl, alignItems: 'center', justifyContent: 'center' },
});
