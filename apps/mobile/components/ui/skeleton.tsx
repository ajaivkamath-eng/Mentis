/**
 * Skeletons — native twin of the web `.skeleton` shimmer.
 *
 * Implemented with one looping shared value driving opacity/translate, so a
 * screenful of placeholders costs a single animation. Respects the OS
 * "reduce motion" setting (Reanimated's ReduceMotion.System) and falls back to
 * a static block.
 */
import { useEffect } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import Animated, { Easing, ReduceMotion, useAnimatedStyle, useSharedValue, withRepeat, withTiming, interpolate } from 'react-native-reanimated';
import { r, s, useTheme } from '../../lib/theme';
import { shimmer } from '../../lib/motion';
import { Text } from './text';

export function Skeleton({ width, height = 12, radius = r.xs, style }: { width?: number | `${number}%`; height?: number; radius?: number; style?: ViewStyle }) {
  const { colors } = useTheme();
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withRepeat(
      withTiming(1, { duration: shimmer.duration / 2, easing: Easing.inOut(Easing.ease), reduceMotion: ReduceMotion.System }),
      -1,
      true,
    );
  }, [progress]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 1], [0.45, 0.9]),
  }));

  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[{ width: width ?? '100%', height, borderRadius: radius, backgroundColor: colors.surfaceHover }, animatedStyle, style]}
    />
  );
}

/** Row-shaped placeholder matching the list rows it replaces. */
export function SkeletonRow({ lines = 2 }: { lines?: number }) {
  return (
    <View style={styles.row}>
      <Skeleton width={40} height={40} radius={r.full} />
      <View style={{ flex: 1, gap: s[2] }}>
        <Skeleton width="65%" height={13} />
        {lines > 1 ? <Skeleton width="40%" height={11} /> : null}
      </View>
      <Skeleton width={54} height={22} radius={r.full} />
    </View>
  );
}

export function SkeletonList({ rows = 5 }: { rows?: number }) {
  return (
    <View accessibilityRole="progressbar" accessibilityLabel="Loading content">
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonRow key={i} />
      ))}
      <Text variant="caption" tone="faint" style={{ textAlign: 'center', marginTop: s[2] }}>
        Loading…
      </Text>
    </View>
  );
}

/** Mirrors the KPI card grid so numbers pop in without reflow. */
export function SkeletonStats({ count = 3 }: { count?: number }) {
  return (
    <View style={styles.grid}>
      {Array.from({ length: count }).map((_, i) => (
        <View key={i} style={styles.stat}>
          <Skeleton width={60} height={10} />
          <Skeleton width={90} height={24} style={{ marginTop: s[3] }} />
          <Skeleton width={70} height={10} style={{ marginTop: s[2] }} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: s[3], paddingHorizontal: s[4], paddingVertical: s[3] },
  grid: { flexDirection: 'row', gap: s[3], paddingHorizontal: s[4] },
  stat: { flex: 1, padding: s[3], borderRadius: r.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(148,163,184,0.18)' },
});
