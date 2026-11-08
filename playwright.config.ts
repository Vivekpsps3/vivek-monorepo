import path from 'node:path';
import { defineConfig } from '@playwright/test';
import { domainConfig } from './tests/e2e/config';
const finance = domainConfig('finance'), travel = domainConfig('travel'), media = domainConfig('media'), town = domainConfig('town');

// The same project definitions serve both individual app commands and CI.
// Worker fixtures start only the servers required by selected projects.
export default defineConfig({
  workers: 4,
  retries: 0,
  timeout: 60_000,
  outputDir: 'test-results/suite',
  reporter: [['list'], ['html', { outputFolder: 'playwright-report/suite', open: 'never' }]],
  projects: [
    { name: 'finance', testDir: finance.testDir, use: finance.use, metadata: finance.metadata, timeout: finance.timeout },
    { name: 'travel', testDir: travel.testDir, use: travel.use, metadata: travel.metadata, timeout: travel.timeout },
    { name: 'media', testDir: media.testDir, use: media.use, metadata: media.metadata, timeout: media.timeout },
    { name: 'town', testDir: town.testDir, testMatch: town.testMatch, use: town.use, metadata: town.metadata, timeout: town.timeout },
    { name: 'suite', testDir: path.resolve('tests/e2e'), use: media.use, metadata: media.metadata },
  ],
});
