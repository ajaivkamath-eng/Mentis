/**
 * Motion presets — the Framer Motion half of `packages/core/src/tokens.ts`.
 * Every duration/easing/spring below is derived from the shared token table, so
 * web and native move at the same speed with the same feel.
 */
import type { Transition, Variants } from 'framer-motion';
import { duration, easing, spring, motionPresets } from '@mentis/core';

/** Motion tokens as CSS-ready cubic-beziers. */
const bez = (e: readonly number[]) => [e[0], e[1], e[2], e[3]] as [number, number, number, number];

export const transition = {
  instant: { duration: duration.instant / 1000, ease: bez(easing.standard) },
  fast: { duration: duration.fast / 1000, ease: bez(easing.standard) },
  base: { duration: duration.base / 1000, ease: bez(easing.standard) },
  smooth: { duration: duration.smooth / 1000, ease: bez(easing.decelerate) },
  deliberate: { duration: duration.deliberate / 1000, ease: bez(easing.emphasized) },
} satisfies Record<string, Transition>;

export const springs = {
  swift: { type: 'spring', ...spring.swift },
  gentle: { type: 'spring', ...spring.gentle },
  bouncy: { type: 'spring', ...spring.bouncy },
  sheet: { type: 'spring', ...spring.sheet },
} satisfies Record<string, Transition>;

/* -------------------------------------------------------------------------- *
 * Variants
 * -------------------------------------------------------------------------- */

/** Content entrance: 8dp rise + fade, used for page sections and card grids. */
export const fadeUp: Variants = {
  hidden: { opacity: 0, y: motionPresets.enterUp.y },
  show: { opacity: 1, y: 0, transition: transition.smooth },
};

export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: transition.base },
};

/** Popovers, tooltips, dropdown content, dialogs. */
export const scaleIn: Variants = {
  hidden: { opacity: 0, scale: motionPresets.popover.scale, y: motionPresets.popover.y },
  show: { opacity: 1, scale: 1, y: 0, transition: springs.swift },
  exit: { opacity: 0, scale: 0.98, y: 2, transition: transition.instant },
};

/** Parent of a list — children stagger 35ms, capped at 8 to keep long lists snappy. */
export const listStagger = (count = Number.POSITIVE_INFINITY): Variants => ({
  hidden: {},
  show: {
    transition: {
      staggerChildren: motionPresets.enterUp.stagger / 1000,
      delayChildren: 0.02,
      staggerDirection: 1,
      when: 'beforeChildren',
    },
  },
  // `count` is accepted so callers can document intent; Framer caps naturally via
  // per-child delays below.
});

/** Per-child variant for staggered lists. */
export const listItem = (index = 0): Variants => ({
  hidden: { opacity: 0, y: motionPresets.enterUp.y },
  show: {
    opacity: 1,
    y: 0,
    transition: {
      ...transition.smooth,
      delay: Math.min(index, motionPresets.enterUp.staggerCap) * (motionPresets.enterUp.stagger / 1000),
    },
  },
});

/** Route transitions — mounted by `PageTransition` in components/patterns. */
export const pageVariants: Variants = {
  initial: { opacity: 0, y: motionPresets.page.y },
  animate: { opacity: 1, y: 0, transition: transition.deliberate },
  exit: { opacity: 0, y: -4, transition: transition.base },
};

/** Centred dialog panel: 0.96 → 1 with a swift spring, 2dp rise on exit. */
export const scaledSheetVariants: Variants = {
  hidden: { opacity: 0, scale: 0.96, y: 6 },
  show: { opacity: 1, scale: 1, y: 0, transition: springs.swift },
  exit: { opacity: 0, scale: 0.98, y: 4, transition: transition.fast },
};

/** Bottom sheets / side drawers. */
export const sheetVariants: Variants = {
  hidden: { y: '100%' },
  show: { y: 0, transition: springs.sheet },
  exit: { y: '100%', transition: { duration: duration.smooth / 1000, ease: bez(easing.accelerate) } },
};

export const drawerVariants: Variants = {
  hidden: { x: '100%' },
  show: { x: 0, transition: springs.sheet },
  exit: { x: '100%', transition: { duration: duration.base / 1000, ease: bez(easing.accelerate) } },
};

/** Dialog scrim — shared by dialog/sheet/drawer overlays. */
export const scrimVariants: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: transition.base },
  exit: { opacity: 0, transition: transition.fast },
};

/** Success tick / badge pop. */
export const popVariants: Variants = {
  hidden: { opacity: 0, scale: 0.7 },
  show: { opacity: 1, scale: 1, transition: springs.bouncy },
  exit: { opacity: 0, scale: 0.9, transition: transition.instant },
};

/** Collapsible rows (expanding a detail panel inside a list). */
export const collapseVariants: Variants = {
  hidden: { height: 0, opacity: 0 },
  show: { height: 'auto', opacity: 1, transition: transition.smooth },
  exit: { height: 0, opacity: 0, transition: transition.fast },
};

/* -------------------------------------------------------------------------- *
 * Interaction helpers
 * -------------------------------------------------------------------------- */

/** Card hover lift (2dp) — pair with `whileTap` for the press state. */
export const hoverLift = {
  whileHover: { y: motionPresets.hoverLift.y },
  whileTap: { scale: motionPresets.press.scale, transition: transition.instant },
  transition: transition.fast,
} as const;

/** Button/chip press feedback. */
export const pressable = {
  whileHover: { y: -1 },
  whileTap: { scale: motionPresets.press.scale, transition: transition.instant },
  transition: springs.swift,
} as const;

/** Standard viewport trigger so entrances fire once, slightly early. */
export const inView = { once: true, margin: '-12% 0px -8% 0px' } as const;
