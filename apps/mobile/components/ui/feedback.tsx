/**
 * Inline feedback banner + animated check — the native counterpart to web toasts.
 *
 * On mobile we prefer *in place* confirmation (a banner that slides in and
 * settles) over floating toasts: the thumb is already on the content, and a
 * banner never covers the row the user is working on.
 */
import { useEffect } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import Animated, {
  FadeInDown,
  FadeOutUp,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Check, Info, TriangleAlert, WifiOff } from 'lucide-react-native';
import { r, s, useTheme } from '../../lib/theme';
import { springBouncy } from '../../lib/motion';
import { Text } from './text';

export type FeedbackTone = 'info' | 'success' | 'warning' | 'danger' | 'neutral';

const ICONS = {
  info: Info,
  success: Check,
  warning: TriangleAlert,
  danger: TriangleAlert,
  neutral: WifiOff,
} as const;

export function FeedbackBanner({
  message,
  detail,
  tone = 'info',
  onDismiss,
  style,
}: {
  message: string;
  detail?: string;
  tone?: FeedbackTone;
  onDismiss?: () => void;
  style?: ViewStyle;
}) {
  const { colors } = useTheme();
  const tones: Record<FeedbackTone, { fg: string; bg: string }> = {
    info: { fg: colors.info, bg: colors.infoSoft },
    success: { fg: colors.success, bg: colors.successSoft },
    warning: { fg: colors.warning, bg: colors.warningSoft },
    danger: { fg: colors.danger, bg: colors.dangerSoft },
    neutral: { fg: colors.inkMuted, bg: colors.surfaceHover },
  };
  const t = tones[tone];
  const Icon = ICONS[tone];

  return (
    <Animated.View
      entering={FadeInDown.duration(220)}
      exiting={FadeOutUp.duration(180)}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={[styles.banner, { backgroundColor: t.bg }, style]}
      onTouchEnd={onDismiss}
    >
      <Icon size={16} color={t.fg} />
      <View style={{ flex: 1 }}>
        <Text variant="label" style={{ color: t.fg }}>
          {message}
        </Text>
        {detail ? (
          <Text variant="caption" style={{ color: t.fg, opacity: 0.85, marginTop: 1 }}>
            {detail}
          </Text>
        ) : null}
      </View>
    </Animated.View>
  );
}

/**
 * AnimatedCheck — the register's confirmation moment.
 * Scales in with a bouncy spring and draws nothing else, because the row
 * background already changed colour and the phone already hummed.
 */
export function AnimatedCheck({ checked, size = 28, color }: { checked: boolean; size?: number; color?: string }) {
  const { colors } = useTheme();
  const scale = useSharedValue(checked ? 1 : 0);
  const stroke = useSharedValue(checked ? 1 : 0);

  useEffect(() => {
    scale.value = withSpring(checked ? 1 : 0, springBouncy);
    stroke.value = withTiming(checked ? 1 : 0, { duration: 180 });
  }, [checked, scale, stroke]);

  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }], opacity: stroke.value }));

  return (
    <Animated.View
      style={[
        {
          width: size,
          height: size,
          borderRadius: 999,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: checked ? (color ?? colors.success) : 'transparent',
          borderWidth: checked ? 0 : StyleSheet.hairlineWidth * 3,
          borderColor: colors.borderStrong,
        },
        style,
      ]}
    >
      <Check size={size * 0.62} color="#fff" strokeWidth={3} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: s[2],
    paddingHorizontal: s[3],
    paddingVertical: 10,
    borderRadius: r.md,
    marginHorizontal: s[4],
    marginVertical: s[2],
  },
});
