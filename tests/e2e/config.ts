import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from '@playwright/test';

export function domainConfig(domain: 'finance' | 'travel' | 'media') {
  let root = process.cwd();
  while (!fs.existsSync(path.join(root, 'tests/e2e/server.py'))) {
    const parent = path.dirname(root);
    if (parent === root) throw new Error('Run browser tests from this repository');
    root = parent;
  }
  const python = process.env.PYTHON || (fs.existsSync(path.join(root, '.venv/bin/python')) ? path.join(root, '.venv/bin/python') : 'python3');
  const port = domain === 'finance' ? process.env.E2E_PORT || process.env.USERNAME_E2E_PORT || '4173'
    : domain === 'travel' ? process.env.TRAVEL_E2E_PORT || '8098' : process.env.MEDIA_E2E_PORT || '8097';
  const testDir = domain === 'finance' ? 'apps/finance/frontend/e2e' : `apps/${domain}/e2e`;
  return defineConfig({
    testDir: path.join(root, testDir),
    outputDir: path.join(root, 'test-results', domain),
    timeout: domain === 'finance' ? 60_000 : domain === 'travel' ? 45_000 : 30_000,
    workers: 1,
    retries: 0,
    reporter: [['list'], ['html', { open: 'never', outputFolder: path.join(root, 'playwright-report', domain) }]],
    use: {
      baseURL: domain === 'finance' && process.env.E2E_BASE_URL ? process.env.E2E_BASE_URL : `http://127.0.0.1:${port}${domain === 'travel' ? '/travel/' : ''}`,
      trace: 'retain-on-failure', screenshot: 'only-on-failure',
      ...(domain === 'travel' ? { reducedMotion: 'reduce' as const, actionTimeout: 10_000, navigationTimeout: 15_000 } : {}),
      launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : undefined,
    },
    webServer: domain === 'finance' && process.env.E2E_SKIP_WEB_SERVER ? undefined : {
      command: `"${python}" tests/e2e/server.py --suite ${domain} --port ${port}`,
      cwd: root, url: `http://127.0.0.1:${port}/${domain === 'finance' ? '' : domain + '/'}api/health`,
      reuseExistingServer: false, timeout: 60_000,
      env: { ...process.env, PYTHONPATH: root },
    },
  });
}
