import path from 'node:path';
import { defineConfig } from '@playwright/test';
import { domainConfig } from './tests/e2e/config';
const finance = domainConfig('finance'), travel = domainConfig('travel'), media = domainConfig('media');

// One command and production harness, with domain-specific fixture databases.
// Keep one worker: account/setup and domain-reset stories intentionally share
// each project's disposable server. CI may run the domain wrapper configs apart.
export default defineConfig({
  workers: 1,
  retries: 0,
  timeout: 60_000,
  outputDir: 'test-results/suite',
  reporter: [['list'], ['html', { outputFolder: 'playwright-report/suite', open: 'never' }]],
  webServer: [finance.webServer!, travel.webServer!, media.webServer!].flat(),
  projects: [
    { name: 'finance', testDir: path.resolve('apps/finance/frontend/e2e'), use: finance.use },
    { name: 'travel', testDir: path.resolve('apps/travel/e2e'), use: travel.use },
    { name: 'media', testDir: path.resolve('apps/media/e2e'), use: media.use },
    { name: 'suite', testDir: path.resolve('tests/e2e'), use: media.use },
  ],
});
