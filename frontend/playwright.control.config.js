import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir:'./integration',
  outputDir:'./test-results/control',
  // Start as a returning visitor; the first-run tour has its own spec.
  use:{storageState:{cookies:[],origins:[{origin:'http://127.0.0.1:4188',localStorage:[{name:'dkhub-tour',value:'done'}]}]},baseURL:'http://127.0.0.1:4188',channel:'chromium',launchOptions:{args:['--enable-features=WebMCP']}},
  webServer:{command:'python integration/jev_server.py',url:'http://127.0.0.1:4188/api/apps',timeout:30_000},
});
