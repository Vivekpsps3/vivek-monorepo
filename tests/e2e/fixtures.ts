import { spawn } from 'node:child_process';
import { test as base, expect } from '@playwright/test';
import { repositoryRoot, pythonExecutable } from './config';

/** Every worker owns a server, database, session and reset endpoint. */
export const test = base.extend<{}, { serverURL: string }>({
  serverURL: [async ({}, use, workerInfo) => {
    const domain = workerInfo.project.metadata.domain;
    if (!['finance', 'travel', 'media', 'town'].includes(domain)) {
      throw new Error('Browser projects must declare metadata.domain');
    }
    // Explicit external Finance servers remain useful for local debugging.
    if (domain === 'finance' && process.env.E2E_SKIP_WEB_SERVER) {
      if (workerInfo.config.workers !== 1) throw new Error('External servers require --workers=1');
      await use(process.env.E2E_BASE_URL || `http://127.0.0.1:${process.env.E2E_PORT || process.env.USERNAME_E2E_PORT || '4173'}`);
      return;
    }
    let output = '';
    let origin = '';
    const server = spawn(pythonExecutable(), ['tests/e2e/server.py', '--suite', domain, '--port', '0'], {
      cwd: repositoryRoot(),
      env: { ...process.env, PYTHONPATH: repositoryRoot() },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const exited = new Promise<void>(resolve => server.once('close', () => resolve()));
    const record = (data: Buffer) => {
      output = (output + data.toString()).slice(-32_768);
      const match = output.match(/E2E_SERVER_URL=(http:\/\/127\.0\.0\.1:\d+)/);
      if (match) origin = match[1];
    };
    server.stdout.on('data', record);
    server.stderr.on('data', record);
    let spawnError: Error | undefined;
    server.on('error', error => { spawnError = error; });
    try {
      await expect.poll(async () => {
        if (spawnError) throw spawnError;
        if (server.exitCode !== null || server.signalCode !== null) throw new Error(`Browser server exited: ${output}`);
        if (!origin) return false;
        const health = domain === 'finance' || domain === 'town' ? '/api/health' : `/${domain}/api/health`;
        return fetch(origin + health, { signal: AbortSignal.timeout(1000) }).then(r => r.ok).catch(() => false);
      }, { timeout: 45_000, message: `Start isolated ${domain} server` }).toBe(true);
      await use(origin + (domain === 'travel' ? '/travel/' : ''));
    } catch (error) {
      console.error(output);
      throw error;
    } finally {
      if (server.pid && server.exitCode === null && server.signalCode === null) {
        server.kill('SIGTERM');
        const kill = setTimeout(() => server.kill('SIGKILL'), 5000);
        await exited;
        clearTimeout(kill);
      }
    }
  }, { scope: 'worker', timeout: 60_000 }],
  baseURL: async ({ serverURL }, use) => { await use(serverURL); },
});

export { expect };
export type { APIRequestContext, Locator, Page, TestInfo } from '@playwright/test';
