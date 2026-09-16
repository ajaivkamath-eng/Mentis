// Root suite = shared domain logic + cross-platform design-system parity.
// Component tests live next to the app that owns them and run under their own
// jsdom config (`apps/web`: `npm test`), so this config stays dependency-light
// and does not have to resolve app-level tooling.
import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  resolve: { alias: { '@mentis/core': resolve(__dirname, 'packages/core/src/index.ts') } },
  test: { include: ['tests/**/*.test.ts'] },
});
