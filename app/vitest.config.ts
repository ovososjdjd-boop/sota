import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    testTimeout: 90000,
    projects: [
      {
        extends: true,
        test: {
          name: 'engine',
          environment: 'node',
          include: ['src/core/**/*.test.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'ui',
          environment: 'jsdom',
          include: ['src/ui-tests/**/*.test.tsx'],
          setupFiles: ['./src/ui-tests/setup.ts'],
        },
      },
    ],
  },
});
