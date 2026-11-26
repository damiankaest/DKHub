import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  // Tests start as returning visitors so the first-run tour stays out of the way; tour.spec.js opts out.
  use: { baseURL: 'http://127.0.0.1:4173', storageState: { cookies: [], origins: [{ origin: 'http://127.0.0.1:4173', localStorage: [{ name: 'dkhub-tour', value: 'done' }] }] } },
  webServer: { command: 'npm run dev -- --host 127.0.0.1 --port 4173 --strictPort', url: 'http://127.0.0.1:4173', timeout: 30_000 },
});
