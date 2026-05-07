import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Vite config for the App Owner web admin portal.
//
// Build target is `web-admin/dist/`, deployed to Firebase Hosting.
// Default Vite asset hashing + tree-shaking is fine for this size of
// app — no SSR needed since this is a logged-in operator surface.
const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    target: 'es2022',
  },
  server: {
    port: 5174,
    open: true,
  },
});
