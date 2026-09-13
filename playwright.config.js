const { defineConfig, devices } = require('@playwright/test');
module.exports = defineConfig({
  testDir: './test/e2e', timeout: 240000, expect: { timeout: 20000 },
  fullyParallel: false, workers: 1, retries: 0,
  reporter: [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],
  outputDir: 'test-results',
  use: {
    ...devices['Desktop Chrome'], baseURL: 'http://localhost:3001',
    channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome',
    screenshot: 'only-on-failure', trace: 'retain-on-failure',
    actionTimeout: 20000, navigationTimeout: 60000,
  },
  // Deliberately no webServer: use the user's already-running localhost:3001.
});
