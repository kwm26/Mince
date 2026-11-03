import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// `--mode pages` builds for GitHub Pages, which serves the app under /Mince/.
export default defineConfig(({ mode }) => ({
  base: mode === 'pages' ? '/Mince/' : '/',
  plugins: [react()],
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
}));
