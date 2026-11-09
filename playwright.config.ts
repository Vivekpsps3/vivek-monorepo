import path from 'node:path';
import { defineConfig } from '@playwright/test';
import { domainConfig } from './tests/e2e/config';
import { intendedProjects } from './tests/e2e/discovery.mjs';

const domains = {
  finance: domainConfig('finance'),
  travel: domainConfig('travel'),
  media: domainConfig('media'),
  town: domainConfig('town'),
};

// The same project definitions serve both individual app commands and CI.
// Worker fixtures start only the servers required by selected projects.
export default defineConfig({
  workers: 4,
  retries: 0,
  timeout: 60_000,
  outputDir: 'test-results/suite',
  reporter: [['list'], ['html', { outputFolder: 'playwright-report/suite', open: 'never' }]],
  projects: intendedProjects.map((project) => {
    const source = domains[project.domain || project.useDomain];
    return {
      name: project.name,
      testDir: project.domain ? source.testDir : path.resolve(project.testDir),
      use: source.use,
      metadata: source.metadata,
      ...(source.testMatch ? { testMatch: source.testMatch } : {}),
      ...(project.domain ? { timeout: source.timeout } : {}),
    };
  }),
});
