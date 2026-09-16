import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@mentis/core': resolve(__dirname, '../../packages/core/src/index.ts') } },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.tsx', 'src/**/*.test.ts'],
    // The design-system page renders every primitive at once; give it room.
    testTimeout: 20_000,
  },
});
