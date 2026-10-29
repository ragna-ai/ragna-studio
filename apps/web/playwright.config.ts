import { defineConfig, devices } from '@playwright/test';

const WEB_PORT = 3100;
const API_PORT = 3110;
const WEB_URL = `http://localhost:${WEB_PORT}`;
const API_URL = `http://localhost:${API_PORT}`;

export const STORAGE_STATE_PATH = 'e2e/.auth/storage-state.json';

export default defineConfig({
  testDir: 'e2e',
  workers: 1,
  forbidOnly: !!process.env.CI,
  failOnFlakyTests: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: WEB_URL,
    locale: 'en-GB',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      name: 'chromium',
      testMatch: /.*\.spec\.ts/,
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'], storageState: STORAGE_STATE_PATH },
    },
  ],
  webServer: [
    {
      command: 'pnpm --filter @repo/api serve:e2e',
      url: `${API_URL}/health`,
      env: {
        API_PORT: String(API_PORT),
        API_BASE_URL: API_URL,
        APP_URL: WEB_URL,
      },
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: 'pnpm exec nuxt build && node .output/server/index.mjs',
      url: WEB_URL,
      env: { PORT: String(WEB_PORT), NUXT_PUBLIC_API_BASE_URL: API_URL },
      reuseExistingServer: false,
      timeout: 240_000,
    },
  ],
});
