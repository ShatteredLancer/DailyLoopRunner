import { defineConfig } from 'vitest/config';

const isCi = process.env.CI === 'true';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
    reporters: isCi ? ['default', 'junit'] : ['default'],
    outputFile: isCi ? { junit: 'reports/junit.xml' } : undefined,
    testTimeout: 10000,
  },
});
