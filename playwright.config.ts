import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: 'tests/browser',
  timeout: 30000,
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:5187',
    channel: 'chrome',
    headless: true,
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://127.0.0.1:5187',
    env: {
      PORT: '3187',
      VITE_PORT: '5187',
      VITE_API_PORT: '3187',
      PUBLIC_ORIGIN: 'http://127.0.0.1:5187',
      DATA_DIR: '.data/browser-tests',
    },
    reuseExistingServer: false,
    timeout: 60000,
  },
  reporter: 'list',
});
