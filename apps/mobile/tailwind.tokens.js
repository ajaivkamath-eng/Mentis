/**
 * Bridge between the TypeScript token module and tooling that can only read CJS
 * (tailwind.config.js, metro.config.js).
 *
 * `tokens.json` is generated from `packages/core/src/tokens.ts` by
 * `npm run tokens:sync` and verified in CI by
 * `tests/design_tokens.test.ts`, so this file can never silently drift from the
 * design system.
 */
const tokens = require('./tokens.json');

/** Semantic colour names are exposed as CSS variables (see global.css). */
const colors = Object.fromEntries(
  Object.entries(tokens.semanticColours).map(([name, cssVar]) => [name, `var(${cssVar})`]),
);

module.exports = {
  colors,
  radii: tokens.radii,
  fonts: tokens.fonts,
  duration: tokens.duration,
};
