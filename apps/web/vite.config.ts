import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@mentis/core': resolve(__dirname, '../../packages/core/src/index.ts') } },
  server: { host: '0.0.0.0', port: 5173 },
});
