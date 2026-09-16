/**
 * NativeWind configuration — the utility layer for native.
 *
 * Colours are declared as CSS custom properties, not hex values, so a className
 * and a StyleSheet object resolve to the *same* token. The custom properties
 * themselves live in `global.css` and mirror `packages/core/src/tokens.ts`
 * (asserted by `tests/design_tokens.test.ts`).
 *
 * The core component kit in `components/ui` uses token-driven StyleSheet objects
 * (deterministic on every RN version); className remains available for layout in
 * screens and for teams that prefer utility-first styling.
 */
const { colors, radii, fonts } = require('./tailwind.tokens');

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  darkMode: 'class',
  theme: {
    extend: {
      colors,
      borderRadius: {
        xs: `${radii.xs}px`,
        sm: `${radii.sm}px`,
        md: `${radii.md}px`,
        lg: `${radii.lg}px`,
        xl: `${radii.xl}px`,
        '2xl': `${radii['2xl']}px`,
        '3xl': `${radii['3xl']}px`,
      },
      fontFamily: {
        sans: [fonts.sans],
        display: [fonts.display],
        mono: [fonts.mono],
      },
      spacing: { 4.5: '18px', 5.5: '22px', 18: '72px' },
    },
  },
  plugins: [],
};
