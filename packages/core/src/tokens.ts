/**
 * Mentis Design System v2 — codename "Deep Court"
 * ---------------------------------------------------------------------------
 * The single source of truth for the visual language, shared by
 *
 *   • apps/web    — consumed indirectly: `app.css` mirrors these values into
 *                   CSS custom properties + Tailwind v4 `@theme` tokens.
 *   • apps/mobile — consumed directly: React Native needs numbers, not CSS,
 *                   so screens/components import `theme.*`, `radii`, `motion`.
 *
 * ⚠️  Every value here is asserted against BOTH stylesheets by
 *     `tests/design_tokens.test.ts`. If you change a hex code or a radius here,
 *     the parity test tells you which platform stylesheet drifted. That is how
 *     we keep "one design system, two platforms" honest in CI.
 *
 * Unit convention
 *   radii / spacing  → 1 unit = 1 px on web = 1 dp on native
 *   durations        → milliseconds (Framer Motion + Reanimated both speak ms)
 *   type scale       → `rem` for web, `px` (=dp) for native
 */

export const DS_VERSION = '2.0.0' as const;
export const DS_NAME = 'Mentis DS — Deep Court' as const;

/* -------------------------------------------------------------------------- */
/* 1. Raw palette                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Raw, unstyled colours. Never reference these directly in a component —
 * reference the semantic theme tokens below so dark/light stays a one-file swap.
 */
export const palette = {
  /** Deep court navy — the brand's structural colour. */
  court: {
    950: '#04070f',
    900: '#070d1a',
    850: '#0a1222',
    800: '#0c1628',
    700: '#122036',
    600: '#1a2b45',
    500: '#24395a',
    400: '#39516f',
  },
  /** Neutral greys, blue-leaning so they sit next to the navy without clashing. */
  slate: {
    50: '#f7f9fc',
    100: '#eef2f8',
    200: '#e3e9f2',
    300: '#cbd5e3',
    400: '#94a3b8',
    500: '#64748b',
    600: '#4a5666',
    700: '#334155',
    800: '#1e293b',
    900: '#0f172a',
  },
  /** Kingfisher teal — primary/action/brand. */
  teal: {
    100: '#cbfdf1',
    200: '#9df8e4',
    300: '#5eead4',
    400: '#2dd4bf',
    500: '#14b8a6',
    600: '#0d9488',
    700: '#0f766e',
    800: '#115e59',
    900: '#134e4a',
  },
  /** Medal gold — achievement, competition, warnings that are not errors. */
  gold: {
    300: '#fcd34d',
    400: '#fbbf24',
    500: '#f59e0b',
    600: '#d97706',
    700: '#b45309',
  },
  /** Iris — the cool half of our gradients (teal → iris) and focus/data accents. */
  iris: {
    300: '#a5b4fc',
    400: '#818cf8',
    500: '#6366f1',
    600: '#4f46e5',
  },
  emerald: { 300: '#6ee7b7', 400: '#34d399', 500: '#10b981', 600: '#059669' },
  amber: { 300: '#fcd34d', 400: '#fbbf24', 500: '#f59e0b', 600: '#d97706' },
  red: { 300: '#fca5a5', 400: '#f87171', 500: '#ef4444', 600: '#dc2626' },
  sky: { 300: '#93c5fd', 400: '#60a5fa', 500: '#3b82f6', 600: '#2563eb' },
} as const;

export type Palette = typeof palette;

/* -------------------------------------------------------------------------- */
/* 2. Semantic themes (dark is the product default)                           */
/* -------------------------------------------------------------------------- */

export interface Theme {
  /** App canvas. */
  bg: string;
  /** Recessed canvas (sidebars, table stripes). */
  bgSubtle: string;
  /** Resting card / panel. */
  surface: string;
  /** Hover / selected surface. */
  surfaceHover: string;
  /** Raised: menus, popovers, sheets. */
  surfaceRaised: string;
  /** Inset wells: inputs, code, timeline gutters. */
  surfaceInset: string;
  /** Translucent layer used with backdrop-blur. */
  glass: string;
  /** Hairline on glass. */
  border: string;
  /** Emphasised hairline (hover, dividers around focus). */
  borderStrong: string;
  /** Primary text. */
  ink: string;
  /** Secondary text — labels, descriptions. */
  inkMuted: string;
  /** Tertiary text — meta, placeholders, axis labels. */
  inkFaint: string;
  /** Brand action colour. */
  brand: string;
  brandHover: string;
  brandPress: string;
  /** Text/icon colour that sits ON `brand`. */
  brandInk: string;
  /** 10–16% brand wash for chips, active rows, tinted cards. */
  brandSoft: string;
  /** Brand colour safe for text on `bg` (contrast-checked). */
  brandText: string;
  /** Secondary accent (gold). */
  accent: string;
  accentSoft: string;
  success: string;
  successSoft: string;
  warning: string;
  warningSoft: string;
  danger: string;
  dangerSoft: string;
  info: string;
  infoSoft: string;
  /** Focus ring colour (WCAG-visible on both surfaces). */
  ring: string;
  /** Modal scrim. */
  scrim: string;
  /** High-contrast fill for the top hairline of raised surfaces. */
  sheen: string;
  /** Chart series, in draw order. */
  chart: readonly [string, string, string, string, string];
}

export const darkTheme: Theme = {
  bg: '#060b16',
  bgSubtle: '#04070f',
  surface: '#0c1628',
  surfaceHover: '#122036',
  surfaceRaised: '#132039',
  surfaceInset: '#080e1c',
  glass: 'rgba(12, 22, 40, 0.62)',
  border: 'rgba(148, 163, 184, 0.14)',
  borderStrong: 'rgba(148, 163, 184, 0.26)',
  ink: '#eef2f9',
  inkMuted: '#9aa8bd',
  inkFaint: '#6c7b93',
  brand: '#14b8a6',
  brandHover: '#2dd4bf',
  brandPress: '#0d9488',
  brandInk: '#04211d',
  brandSoft: 'rgba(20, 184, 166, 0.14)',
  brandText: '#5eead4',
  accent: '#fbbf24',
  accentSoft: 'rgba(251, 191, 36, 0.14)',
  success: '#34d399',
  successSoft: 'rgba(52, 211, 153, 0.14)',
  warning: '#fbbf24',
  warningSoft: 'rgba(251, 191, 36, 0.14)',
  danger: '#f87171',
  dangerSoft: 'rgba(248, 113, 113, 0.15)',
  info: '#60a5fa',
  infoSoft: 'rgba(96, 165, 250, 0.14)',
  ring: 'rgba(45, 212, 191, 0.65)',
  scrim: 'rgba(3, 6, 14, 0.72)',
  sheen: 'rgba(255, 255, 255, 0.06)',
  chart: ['#2dd4bf', '#818cf8', '#fbbf24', '#f87171', '#60a5fa'],
};

export const lightTheme: Theme = {
  bg: '#f4f7fc',
  bgSubtle: '#e9eef7',
  surface: '#ffffff',
  surfaceHover: '#f7f9fc',
  surfaceRaised: '#ffffff',
  surfaceInset: '#f1f5fa',
  glass: 'rgba(255, 255, 255, 0.72)',
  border: 'rgba(15, 23, 42, 0.09)',
  borderStrong: 'rgba(15, 23, 42, 0.18)',
  ink: '#0b1220',
  inkMuted: '#54607a',
  inkFaint: '#7b869c',
  brand: '#0d9488',
  brandHover: '#0f766e',
  brandPress: '#115e59',
  brandInk: '#f0fdfa',
  brandSoft: 'rgba(13, 148, 136, 0.10)',
  brandText: '#0f766e',
  accent: '#d97706',
  accentSoft: 'rgba(217, 119, 6, 0.10)',
  success: '#059669',
  successSoft: 'rgba(5, 150, 105, 0.10)',
  warning: '#b45309',
  warningSoft: 'rgba(180, 83, 9, 0.10)',
  danger: '#dc2626',
  dangerSoft: 'rgba(220, 38, 38, 0.09)',
  info: '#2563eb',
  infoSoft: 'rgba(37, 99, 235, 0.09)',
  ring: 'rgba(13, 148, 136, 0.55)',
  scrim: 'rgba(11, 18, 32, 0.42)',
  sheen: 'rgba(255, 255, 255, 0.9)',
  chart: ['#0d9488', '#4f46e5', '#d97706', '#dc2626', '#2563eb'],
};

export const themes = { dark: darkTheme, light: lightTheme } as const;
export type ThemeName = keyof typeof themes;

/** CSS custom-property names for every semantic token — used by app.css + parity test. */
export const cssVarNames: Record<keyof Theme | 'shadow' | 'shadowLg', string> = {
  bg: '--bg',
  bgSubtle: '--bg-subtle',
  surface: '--surface',
  surfaceHover: '--surface-hover',
  surfaceRaised: '--surface-raised',
  surfaceInset: '--surface-inset',
  glass: '--glass',
  border: '--border',
  borderStrong: '--border-strong',
  ink: '--ink',
  inkMuted: '--ink-muted',
  inkFaint: '--ink-faint',
  brand: '--brand',
  brandHover: '--brand-hover',
  brandPress: '--brand-press',
  brandInk: '--brand-ink',
  brandSoft: '--brand-soft',
  brandText: '--brand-text',
  accent: '--accent',
  accentSoft: '--accent-soft',
  success: '--success',
  successSoft: '--success-soft',
  warning: '--warning',
  warningSoft: '--warning-soft',
  danger: '--danger',
  dangerSoft: '--danger-soft',
  info: '--info',
  infoSoft: '--info-soft',
  ring: '--ring',
  scrim: '--scrim',
  sheen: '--sheen',
  shadow: '--shadow',
  shadowLg: '--shadow-lg',
  chart: '--chart-1',
};

/* -------------------------------------------------------------------------- */
/* 3. Radii, spacing, elevation, z-index                                      */
/* -------------------------------------------------------------------------- */

export const radii = {
  xs: 6,
  sm: 9,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 26,
  '3xl': 32,
  full: 999,
} as const;

/** 4pt spacing rhythm. `unit` = 1px web / 1dp native. */
export const space = {
  0: 0,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  7: 28,
  8: 32,
  10: 40,
  12: 48,
  16: 64,
  20: 80,
} as const;

export interface Elevation {
  /** Web box-shadow string. */
  web: string;
  /** Native (iOS) shadow props. */
  native: { shadowColor: string; shadowOpacity: number; shadowRadius: number; shadowOffset: { width: number; height: number } };
  /** Native (Android) elevation. */
  androidElevation: number;
}

export const elevation: Record<'e1' | 'e2' | 'e3' | 'e4' | 'glowBrand' | 'glowAccent', Elevation> = {
  e1: {
    web: '0 1px 2px rgba(2, 6, 23, 0.06), 0 1px 3px rgba(2, 6, 23, 0.08)',
    native: { shadowColor: '#020617', shadowOpacity: 0.08, shadowRadius: 3, shadowOffset: { width: 0, height: 1 } },
    androidElevation: 1,
  },
  e2: {
    web: '0 4px 10px -2px rgba(2, 6, 23, 0.10), 0 2px 6px -2px rgba(2, 6, 23, 0.08)',
    native: { shadowColor: '#020617', shadowOpacity: 0.12, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } },
    androidElevation: 3,
  },
  e3: {
    web: '0 14px 30px -10px rgba(2, 6, 23, 0.28), 0 6px 14px -6px rgba(2, 6, 23, 0.16)',
    native: { shadowColor: '#020617', shadowOpacity: 0.22, shadowRadius: 20, shadowOffset: { width: 0, height: 10 } },
    androidElevation: 8,
  },
  e4: {
    web: '0 32px 64px -18px rgba(2, 6, 23, 0.45), 0 12px 28px -12px rgba(2, 6, 23, 0.28)',
    native: { shadowColor: '#020617', shadowOpacity: 0.34, shadowRadius: 34, shadowOffset: { width: 0, height: 18 } },
    androidElevation: 16,
  },
  glowBrand: {
    web: '0 10px 30px -10px rgba(20, 184, 166, 0.55)',
    native: { shadowColor: '#14b8a6', shadowOpacity: 0.45, shadowRadius: 18, shadowOffset: { width: 0, height: 8 } },
    androidElevation: 6,
  },
  glowAccent: {
    web: '0 10px 30px -10px rgba(251, 191, 36, 0.45)',
    native: { shadowColor: '#fbbf24', shadowOpacity: 0.4, shadowRadius: 18, shadowOffset: { width: 0, height: 8 } },
    androidElevation: 6,
  },
};

export const zIndex = {
  base: 0,
  raised: 10,
  sticky: 20,
  nav: 30,
  overlay: 40,
  modal: 50,
  popover: 60,
  toast: 70,
  command: 80,
} as const;

/* -------------------------------------------------------------------------- */
/* 4. Typography                                                              */
/* -------------------------------------------------------------------------- */

export const fonts = {
  /** Interface + body. Best-in-class legibility at small sizes. */
  sans: 'Inter Variable',
  /** Headings, KPIs, brand moments — geometric, confident, distinct. */
  display: 'Plus Jakarta Sans Variable',
  /** Fixed-width figures: scores, money, times. */
  mono: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  /** Web stack fallbacks. */
  webSans:
    "'Inter Variable', Inter, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif",
  webDisplay:
    "'Plus Jakarta Sans Variable', 'Plus Jakarta Sans', 'Inter Variable', ui-sans-serif, system-ui, sans-serif",
} as const;

/**
 * Fluid type scale. Web uses `clamp()` so type breathes between 360px and 1440px;
 * native uses fixed values that match the web *desktop* end of each clamp.
 */
export const typeScale = {
  '2xs': { web: '0.6875rem', native: 11, lineHeight: '1rem', tracking: '0.01em' },
  xs: { web: '0.75rem', native: 12, lineHeight: '1.1rem', tracking: '0.01em' },
  sm: { web: '0.8125rem', native: 13, lineHeight: '1.25rem', tracking: '0.005em' },
  base: { web: '0.9375rem', native: 15, lineHeight: '1.5rem', tracking: '0' },
  lg: { web: '1.0625rem', native: 17, lineHeight: '1.65rem', tracking: '-0.005em' },
  xl: { web: '1.25rem', native: 20, lineHeight: '1.8rem', tracking: '-0.01em' },
  '2xl': { web: '1.5rem', native: 24, lineHeight: '2rem', tracking: '-0.015em' },
  '3xl': { web: '1.875rem', native: 30, lineHeight: '2.3rem', tracking: '-0.02em' },
  '4xl': { web: 'clamp(2rem, 1.6rem + 1.6vw, 2.5rem)', native: 40, lineHeight: '1.1', tracking: '-0.025em' },
  display: { web: 'clamp(2.25rem, 1.5rem + 2.6vw, 3.25rem)', native: 52, lineHeight: '1.05', tracking: '-0.03em' },
} as const;

/** Ordered list of scale keys — used by tests and tooling. */
export const fontSizeKeys = Object.keys(typeScale) as (keyof typeof typeScale)[];

export const fontWeight = { regular: '400', medium: '500', semibold: '600', bold: '700', extrabold: '800' } as const;

export const tracking = {
  display: '-0.03em',
  heading: '-0.02em',
  body: '0',
  overline: '0.09em',
  numeric: '-0.01em',
} as const;

/* -------------------------------------------------------------------------- */
/* 5. Motion                                                                  */
/* -------------------------------------------------------------------------- */

export const duration = {
  /** State confirmation on the element you just touched (ripple-out, colour). */
  instant: 90,
  /** Hover/press feedback, colour + scale. */
  fast: 140,
  /** Default for most UI transitions. */
  base: 220,
  /** Surfaces entering: cards expanding, rows settling. */
  smooth: 340,
  /** Sheets, page transitions, hero moments. */
  deliberate: 520,
  /** Ambient loops (aurora drift, shimmer). */
  ambient: 2400,
} as const;

export const easing = {
  /** General purpose — quick out, soft in. */
  standard: [0.2, 0.8, 0.2, 1],
  /** Entering the screen (expo-out): fast start, gentle landing. */
  decelerate: [0.16, 1, 0.3, 1],
  /** Leaving the screen: hold, then accelerate away. */
  accelerate: [0.4, 0, 1, 1],
  /** Overshoot-free emphasised curve for sheets/modals. */
  emphasized: [0.22, 1, 0.36, 1],
  /** Symmetric, for looping/ambient movement. */
  inOut: [0.65, 0, 0.35, 1],
} as const;

export const spring = {
  /** Buttons, chips, toggles — tight, immediate. */
  swift: { stiffness: 420, damping: 34, mass: 0.8 },
  /** Cards, sheets, list reorder — natural weight. */
  gentle: { stiffness: 240, damping: 26, mass: 1 },
  /** Playful moments: success ticks, badges, confetti-ish pops. */
  bouncy: { stiffness: 520, damping: 16, mass: 0.9 },
  /** Long-travel swipes (mobile drawers, swipe-to-dismiss). */
  sheet: { stiffness: 300, damping: 30, mass: 1.1 },
} as const;

export const motionPresets = {
  /** Hover lift for cards: 2dp rise, shadow up one level. */
  hoverLift: { duration: duration.fast, easing: easing.standard, y: -2 },
  /** Press feedback — native parity target is 0.97 scale on iOS / 0.98 Android. */
  press: { duration: duration.instant, scale: 0.97 },
  /** Content entrance: 8dp rise + fade. Stagger 35ms per child, cap 8. */
  enterUp: { duration: duration.smooth, easing: easing.decelerate, y: 8, stagger: 35, staggerCap: 8 },
  /** Popovers/menus. */
  popover: { duration: duration.base, easing: easing.decelerate, y: 4, scale: 0.98 },
  /** Route transitions. */
  page: { duration: duration.deliberate, easing: easing.emphasized, y: 6 },
  /** Skeleton shimmer sweep. */
  shimmer: { duration: 1600, delay: 120 },
} as const;

/* -------------------------------------------------------------------------- */
/* 6. Layout                                                                  */
/* -------------------------------------------------------------------------- */

export const layout = {
  /** Max content width for the desktop console. */
  contentMax: 1360,
  /** Reading width for prose blocks. */
  proseMax: 720,
  /** Sidebar widths. */
  sidebar: 264,
  sidebarCollapsed: 72,
  /** Global header height. */
  header: 60,
  /** Native bottom tab bar (content) height, excluding safe area. */
  tabBar: 62,
  /** Comfortable minimum hit target on touch devices (Material/HIG). */
  touchTarget: 48,
  breakpoints: { sm: 640, md: 768, lg: 1024, xl: 1280, '2xl': 1536 },
} as const;

/* -------------------------------------------------------------------------- */
/* 7. Helpers                                                                 */
/* -------------------------------------------------------------------------- */

/** Hex → `rgba()` so tints can be derived instead of hand-copied. */
export function withAlpha(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const int = parseInt(full, 16);
  const r = (int >> 16) & 255;
  const g = (int >> 8) & 255;
  const b = int & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Everything a platform needs in one import: `import { theme, radii } from ...`. */
export const theme = themes.dark;

export const designSystem = {
  version: DS_VERSION,
  name: DS_NAME,
  palette,
  themes,
  radii,
  space,
  elevation,
  zIndex,
  fonts,
  typeScale,
  fontWeight,
  tracking,
  duration,
  easing,
  spring,
  motionPresets,
  layout,
} as const;

export type DesignSystem = typeof designSystem;
