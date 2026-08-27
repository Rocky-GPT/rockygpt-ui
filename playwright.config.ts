import { defineConfig, devices } from 'playwright/test';

const port = Number(process.env.PLAYWRIGHT_PORT || 3000);
const mockBrainPort = Number(process.env.PLAYWRIGHT_BRAIN_PORT || port + 1_000);
const localBaseUrl = `http://localhost:${port}`;
const baseURL = process.env.PLAYWRIGHT_BASE_URL || localBaseUrl;
const localWebServers = [
  {
    command: 'node e2e/support/mock-brain.mjs',
    url: `http://127.0.0.1:${mockBrainPort}/readiness`,
    reuseExistingServer: Boolean(process.env.PLAYWRIGHT_REUSE_SERVER),
    timeout: 120_000,
    env: {
      MOCK_BRAIN_PORT: String(mockBrainPort),
      NEXT_TELEMETRY_DISABLED: '1',
      BRAIN_URL: `http://127.0.0.1:${mockBrainPort}`,
      ABUSE_HASH_KEY: 'playwright-only-abuse-hash-key-00000001',
      STAGING_SERVICE_TOKEN: 'playwright-server-only-staging-token',
    },
  },
  {
    command: `node node_modules/next/dist/bin/next dev --hostname 127.0.0.1 --port ${port}`,
    url: localBaseUrl,
    reuseExistingServer: Boolean(process.env.PLAYWRIGHT_REUSE_SERVER),
    timeout: 120_000,
    env: {
      MOCK_BRAIN_PORT: String(mockBrainPort),
      NEXT_TELEMETRY_DISABLED: '1',
      BRAIN_URL: `http://127.0.0.1:${mockBrainPort}`,
      ABUSE_HASH_KEY: 'playwright-only-abuse-hash-key-00000001',
      STAGING_SERVICE_TOKEN: 'playwright-server-only-staging-token',
    },
  },
];

export default defineConfig({
  testDir: './e2e',
  outputDir: 'test-results',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI
    ? [['line'], ['html', { outputFolder: 'playwright-report', open: 'never' }]]
    : [['line']],
  use: {
    baseURL,
    // Local machines can opt into an installed browser when Playwright's
    // downloaded Chromium is unavailable. CI keeps using the pinned browser.
    channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    // The installed Chrome path does not require Playwright's optional FFmpeg
    // download, which is useful on constrained local development machines.
    video: process.env.PLAYWRIGHT_CHANNEL ? 'off' : 'retain-on-failure',
  },
  webServer: process.env.PLAYWRIGHT_BASE_URL ? undefined : localWebServers,
  projects: [
    {
      name: 'desktop-chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'mobile-chromium',
      use: { ...devices['iPhone 13'], browserName: 'chromium' },
    },
  ],
});
