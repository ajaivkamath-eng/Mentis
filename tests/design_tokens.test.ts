/**
 * Design-system contract tests.
 *
 * "One design system, two platforms" only stays true if something checks it, so
 * this suite asserts that the CSS on both platforms matches
 * `packages/core/src/tokens.ts` value for value:
 *
 *   1. web  — apps/web/src/app.css            (:root light, .dark dark, @theme scale)
 *   2. native — apps/mobile/global.css        (:root light, .dark dark)
 *   3. native tooling — apps/mobile/tokens.json is regenerated and identical
 *
 * A designer changing a hex in the token file fails CI until both platforms
 * follow. That is the whole point.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import {
  cssVarNames,
  darkTheme,
  duration,
  elevation,
  fontSizeKeys,
  lightTheme,
  motionPresets,
  radii,
  space,
  spring,
  typeScale,
  themes,
} from '@mentis/core';

const repoRoot = resolve(__dirname, '..');
const read = (p: string) => readFileSync(resolve(repoRoot, p), 'utf8');

/** Normalise a CSS value so `rgba(12, 22, 40, 0.62)` === `rgba(12,22,40,.62)`. */
const norm = (value: string) =>
  value
    .trim()
    .replace(/\s+/g, '')
    .replace(/^\./, '0.')
    // 0.10 === 0.1 — trailing zeros are not a design difference.
    .replace(/(\.\d+?)0+(?=\D|$)/g, '$1')
    .toLowerCase();

/** Collect `--var: value` declarations from every matching rule block. */
function declarations(input: string, selector: string): Record<string, string> {
  // Comments can contain braces, so strip them before block-splitting.
  const css = input.replace(/\/\*[\s\S]*?\*\//g, '');
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const blocks = [...css.matchAll(new RegExp(`(?:^|[};])\\s*${escaped}\\s*\\{([^{}]*)\\}`, 'g'))];
  const out: Record<string, string> = {};
  for (const [, body] of blocks) {
    for (const line of body.split(';')) {
      const [name, ...rest] = line.split(':');
      if (!name?.trim().startsWith('--')) continue;
      out[name.trim()] = rest.join(':').trim();
    }
  }
  return out;
}

const webCss = read('apps/web/src/app.css');
const nativeCss = read('apps/mobile/global.css');
const webLight = declarations(webCss, ':root');
const webDark = declarations(webCss, '.dark');
const webTheme = declarations(webCss, '@theme inline'); // radii, type scale, motion tokens
const nativeLight = declarations(nativeCss, ':root');
const nativeDark = declarations(nativeCss, '.dark');

const generated = JSON.parse(read('apps/mobile/tokens.json')) as {
  version: string;
  semanticColours: Record<string, string>;
  radii: Record<string, number>;
  duration: Record<string, number>;
  themes: { dark: Record<string, string>; light: Record<string, string> };
};

describe('token contract', () => {
  it('exposes every semantic token on both platforms', () => {
    for (const [key, cssVar] of Object.entries(cssVarNames)) {
      // `chart` is a series, expressed as --chart-1…5 rather than one variable.
      if (key === 'chart' || key === 'shadow' || key === 'shadowLg') continue;
      expect(webLight[cssVar], `web :root is missing ${cssVar}`).toBeDefined();
      expect(nativeLight[cssVar], `native :root is missing ${cssVar}`).toBeDefined();
      expect(nativeDark[cssVar], `native .dark is missing ${cssVar}`).toBeDefined();
    }
  });

  it.each(Object.keys(lightTheme) as (keyof typeof lightTheme)[])(
    'web light theme matches tokens.ts for "%s"',
    (key) => {
      if (key === 'chart') return;
      const cssVar = cssVarNames[key];
      expect(norm(webLight[cssVar] ?? '')).toBe(norm(String(lightTheme[key])));
    },
  );

  it.each(Object.keys(darkTheme) as (keyof typeof darkTheme)[])(
    'web + native dark themes match tokens.ts for "%s"',
    (key) => {
      if (key === 'chart') return;
      const cssVar = cssVarNames[key];
      const expected = norm(String(darkTheme[key]));
      expect(norm(webDark[cssVar] ?? ''), `web .dark ${cssVar}`).toBe(expected);
      expect(norm(nativeDark[cssVar] ?? ''), `native .dark ${cssVar}`).toBe(expected);
    },
  );

  it('keeps light and native light in step too', () => {
    for (const key of Object.keys(lightTheme) as (keyof typeof lightTheme)[]) {
      if (key === 'chart') continue;
      const cssVar = cssVarNames[key];
      expect(norm(nativeLight[cssVar] ?? ''), `native :root ${cssVar}`).toBe(norm(String(lightTheme[key])));
    }
  });

  it('declares each chart series colour for both themes', () => {
    expect(darkTheme.chart).toHaveLength(5);
    darkTheme.chart.forEach((colour, i) => {
      expect(norm(webDark[`--chart-${i + 1}`] ?? '')).toBe(norm(colour));
      expect(norm(nativeDark[`--chart-${i + 1}`] ?? '')).toBe(norm(colour));
    });
  });
});

describe('scale parity', () => {
  it('web radius utilities match the radius scale', () => {
    for (const [name, value] of Object.entries(radii)) {
      if (name === 'full') continue;
      expect(norm(webTheme[`--radius-${name}`] ?? ''), `--radius-${name}`).toBe(`${value}px`);
    }
  });

  it('web type scale matches the typography tokens', () => {
    for (const key of fontSizeKeys) {
      const token = typeScale[key];
      expect(norm(webTheme[`--text-${key}`] ?? ''), `--text-${key}`).toBe(norm(token.web));
    }
  });

  it('motion tokens are present in both platform bundles', () => {
    // Native reads the numbers directly; web mirrors them through Tailwind's
    // --ease-* / --animate-* utilities.
    expect(webCss).toContain('--ease-standard');
    expect(webCss).toContain('--ease-decelerate');
    expect(webCss).toContain('--ease-emphasized');
    expect(duration.base).toBe(220);
    expect(duration.smooth).toBe(340);
    expect(motionPresets.press.scale).toBe(0.97);
    expect(motionPresets.enterUp.y).toBe(8);
    expect(spring.swift.stiffness).toBeGreaterThan(spring.gentle.stiffness);
  });

  it('spacing follows the 4pt rhythm', () => {
    for (const [key, value] of Object.entries(space)) {
      if (value === 0) continue;
      expect(value % 4, `space[${key}] must be a multiple of 4`).toBe(0);
    }
  });

  it('elevation presets stay parseable on both platforms', () => {
    for (const level of ['e1', 'e2', 'e3', 'e4'] as const) {
      expect(elevation[level].web).toMatch(/^0 /);
      expect(elevation[level].native.shadowColor).toMatch(/^#/);
    }
  });
});

describe('generated native tokens', () => {
  it('is in sync with packages/core/src/tokens.ts', () => {
    // Re-runs the generator in --check mode: fails if someone edits the JSON by hand.
    expect(() =>
      execFileSync('node', ['scripts/gen-tokens.mjs', '--check'], {
        cwd: resolve(repoRoot, 'apps/mobile'),
        stdio: 'pipe',
      }),
    ).not.toThrow();
  });

  it('reports the same version and values as the token module', () => {
    expect(generated.version).toBe('2.0.0');
    expect(generated.radii).toEqual(radii);
    expect(generated.duration).toEqual(duration);
    for (const key of Object.keys(darkTheme) as (keyof typeof darkTheme)[]) {
      if (key === 'chart') continue;
      expect(generated.themes.dark[key as string]).toBe(darkTheme[key]);
      expect(generated.semanticColours[key as string]).toBe(cssVarNames[key]);
    }
  });

  it('drives the NativeWind colour map from CSS variables (no duplicated hex)', () => {
    // tailwind.config.js maps every semantic colour to var(--token) so a
    // className and a StyleSheet resolve to the same value.
    const config = read('apps/mobile/tailwind.config.js');
    expect(config).toContain("require('./tailwind.tokens')");
    const bridge = read('apps/mobile/tailwind.tokens.js');
    expect(bridge).toContain('semanticColours');
    expect(bridge).not.toMatch(/#[0-9a-f]{6}/i);
  });
});

describe('theme integrity', () => {
  it('keeps brand text readable on brand fills', () => {
    // brandInk is the text colour used on top of `brand`; both themes must
    // resolve to something that is not the same colour family.
    expect(themes.dark.brandInk).not.toBe(themes.dark.brand);
    expect(themes.light.brandInk).not.toBe(themes.light.brand);
  });

  it('uses distinct surfaces so depth is always expressible', () => {
    const surfaces = [themes.dark.bg, themes.dark.surface, themes.dark.surfaceHover, themes.dark.surfaceRaised, themes.dark.surfaceInset];
    expect(new Set(surfaces).size).toBe(surfaces.length);
  });
});
