import { defineConfig } from 'vitest/config';

export default defineConfig({
  css: { postcss: { plugins: [] } },
  test: {
    globals: true,
    environment: 'node',
    // Only run vitest-format tests (src/tests/ use custom assert() scripts — run with node directly)
    include: ['src/**/__tests__/**/*.test.ts'],
    env: {
      FROM_EMAIL: 'noreply@maitreo.com',
    },
  },
});
