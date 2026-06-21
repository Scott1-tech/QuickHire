import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// Builds the SPA into ../public/app so the Express server can serve it.
export default defineConfig({
  plugins: [react()],
  base: '/app/',
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  build: {
    outDir: path.resolve(__dirname, '../public/app'),
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
});
