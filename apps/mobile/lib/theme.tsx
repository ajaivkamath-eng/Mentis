/**
 * Mentis mobile theme — the React Native half of the shared token table.
 *
 * Colours, radii, spacing, durations and springs all come from
 * `@mentis/core/tokens`, so a token change moves web and mobile together and
 * `tests/design_tokens.test.ts` fails loudly if the stylesheets drift.
 *
 * Everything a component needs is exported from here: `useTheme()` for the
 * active palette, plus the static scales (`r`, `s`, `d`, `type`) that do not
 * depend on light/dark.
 */
import { Appearance, Platform, useColorScheme as useSystemScheme, type ViewStyle } from 'react-native';
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import {
  duration,
  easing,
  elevation,
  fonts,
  layout,
  radii,
  space,
  spring,
  themes,
  typeScale,
  type Theme,
} from '@mentis/core';

export type ColorScheme = 'light' | 'dark';

/** Short handles keep style objects readable: `r.lg`, `s[4]`, `d.base`. */
export const r = radii;
export const s = space;
export const d = duration;
export const type = typeScale;
export const family = fonts;
export const metrics = layout;

export const palettes: Record<ColorScheme, Theme> = {
  light: themes.light,
  dark: themes.dark,
};

/** Native shadow preset per elevation level, tuned per platform. */
export function shadow(level: keyof typeof elevation, scheme: ColorScheme = 'dark'): ViewStyle {
  const e = elevation[level];
  if (Platform.OS === 'android') return { elevation: e.androidElevation };
  return {
    shadowColor: e.native.shadowColor,
    shadowOpacity: scheme === 'dark' ? e.native.shadowOpacity * 1.6 : e.native.shadowOpacity,
    shadowRadius: e.native.shadowRadius,
    shadowOffset: e.native.shadowOffset,
  };
}

/* -------------------------------------------------------------------------- */
/* Provider                                                                   */
/* -------------------------------------------------------------------------- */

interface ThemeState {
  scheme: ColorScheme;
  colors: Theme;
  isDark: boolean;
  /** `null` follows the OS; 'light'/'dark' pins the app. */
  override: ColorScheme | null;
  setScheme: (next: ColorScheme | 'system') => void;
}

const Ctx = createContext<ThemeState | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useSystemScheme();
  const [override, setOverride] = useState<ColorScheme | null>(null);

  const scheme: ColorScheme = override ?? (system === 'light' ? 'light' : 'dark');

  const setScheme = useCallback((next: ColorScheme | 'system') => {
    if (next === 'system') {
      setOverride(null);
      Appearance.setColorScheme(null);
      return;
    }
    setOverride(next);
    // Also flips native surfaces (keyboard, alerts, status bar) to match.
    Appearance.setColorScheme(next);
  }, []);

  const value = useMemo<ThemeState>(
    () => ({ scheme, colors: palettes[scheme], isDark: scheme === 'dark', override, setScheme }),
    [scheme, override, setScheme],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTheme(): ThemeState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useTheme must be used inside <ThemeProvider>');
  return v;
}

/* -------------------------------------------------------------------------- */
/* Motion presets (Reanimated reads these)                                    */
/* -------------------------------------------------------------------------- */

/* Timing configs live in `lib/motion.ts` — they need real Easing functions from
   Reanimated, and this module stays renderer-agnostic so it can be imported by
   tests and tooling. */

/** Springs, named the same as web (`springs.swift`, `springs.sheet`…). */
export const springs = {
  swift: spring.swift,
  gentle: spring.gentle,
  bouncy: spring.bouncy,
  sheet: spring.sheet,
} as const;

/** Cubic-bezier easings as functions, for places that take an Easing rather than a config. */
export const bezier = easing;
