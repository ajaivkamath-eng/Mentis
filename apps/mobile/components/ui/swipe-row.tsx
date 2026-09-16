/**
 * SwipeRow — the interaction web cannot do.
 *
 * On the register and task lists a coach's thumb does the work: swipe right to
 * mark present/complete, swipe left to defer/close. Design decisions that make
 * it feel native rather than bolted on:
 *
 *  • activeOffsetX(12) + failOffsetY(8) → vertical scrolling still wins until the
 *    gesture is unambiguously horizontal
 *  • resistance past the trigger distance (damped, never hard-stops)
 *  • a haptic tick fires at the moment the action arms, not on release — the
 *    user feels the commit point
 *  • springs from the shared token table, so it matches the web press feel
 *  • full accessibility fallback: the row is a button, actions are exposed as
 *    accessibility actions for screen readers and switch control
 */
import { useCallback, type ReactNode } from 'react';
import { AccessibilityInfo, StyleSheet, View, type ViewStyle } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { r, s, useTheme } from '../../lib/theme';
import { curve, springSwift } from '../../lib/motion';
import { haptics } from '../../lib/haptics';
import { Text } from './text';

const TRIGGER = 96;
const MAX = 148;

export interface SwipeAction {
  label: string;
  /** Rendered inside the action tray. */
  icon?: ReactNode;
  tone: 'success' | 'warning' | 'danger' | 'brand';
  onTrigger: () => void;
  /** Removes the row from the list after the action fires (destructive verbs). */
  removes?: boolean;
}

export interface SwipeRowProps {
  children: ReactNode;
  /** Swipe right → the positive verb (present, complete, approve). */
  leading?: SwipeAction;
  /** Swipe left → the escape hatch (defer, close, archive). */
  trailing?: SwipeAction;
  /** Tap anywhere on the row. */
  onPress?: () => void;
  accessibilityLabel?: string;
  /** Dense rows (registers) get a tighter vertical rhythm. */
  style?: ViewStyle;
}

export function SwipeRow({ children, leading, trailing, onPress, accessibilityLabel, style }: SwipeRowProps) {
  const { colors } = useTheme();
  const translateX = useSharedValue(0);
  const armed = useSharedValue(0);

  const toneColor: Record<SwipeAction['tone'], string> = {
    success: colors.success,
    warning: colors.warning,
    danger: colors.danger,
    brand: colors.brand,
  };

  const fire = useCallback(
    (action: SwipeAction) => {
      if (action.tone === 'danger' || action.tone === 'warning') haptics.warning();
      else haptics.success();
      action.onTrigger();
    },
    [],
  );

  const armFeedback = useCallback(() => haptics.select(), []);
  const disarmFeedback = useCallback(() => haptics.select(), []);

  const gesture = Gesture.Pan()
    .activeOffsetX([-12, 12])
    .failOffsetY([-8, 8])
    .onUpdate((e) => {
      const raw = e.translationX;
      // Damped travel past the trigger so the row never feels stuck.
      const damped = Math.abs(raw) > TRIGGER ? Math.sign(raw) * (TRIGGER + (Math.abs(raw) - TRIGGER) * 0.35) : raw;
      translateX.value = Math.max(-MAX, Math.min(MAX, damped));

      const nowArmed = translateX.value >= TRIGGER && leading ? 1 : translateX.value <= -TRIGGER && trailing ? 1 : 0;
      if (nowArmed !== armed.value) {
        armed.value = nowArmed;
        runOnJS(nowArmed ? armFeedback : disarmFeedback)();
      }
    })
    .onEnd((e) => {
      const shouldCommitRight = translateX.value >= TRIGGER && Boolean(leading);
      const shouldCommitLeft = translateX.value <= -TRIGGER && Boolean(trailing);

      if (shouldCommitRight && leading) {
        translateX.value = withTiming(MAX * 1.4, { duration: 180, easing: curve.accelerate }, () => {
          runOnJS(fire)(leading);
          translateX.value = leading.removes ? MAX * 1.4 : 0;
        });
        return;
      }
      if (shouldCommitLeft && trailing) {
        translateX.value = withTiming(-MAX * 1.4, { duration: 180, easing: curve.accelerate }, () => {
          runOnJS(fire)(trailing);
          translateX.value = trailing.removes ? -MAX * 1.4 : 0;
        });
        return;
      }
      armed.value = 0;
      translateX.value = withSpring(0, { ...springSwift, velocity: e.velocityX });
    });

  const rowStyle = useAnimatedStyle(() => ({ transform: [{ translateX: translateX.value }] }));

  const leadingStyle = useAnimatedStyle(() => ({
    opacity: interpolate(translateX.value, [0, 24, TRIGGER], [0, 0.4, 1], 'clamp'),
    transform: [{ scale: interpolate(translateX.value, [0, TRIGGER], [0.85, 1], 'clamp') }],
  }));

  const trailingStyle = useAnimatedStyle(() => ({
    opacity: interpolate(translateX.value, [-TRIGGER, -24, 0], [1, 0.4, 0], 'clamp'),
    transform: [{ scale: interpolate(translateX.value, [-TRIGGER, 0], [1, 0.85], 'clamp') }],
  }));

  return (
    <View style={[styles.wrap, style]}>
      {leading ? (
        <Animated.View style={[styles.tray, styles.leadingTray, { backgroundColor: toneColor[leading.tone] }, leadingStyle]}>
          {leading.icon}
          <Text variant="overline" style={{ color: '#fff', letterSpacing: 0.6 }}>
            {leading.label}
          </Text>
        </Animated.View>
      ) : null}

      {trailing ? (
        <Animated.View style={[styles.tray, styles.trailingTray, { backgroundColor: toneColor[trailing.tone] }, trailingStyle]}>
          {trailing.icon}
          <Text variant="overline" style={{ color: '#fff', letterSpacing: 0.6 }}>
            {trailing.label}
          </Text>
        </Animated.View>
      ) : null}

      <GestureDetector gesture={gesture}>
        <Animated.View
          style={[{ backgroundColor: colors.surface }, rowStyle]}
          accessibilityRole={onPress ? 'button' : undefined}
          accessibilityLabel={accessibilityLabel}
          accessibilityActions={[
            leading ? { name: 'activate', label: leading.label } : undefined,
            trailing ? { name: 'escape', label: trailing.label } : undefined,
          ].filter(Boolean) as { name: string; label: string }[]}
          onAccessibilityAction={(event) => {
            if (event.nativeEvent.actionName === 'activate' && leading) fire(leading);
            if (event.nativeEvent.actionName === 'escape' && trailing) fire(trailing);
          }}
        >
          {children}
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

/** Announce a swipe-triggered change to screen readers (iOS/Android both supported). */
export function announce(message: string) {
  AccessibilityInfo.announceForAccessibility(message);
}

const styles = StyleSheet.create({
  wrap: { overflow: 'hidden', position: 'relative' },
  tray: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: MAX,
    alignItems: 'center',
    justifyContent: 'center',
    gap: s[1],
  },
  leadingTray: { left: 0, alignItems: 'flex-start', paddingLeft: s[4] },
  trailingTray: { right: 0, alignItems: 'flex-end', paddingRight: s[4] },
});
