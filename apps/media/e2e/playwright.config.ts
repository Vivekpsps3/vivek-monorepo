import fs from 'node:fs';
import path from 'node:path';

import { defineConfig } from '@playwright/test';

const port = process.env.MEDIA_E2E_PORT || '8097';
const root = process.cwd();
const venvPython = path.join(root, '.venv/bin/python');
const python = process.env.PYTHON || (fs.existsSync(venvPython) ? venvPython : 'python');

export default defineConfig({
  testDir: '.',
  timeout: 30_000,
  retries: 0,
  workers: 1,
  use: {
    baseURL: `http://127.0.0.1:${port}`,
  },
  webServer: {
    command: `PYTHONPATH="${root}" MEDIA_E2E_PORT=${port} "${python}" -m apps.media.e2e.server`,
    cwd: root,
    url: `http://127.0.0.1:${port}/media/api/health`,
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
