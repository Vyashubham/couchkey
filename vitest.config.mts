import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    setupFiles: ['test/setup.ts'],
    restoreMocks: true,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,js}'],
      reporter: ['text-summary', 'html', 'lcov'],
      // Thresholds ratchet up as legacy modules are rewritten under test
      // (ROADMAP M2). Pure core modules must stay well covered now.
      thresholds: {
        'src/osk/**': { statements: 90, branches: 85, functions: 90, lines: 90 },
        'src/console/**/*.ts': { statements: 90, branches: 75, functions: 90, lines: 90 },
      },
    },
  },
});
