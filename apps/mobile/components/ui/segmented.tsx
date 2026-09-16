/**
 * SegmentedControl — filters, role switching, register views.
 *
 * The moving highlight is a single shared value (no per-item animation), and a
 * selection haptic fires on change. Identical semantics to the web control:
 * radiogroup + aria-checked equivalent via accessibilityState.
 */
import { useEffect } from 'react';
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { r, s, useTheme } from '../../lib/theme';
import { springSwift } from '../../lib/motion';
import { haptics } from '../../lib/haptics';
import { Text } from './text';

export interface Segment<T extends string> {
  value: T;
  label: string;
  count?: number;
}

export interface SegmentedProps<T extends string> {
  segments: Segment<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Height of the control; the highlight is measured from it. */
  size?: 'sm' | 'md';
  style?: ViewStyle;
}

export function SegmentedControl<T extends string>({ segments, value, onChange, size = 'md', style }: SegmentedProps<T>) {
  const { colors } = useTheme();
  const index = Math.max(0, segments.findIndex((seg) => seg.value === value));
  const width = 100 / segments.length;
  const left = useSharedValue(index * width);

  useEffect(() => {
    left.value = withSpring(index * width, springSwift);
  }, [index, left, width]);

  const highlightStyle = useAnimatedStyle(() => ({
    left: `${left.value}%`,
    width: `${width}%`,
  }));

  const height = size === 'sm' ? 32 : 38;

  return (
    <View
      accessibilityRole="radiogroup"
      style={[styles.track, { height, backgroundColor: colors.surfaceInset, borderColor: colors.border }, style]}
    >
      <Animated.View
        style={[styles.highlight, { backgroundColor: colors.surfaceRaised, height: height - 8 }, highlightStyle]}
        pointerEvents="none"
      />
      {segments.map((seg) => {
        const active = seg.value === value;
        return (
          <Pressable
            key={seg.value}
            accessibilityRole="radio"
            accessibilityState={{ selected: active }}
            accessibilityLabel={seg.count != null ? `${seg.label}, ${seg.count}` : seg.label}
            hitSlop={4}
            onPress={() => {
              if (seg.value === value) return;
              haptics.select();
              onChange(seg.value);
            }}
            style={styles.segment}
          >
            <Text variant={size === 'sm' ? 'overline' : 'label'} tone={active ? 'ink' : 'faint'} numberOfLines={1}>
              {seg.label}
              {seg.count != null ? ` ${seg.count}` : ''}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: r.full,
    borderWidth: StyleSheet.hairlineWidth * 2,
    padding: 4,
    position: 'relative',
  },
  highlight: {
    position: 'absolute',
    top: 4,
    borderRadius: r.full,
    shadowColor: '#020617',
    shadowOpacity: 0.18,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  segment: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
