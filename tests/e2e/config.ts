import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from '@playwright/test';

export function repositoryRoot() {
  let root = process.cwd();
  while (!fs.existsSync(path.join(root, 'tests/e2e/server.py'))) {
    const parent = path.dirname(root);
    if (parent === root) throw new Error('Run browser tests from this repository');
    root = parent;
  }
  return root;
}

export function pythonExecutable() {
  const local = path.join(repositoryRoot(), '.venv/bin/python');
  return process.env.PYTHON || (fs.existsSync(local) ? local : 'python3');
}

export function domainConfig(domain: 'finance' | 'travel' | 'media' | 'town') {
  const root = repositoryRoot();
  const testDir = domain === 'finance' ? 'apps/finance/frontend/e2e'
    : domain === 'town' ? 'apps/web/e2e'
    : `apps/${domain}/e2e`;
  return defineConfig({
    testDir: path.join(root, testDir),
    ...(domain === 'town' ? { testMatch: /(?:pixels-(?:year|detail|life)|hub-pixels|world)\.spec\.ts/ } : {}),
    metadata: { domain },
    outputDir: path.join(root, 'test-results', domain),
    timeout: domain === 'finance' || domain === 'town' ? 60_000 : domain === 'travel' ? 45_000 : 30_000,
    // Files run concurrently; tests within each file retain their ordering.
    workers: 2,
    retries: 0,
    reporter: [['list'], ['html', { open: 'never', outputFolder: path.join(root, 'playwright-report', domain) }]],
    use: {
      reducedMotion: 'reduce',
      ...(domain === 'finance' || domain === 'town' ? { timezoneId: 'America/Los_Angeles' } : {}),
      trace: 'retain-on-failure', screenshot: 'only-on-failure',
      ...(domain === 'travel' ? { actionTimeout: 10_000, navigationTimeout: 15_000 } : {}),
      launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : undefined,
    },
  });
}
