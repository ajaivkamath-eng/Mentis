/**
 * ListRow — the shared row shell for sessions, tasks and actions.
 *
 * Consistent 56/64dp rhythm, leading accent rail, title/meta stack, trailing
 * slot for status or a chevron, and an optional disclosure that animates open
 * with a layout transition (used for medical alerts and action detail).
 */
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';
import Animated, { FadeIn, LinearTransition } from 'react-native-reanimated';
import { r, s, useTheme } from '../../lib/theme';
import { haptics } from '../../lib/haptics';
import { Text } from './text';

export interface ListRowProps {
  title: string;
  meta?: string;
  /** Small caps label above the title. */
  overline?: string;
  leading?: ReactNode;
  trailing?: ReactNode;
  /** Coloured rail on the leading edge — status at a glance. */
  accent?: string;
  onPress?: () => void;
  /** Expanded content, animated in. */
  detail?: ReactNode;
  expanded?: boolean;
  accessibilityHint?: string;
  style?: ViewStyle;
  /** Tighter rows for the register (48dp targets, minimal padding). */
  dense?: boolean;
}

export function ListRow({
  title,
  meta,
  overline,
  leading,
  trailing,
  accent,
  onPress,
  detail,
  expanded = false,
  accessibilityHint,
  style,
  dense = false,
}: ListRowProps) {
  const { colors } = useTheme();

  return (
    <Animated.View layout={LinearTransition.duration(220)} style={[{ backgroundColor: colors.surface }, style]}>
      <Pressable
        onPress={
          onPress
            ? () => {
                haptics.tap();
                onPress();
              }
            : undefined
        }
        accessibilityRole={onPress ? 'button' : undefined}
        accessibilityLabel={[overline, title, meta].filter(Boolean).join(', ')}
        accessibilityHint={accessibilityHint}
        accessibilityState={{ expanded: detail ? expanded : undefined }}
        style={({ pressed }) => [
          styles.row,
          {
            paddingVertical: dense ? 10 : s[3],
            paddingHorizontal: s[4],
            backgroundColor: pressed ? colors.surfaceHover : 'transparent',
          },
        ]}
      >
        {accent ? <View style={[styles.accent, { backgroundColor: accent }]} /> : null}
        {leading ? <View style={{ marginRight: s[3] }}>{leading}</View> : null}
        <View style={{ flex: 1, minWidth: 0 }}>
          {overline ? (
            <Text variant="overline" tone="faint">
              {overline}
            </Text>
          ) : null}
          <Text variant={dense ? 'bodyStrong' : 'subtitle'} numberOfLines={1}>
            {title}
          </Text>
          {meta ? (
            <Text variant="caption" tone="muted" numberOfLines={2} style={{ marginTop: 1 }}>
              {meta}
            </Text>
          ) : null}
        </View>
        {trailing ? <View style={{ marginLeft: s[3] }}>{trailing}</View> : null}
      </Pressable>

      {detail && expanded ? (
        <Animated.View entering={FadeIn.duration(200)} style={{ paddingHorizontal: s[4], paddingBottom: s[3] }}>
          {detail}
        </Animated.View>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 56 },
  accent: { position: 'absolute', left: 0, top: s[2], bottom: s[2], width: 3, borderRadius: r.full },
});
