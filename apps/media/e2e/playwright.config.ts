import { defineConfig } from '@playwright/test';

const port = process.env.MEDIA_E2E_PORT || '8097';

export default defineConfig({
  testDir: '.',
  timeout: 30_000,
  retries: 0,
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    channel: 'chrome',
  },
  webServer: {
    command: `PYTHONPATH="${process.cwd()}" MEDIA_E2E_PORT=${port} ${process.cwd()}/.venv/bin/python -m apps.media.backend.e2e_server`,
    cwd: process.cwd(),
    url: `http://127.0.0.1:${port}/media/api/health`,
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
