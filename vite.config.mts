import { fileURLToPath, URL } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const developmentCspFragment =
  "style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' http://127.0.0.1:5173 ws://127.0.0.1:5173";
const productionCspFragment =
  "style-src 'self'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'none'";

export default defineConfig({
  base: './',
  plugins: [
    react(),
    {
      name: 'lyor-production-csp',
      apply: 'build',
      transformIndexHtml: (html) =>
        html.replace(developmentCspFragment, productionCspFragment),
    },
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
