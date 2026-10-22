import { defineConfig } from '@playwright/test';

const dist = process.env.E2E_DIST;
const port = process.env.E2E_PORT ?? '4173';
const builtUrl = `http://127.0.0.1:${port}/finance/`;

/**
 * `npm run e2e` drives the dev server at `/`. `make e2e` and CI set E2E_DIST
 * and serve the production bundle at `/finance/`, the same base href as the image.
 * /hub and /auth stay outside that prefix.
 */
export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? (dist ? builtUrl : 'http://127.0.0.1:4200'),
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE }
      : undefined,
  },
  webServer: process.env.E2E_SKIP_WEB_SERVER
    ? undefined
    : dist
      ? {
          command: `node ../../../scripts/serve-spa.mjs ${dist} ${port} /finance`,
          url: builtUrl,
          // A server left over from a / build would serve this bundle's scripts as HTML.
          reuseExistingServer: false,
          timeout: 30_000,
        }
      : {
          command: 'npm run start -- --prebundle=false --hmr=false --live-reload=false',
          url: 'http://127.0.0.1:4200',
          reuseExistingServer: true,
          timeout: 120_000,
        },
});
