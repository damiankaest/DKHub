import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir:'./integration',
  outputDir:'./test-results/control',
  use:{baseURL:'http://127.0.0.1:4188',channel:'chromium',launchOptions:{args:['--enable-features=WebMCP']}},
  webServer:{command:'python integration/jev_server.py',url:'http://127.0.0.1:4188/api/apps',timeout:30_000},
});
