import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from '@playwright/test';

export function domainConfig(domain: 'finance' | 'travel' | 'media' | 'town') {
  let root = process.cwd();
  while (!fs.existsSync(path.join(root, 'tests/e2e/server.py'))) {
    const parent = path.dirname(root);
    if (parent === root) throw new Error('Run browser tests from this repository');
    root = parent;
  }
  const python = process.env.PYTHON || (fs.existsSync(path.join(root, '.venv/bin/python')) ? path.join(root, '.venv/bin/python') : 'python3');
  const port = domain === 'finance' ? process.env.E2E_PORT || process.env.USERNAME_E2E_PORT || '4173'
    : domain === 'travel' ? process.env.TRAVEL_E2E_PORT || '8098'
    : domain === 'media' ? process.env.MEDIA_E2E_PORT || '8097'
    : process.env.TOWN_E2E_PORT || '8096';
  const testDir = domain === 'finance' ? 'apps/finance/frontend/e2e'
    : domain === 'town' ? 'apps/web/e2e'
    : `apps/${domain}/e2e`;
  return defineConfig({
    testDir: path.join(root, testDir),
    ...(domain === 'town' ? { testMatch: /(?:pixels-(?:year|detail|life)|hub-pixels|world)\.spec\.ts/ } : {}),
    outputDir: path.join(root, 'test-results', domain),
    timeout: domain === 'finance' || domain === 'town' ? 60_000 : domain === 'travel' ? 45_000 : 30_000,
    workers: 1,
    retries: 0,
    reporter: [['list'], ['html', { open: 'never', outputFolder: path.join(root, 'playwright-report', domain) }]],
    use: {
      ...(domain === 'finance' || domain === 'town' ? { timezoneId: 'America/Los_Angeles', reducedMotion: 'reduce' as const } : {}),
      baseURL: domain === 'finance' && process.env.E2E_BASE_URL ? process.env.E2E_BASE_URL : `http://127.0.0.1:${port}${domain === 'travel' ? '/travel/' : ''}`,
      trace: 'retain-on-failure', screenshot: 'only-on-failure',
      ...(domain === 'travel' ? { reducedMotion: 'reduce' as const, actionTimeout: 10_000, navigationTimeout: 15_000 } : {}),
      launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : undefined,
    },
    webServer: domain === 'finance' && process.env.E2E_SKIP_WEB_SERVER ? undefined : {
      command: `"${python}" tests/e2e/server.py --suite ${domain} --port ${port}`,
      cwd: root, url: `http://127.0.0.1:${port}/${domain === 'finance' || domain === 'town' ? '' : domain + '/'}api/health`,
      // Local runs reuse a server already listening on the domain port (e.g.
      // a `make dev` stack) instead of booting a second disposable one.
      // CI always boots its own: reuse there could mask a broken server
      // startup, so it stays off when CI is set.
      reuseExistingServer: !process.env.CI, timeout: 60_000,
      env: { ...process.env, PYTHONPATH: root },
    },
  });
}
