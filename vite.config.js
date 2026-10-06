import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    sourcemap: false,
    // SheetJS ocupa la mayor parte del bundle; es una app interna de una sola página.
    chunkSizeWarningLimit: 1000
  },
  test: {
    environment: 'node'
  }
});
