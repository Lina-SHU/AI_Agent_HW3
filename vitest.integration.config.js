import { defineConfig } from 'vitest/config';
export default defineConfig({ test: {
  globals: true, environment: 'node', fileParallelism: false,
  include: ['test/integration/**/*.test.js', 'test/shipping-orders.test.js'],
  setupFiles: ['test/integration/environment.js'], hookTimeout: 10000,
} });
