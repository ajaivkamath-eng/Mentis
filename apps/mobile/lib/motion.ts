/**
 * Motion — the Reanimated half of the shared motion tokens.
 *
 * Mirrors `apps/web/src/lib/motion.ts` name for name (`enterUp`, `press`,
 * `listStagger`, `sheet`) so a reviewer can read either file and know what the
 * other platform does. Durations/easings come from the token table.
 */
import {
  Easing,
  FadeIn,
  FadeInDown,
  FadeOutDown,
  LinearTransition,
  ReduceMotion,
  SlideInDown,
  SlideOutDown,
  ZoomIn,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useCallback } from 'react';
import { duration, easing, motionPresets, spring } from '@mentis/core';

export const curve = {
  standard: Easing.bezier(...(easing.standard as unknown as [number, number, number, number])),
  decelerate: Easing.bezier(...(easing.decelerate as unknown as [number, number, number, number])),
  accelerate: Easing.bezier(...(easing.accelerate as unknown as [number, number, number, number])),
  emphasized: Easing.bezier(...(easing.emphasized as unknown as [number, number, number, number])),
} as const;

/** Delay for the nth item in a staggered list, capped so long lists stay instant. */
export const staggerDelay = (index: number) =>
  Math.min(index, motionPresets.enterUp.staggerCap) * motionPresets.enterUp.stagger;

/* -------------------------------------------------------------------------- */
/* Entrances & exits                                                          */
/* -------------------------------------------------------------------------- */

/** Content rising into place — 8dp + fade, the native twin of web `fadeUp`. */
export const enterUp = (index = 0) =>
  FadeInDown.duration(duration.smooth)
    .easing(curve.decelerate)
    .delay(staggerDelay(index))
    .reduceMotion(ReduceMotion.System);

export const fadeIn = (delay = 0) =>
  FadeIn.duration(duration.base).easing(curve.standard).delay(delay).reduceMotion(ReduceMotion.System);

/** Success ticks, badges, freshly-confirmed rows. */
export const popIn = () =>
  ZoomIn.duration(duration.base).easing(curve.emphasized).reduceMotion(ReduceMotion.System);

export const exitDown = () =>
  FadeOutDown.duration(duration.base).easing(curve.accelerate);

/** Bottom sheets — same 520ms emphasized curve as the web dialog. */
export const sheetEnter = () =>
  SlideInDown.duration(duration.deliberate).easing(curve.emphasized).reduceMotion(ReduceMotion.System);

export const sheetExit = () =>
  SlideOutDown.duration(duration.smooth).easing(curve.accelerate);

/** Layout transition for lists that reorder (marking present, closing actions). */
export const listLayout = LinearTransition.duration(duration.base).easing(curve.standard);

/** Timing configs (real easing functions, ready for `withTiming`). */
export const timing = {
  fast: { duration: duration.fast, easing: curve.standard },
  base: { duration: duration.base, easing: curve.standard },
  smooth: { duration: duration.smooth, easing: curve.decelerate },
  deliberate: { duration: duration.deliberate, easing: curve.emphasized },
} as const;

/* -------------------------------------------------------------------------- */
/* Interaction helpers                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Press feedback: 0.97 scale-in, spring out.
 * Every tappable surface in the app uses this, and it is the visual twin of the
 * web button's `whileTap` — same numbers, same duration.
 */
export function usePressScale(pressedScale: number = motionPresets.press.scale, disabled = false) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const onPressIn = useCallback(() => {
    if (disabled) return;
    scale.value = withTiming(pressedScale, { duration: duration.instant, easing: curve.standard });
  }, [disabled, pressedScale, scale]);

  const onPressOut = useCallback(() => {
    if (disabled) return;
    scale.value = withSpring(1, spring.swift);
  }, [disabled, scale]);

  return { animatedStyle, onPressIn, onPressOut };
}

/** Sweep used by skeletons and progress rings. */
export const shimmer = { duration: motionPresets.shimmer.duration, delay: motionPresets.shimmer.delay } as const;
export const springSwift = spring.swift;
export const springGentle = spring.gentle;
export const springBouncy = spring.bouncy;
export const springSheet = spring.sheet;
