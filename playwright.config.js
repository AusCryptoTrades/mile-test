const { defineConfig, devices } = require('@playwright/test');
const chromiumOptions = process.env.MILE_CHROMIUM_EXECUTABLE
  ? { launchOptions: { executablePath: process.env.MILE_CHROMIUM_EXECUTABLE } }
  : {};
module.exports = defineConfig({
 testDir: './tests',
 timeout: 30000,
 expect: { timeout: 8000 },
 retries: process.env.CI ? 1 : 0,
 workers: process.env.CI ? 2 : undefined,
 failOnFlakyTests: !!process.env.CI,
 reporter: process.env.CI ? [['list'],['html',{open:'never'}]] : 'list',
 use: { baseURL:'http://127.0.0.1:4173', trace:'retain-on-failure', screenshot:'only-on-failure' },
 projects: [
  { name:'desktop-chromium', use:{...devices['Desktop Chrome'], ...chromiumOptions, viewport:{width:1440,height:900}} },
  { name:'mobile-webkit', use:{...devices['iPhone 13'], browserName:'webkit'} },
  { name:'mobile-chromium', use:{...devices['Pixel 7'], ...chromiumOptions, browserName:'chromium'} }
 ],
 webServer: { command:'python3 -m http.server 4173 --bind 127.0.0.1',url:'http://127.0.0.1:4173/index.html',reuseExistingServer:!process.env.CI,timeout:20000 }
});
