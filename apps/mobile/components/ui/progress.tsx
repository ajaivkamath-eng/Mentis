/**
 * Progress — bar, ring and the domain-specific capacity meter.
 * Animated with Reanimated, tuned from the shared duration tokens.
 */
import { useEffect } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import Animated, { useAnimatedProps, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';
import { r, s, useTheme } from '../../lib/theme';
import { timing } from '../../lib/motion';
import { Text } from './text';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export type ProgressTone = 'brand' | 'success' | 'warning' | 'danger' | 'info' | 'accent';

function useToneColor(tone: ProgressTone) {
  const { colors } = useTheme();
  return {
    brand: colors.brand,
    success: colors.success,
    warning: colors.warning,
    danger: colors.danger,
    info: colors.info,
    accent: colors.accent,
  }[tone];
}

/** Completion → tone. Mirrors `toneForRatio` on web. */
export function toneForRatio(ratio: number, invert = false): ProgressTone {
  const value = invert ? 1 - ratio : ratio;
  if (value >= 0.7) return 'success';
  if (value >= 0.35) return 'brand';
  if (value >= 0.15) return 'warning';
  return 'danger';
}

export function ProgressBar({
  value,
  max = 100,
  tone = 'brand',
  height = 6,
  style,
}: {
  value: number;
  max?: number;
  tone?: ProgressTone;
  height?: number;
  style?: ViewStyle;
}) {
  const { colors } = useTheme();
  const color = useToneColor(tone);
  const pct = Math.max(0, Math.min(1, value / max));
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withTiming(pct, timing.smooth);
  }, [pct, progress]);

  // Percentage widths are valid in an animated style; cast keeps TS literal-typed.
  const animatedStyle = useAnimatedStyle(() => ({ width: `${progress.value * 100}%` as `${number}%` }));

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(pct * 100) }}
      style={[{ height, borderRadius: r.full, backgroundColor: colors.surfaceInset, overflow: 'hidden' }, style]}
    >
      <Animated.View style={[{ height, borderRadius: r.full, backgroundColor: color }, animatedStyle]} />
    </View>
  );
}

/** Circular progress — the register's completion ring. */
export function ProgressRing({
  value,
  max = 100,
  size = 56,
  strokeWidth = 5,
  tone = 'brand',
  label,
}: {
  value: number;
  max?: number;
  size?: number;
  strokeWidth?: number;
  tone?: ProgressTone;
  label?: string;
}) {
  const { colors } = useTheme();
  const color = useToneColor(tone);
  const pct = Math.max(0, Math.min(1, value / max));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withTiming(pct, timing.smooth);
  }, [pct, progress]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: circumference * (1 - progress.value),
  }));

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Circle cx={size / 2} cy={size / 2} r={radius} stroke={colors.border} strokeWidth={strokeWidth} fill="none" />
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={circumference}
          animatedProps={animatedProps}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <Text variant="label" numeric style={{ fontSize: 13 }}>
        {label ?? `${Math.round(pct * 100)}%`}
      </Text>
    </View>
  );
}

/** "18 / 24 places" with the bar and tone chosen from fullness. */
export function CapacityMeter({
  taken,
  capacity,
  compact = false,
}: {
  taken: number;
  capacity: number | null | undefined;
  compact?: boolean;
}) {
  const { colors } = useTheme();
  if (!capacity || capacity <= 0) {
    return (
      <Text variant="caption" tone="muted">
        {taken} {compact ? '' : 'booked'}
      </Text>
    );
  }
  const ratio = taken / capacity;
  const tone: ProgressTone = ratio >= 1 ? 'danger' : ratio >= 0.8 ? 'warning' : ratio >= 0.4 ? 'brand' : 'info';

  return (
    <View style={{ gap: s[1], minWidth: compact ? 62 : 92 }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 2 }}>
        <Text variant="label" numeric>
          {taken}
        </Text>
        <Text variant="caption" tone="faint" numeric>
          /{capacity}
        </Text>
      </View>
      <ProgressBar value={Math.min(taken, capacity)} max={capacity} tone={tone} height={4} />
      {taken > capacity ? (
        <Text variant="caption" style={{ color: colors.danger }}>
          Over capacity
        </Text>
      ) : null}
    </View>
  );
}
