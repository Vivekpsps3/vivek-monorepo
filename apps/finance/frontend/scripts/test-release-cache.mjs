import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const frontendRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const nginxConfig = join(frontendRoot, 'nginx.conf');
const fixtureRoot = await mkdtemp(join(tmpdir(), 'finance-release-cache-'));
const runId = `${process.pid}-${Date.now()}`;
const networkName = `finance-release-cache-${runId}`;
const apiName = `finance-release-api-${runId}`;
const webName = `finance-release-web-${runId}`;
const image = process.env.RELEASE_CACHE_NGINX_IMAGE ?? 'nginx:1.27-alpine';
let browser;
let port;

try {
  const htmlRoot = join(fixtureRoot, 'html');
  await mkdir(join(htmlRoot, 'assets'), { recursive: true });
  await writeFile(join(htmlRoot, 'assets/help.txt'), 'revalidate this file');
  await writeFile(join(htmlRoot, 'favicon.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>');
  await writeRelease(htmlRoot, 'release-a', 'AAAAAAAA', 'release-a');

  const apiConfig = join(fixtureRoot, 'api.conf');
  await writeFile(apiConfig, `server {
  listen 8000;
  location /api/ {
    default_type application/json;
    add_header Cache-Control "public, max-age=600" always;
    return 200 '{"source":"mock-api"}';
  }
}
`);

  port = await findFreePort();
  docker(['network', 'create', networkName]);
  docker([
    'run', '--detach', '--rm', '--name', apiName,
    '--network', networkName, '--network-alias', 'api',
    '--mount', `type=bind,source=${apiConfig},target=/etc/nginx/conf.d/default.conf,readonly`,
    image,
  ]);
  docker([
    'run', '--detach', '--rm', '--name', webName,
    '--network', networkName,
    '--publish', `127.0.0.1:${port}:80`,
    '--mount', `type=bind,source=${nginxConfig},target=/etc/nginx/conf.d/default.conf,readonly`,
    '--mount', `type=bind,source=${htmlRoot},target=/usr/share/nginx/html,readonly`,
    image,
  ]);

  const baseUrl = `http://127.0.0.1:${port}`;
  await waitForNginx(baseUrl);
  browser = await chromium.launch({
    headless: true,
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE }
      : {}),
  });
  const context = await browser.newContext();
  const page = await context.newPage();
  const loadedResponses = new Map();
  page.on('response', (response) => {
    const pathname = new URL(response.url()).pathname;
    if (pathname.endsWith('.js') || pathname.endsWith('.css')) loadedResponses.set(pathname, response);
  });

  const firstHtml = await page.goto(baseUrl, { waitUntil: 'load' });
  assert.equal(firstHtml?.status(), 200);
  assertNoStore(firstHtml?.headers()['cache-control'], 'initial index.html');
  assert.equal(firstHtml?.headers().etag, undefined, 'index.html must not expose an ETag shortcut');
  await page.waitForFunction(() => document.documentElement.dataset.loadedBuild === 'release-a');
  assert.equal(await page.locator('meta[name="app-release"]').getAttribute('content'), 'a'.repeat(64));
  assertImmutable(loadedResponses.get('/main-AAAAAAAA.js')?.headers()['cache-control'], 'hashed JavaScript');
  assertImmutable(loadedResponses.get('/styles-AAAAAAAA.css')?.headers()['cache-control'], 'hashed CSS');

  const versionResponse = await fetch(`${baseUrl}/version.json`);
  assert.equal(versionResponse.status, 200);
  assertNoStore(versionResponse.headers.get('cache-control'), 'version.json');
  assert.equal((await versionResponse.json()).release, 'a'.repeat(64));

  const routeResponse = await fetch(`${baseUrl}/planning`);
  assert.equal(routeResponse.status, 200, 'deep links should receive the application shell');
  assertNoStore(routeResponse.headers.get('cache-control'), 'SPA route');

  const unversionedResponse = await fetch(`${baseUrl}/assets/help.txt`);
  assert.equal(unversionedResponse.status, 200);
  assert.match(unversionedResponse.headers.get('cache-control') ?? '', /no-cache/);
  const faviconResponse = await fetch(`${baseUrl}/favicon.svg`);
  assert.equal(faviconResponse.status, 200);
  assert.match(faviconResponse.headers.get('cache-control') ?? '', /no-cache/);

  for (const path of ['/missing-cache-audit.js', '/missing-cache-audit.css', '/missing-cache-audit.js.map', '/assets/missing.svg']) {
    const missingResponse = await fetch(`${baseUrl}${path}`);
    assert.equal(missingResponse.status, 404, `${path} should return a genuine 404`);
    assertNoStore(missingResponse.headers.get('cache-control'), `missing asset ${path}`);
    assert.doesNotMatch(missingResponse.headers.get('content-type') ?? '', /text\/html/i, `${path} must not be served as the SPA page`);
    assert.doesNotMatch(await missingResponse.text(), /<app-root|<!doctype html/i, `${path} must not contain the application shell`);
  }

  const apiResponse = await page.evaluate(async () => {
    const response = await fetch('/api/health');
    return {
      status: response.status,
      cacheControl: response.headers.get('cache-control'),
      body: await response.json(),
    };
  });
  assert.equal(apiResponse.status, 200);
  assert.deepEqual(apiResponse.body, { source: 'mock-api' });
  assert.match(apiResponse.cacheControl ?? '', /no-store/);
  assert.match(apiResponse.cacheControl ?? '', /private/);
  assert.doesNotMatch(apiResponse.cacheControl ?? '', /max-age=600/, 'upstream cache policy must be hidden');

  await writeRelease(htmlRoot, 'release-b', 'BBBBBBBB', 'release-b');
  const secondHtml = await page.reload({ waitUntil: 'load' });
  assert.equal(secondHtml?.status(), 200);
  assertNoStore(secondHtml?.headers()['cache-control'], 'rollover index.html');
  await page.waitForFunction(() => document.documentElement.dataset.loadedBuild === 'release-b');
  assert.equal(await page.locator('meta[name="app-release"]').getAttribute('content'), 'b'.repeat(64));
  assertImmutable(loadedResponses.get('/main-BBBBBBBB.js')?.headers()['cache-control'], 'second release JavaScript');
  assertImmutable(loadedResponses.get('/styles-BBBBBBBB.css')?.headers()['cache-control'], 'second release CSS');

  await context.close();
  console.log('Real Nginx and cached-browser release rollover checks passed.');
} catch (error) {
  try {
    console.error(docker(['logs', webName], true));
  } catch {}
  throw error;
} finally {
  await browser?.close();
  docker(['rm', '--force', webName], true);
  docker(['rm', '--force', apiName], true);
  docker(['network', 'rm', networkName], true);
  await rm(fixtureRoot, { recursive: true, force: true });
}

async function writeRelease(htmlRoot, pageName, angularHash, buildName) {
  const release = buildName === 'release-a' ? 'a'.repeat(64) : 'b'.repeat(64);
  await writeFile(join(htmlRoot, `main-${angularHash}.js`), `document.documentElement.dataset.loadedBuild=${JSON.stringify(buildName)};`);
  await writeFile(join(htmlRoot, `styles-${angularHash}.css`), `body::after{content:${JSON.stringify(buildName)};}`);
  await writeFile(join(htmlRoot, 'version.json'), `${JSON.stringify({ release })}\n`);
  await writeFile(join(htmlRoot, 'index.html'), `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="app-release" content="${release}">
  <title>${pageName}</title>
  <link rel="stylesheet" href="/styles-${angularHash}.css">
  <script src="/main-${angularHash}.js" type="module"></script>
</head>
<body><app-root></app-root></body>
</html>
`);
}

function assertNoStore(value, label) {
  assert.match(value ?? '', /no-store/i, `${label} should be no-store`);
}

function assertImmutable(value, label) {
  assert.match(value ?? '', /immutable/i, `${label} should be immutable`);
  assert.match(value ?? '', /max-age=31536000/i, `${label} should receive a one-year cache lifetime`);
}

async function waitForNginx(baseUrl) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(baseUrl);
      if (response.ok) return;
    } catch {}
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 200));
  }
  throw new Error('Timed out waiting for isolated Nginx.');
}

async function findFreePort() {
  const server = createServer();
  await new Promise((resolvePromise, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolvePromise);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Could not allocate a local port.');
  await new Promise((resolvePromise, reject) => server.close((error) => error ? reject(error) : resolvePromise()));
  return address.port;
}

function docker(args, allowFailure = false) {
  try {
    return execFileSync('docker', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch (error) {
    if (allowFailure) return '';
    throw new Error(`docker ${args.join(' ')} failed:\n${error.stdout ?? ''}${error.stderr ?? ''}`);
  }
}
