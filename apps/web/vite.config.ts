import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@mentis/core': resolve(__dirname, '../../packages/core/src/index.ts') } },
  server: {
    host: '0.0.0.0',
    port: 5173,
    // The dev server is reached through a proxy host (preview/CI tunnels), so
    // host-header checks must not reject it.
    allowedHosts: true,
    strictPort: false,
  },
  preview: { host: '0.0.0.0', port: 4173, allowedHosts: true },
  build: {
    // Keep the initial paint light: charts, motion and the data client split out
    // of the route bundle instead of shipping one 1.4 MB chunk.
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          motion: ['framer-motion'],
          charts: ['recharts'],
          data: ['@supabase/supabase-js'],
        },
      },
    },
    chunkSizeWarningLimit: 700,
  },
});
