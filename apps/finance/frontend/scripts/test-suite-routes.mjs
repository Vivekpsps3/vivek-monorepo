import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const frontendRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const suiteConfig = join(frontendRoot, 'nginx.suite.conf');
const fixtureRoot = await mkdtemp(join(tmpdir(), 'finance-suite-routes-'));
const runId = `${process.pid}-${Date.now()}`;
const networkName = `finance-suite-${runId}`;
const apiName = `finance-suite-api-${runId}`;
const travelName = `finance-suite-travel-${runId}`;
const mediaName = `finance-suite-media-${runId}`;
const webName = `finance-suite-web-${runId}`;
const image = process.env.RELEASE_CACHE_NGINX_IMAGE ?? 'nginx:1.27-alpine';

try {
  const htmlRoot = join(fixtureRoot, 'html');
  const financeRoot = join(htmlRoot, 'finance');
  await mkdir(join(financeRoot, 'assets'), { recursive: true });
  await writeFile(join(htmlRoot, 'index.html'), await readFile(join(frontendRoot, 'suite-index.html')));
  await writeFile(join(financeRoot, 'index.html'), '<!doctype html><html><body><app-root></app-root></body></html>\n');
  await writeFile(join(financeRoot, 'main-AAAAAAAA.js'), 'console.log("finance");\n');
  await writeFile(join(financeRoot, 'version.json'), '{"release":"abc"}\n');
  await writeFile(join(financeRoot, 'assets/help.txt'), 'revalidate this file\n');
  await writeFile(join(financeRoot, 'favicon.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>\n');

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
  const travelConfig = join(fixtureRoot, 'travel.conf');
  await writeFile(travelConfig, `server {
  listen 8000;
  location = /api/health {
    default_type application/json;
    return 200 '{"status":"ok","app":"travel"}';
  }
  location = /static/app.js {
    default_type application/javascript;
    return 200 'console.log("travel");';
  }
  location / {
    default_type text/plain;
    return 200 'travel-root';
  }
}
`);

  const port = await findFreePort();
  docker(['network', 'create', networkName]);
  docker([
    'run', '--detach', '--rm', '--name', apiName,
    '--network', networkName, '--network-alias', 'api',
    '--mount', `type=bind,source=${apiConfig},target=/etc/nginx/conf.d/default.conf,readonly`,
    image,
  ]);
  docker([
    'run', '--detach', '--rm', '--name', travelName,
    '--network', networkName, '--network-alias', 'travel',
    '--mount', `type=bind,source=${travelConfig},target=/etc/nginx/conf.d/default.conf,readonly`,
    image,
  ]);
  const mediaConfig = join(fixtureRoot, 'media.conf');
  await writeFile(mediaConfig, `server {
  listen 8000;
  location = /api/health {
    default_type application/json;
    return 200 '{"status":"ok","app":"media"}';
  }
  location / {
    default_type text/plain;
    return 200 'media-root';
  }
}
`);
  docker([
    'run', '--detach', '--rm', '--name', mediaName,
    '--network', networkName, '--network-alias', 'media',
    '--mount', `type=bind,source=${mediaConfig},target=/etc/nginx/conf.d/default.conf,readonly`,
    image,
  ]);
  docker([
    'run', '--detach', '--rm', '--name', webName,
    '--network', networkName,
    '--publish', `127.0.0.1:${port}:80`,
    '--mount', `type=bind,source=${suiteConfig},target=/etc/nginx/conf.d/default.conf,readonly`,
    '--mount', `type=bind,source=${htmlRoot},target=/usr/share/nginx/html,readonly`,
    image,
  ]);

  const baseUrl = `http://127.0.0.1:${port}`;
  await waitForOk(`${baseUrl}/`);

  const root = await fetch(`${baseUrl}/`);
  assert.equal(root.status, 200);
  assert.match(await root.text(), /\/hub/);
  assert.match(root.headers.get('cache-control') ?? '', /no-store/);

  const oldBookmark = await fetch(`${baseUrl}/have`, { redirect: 'manual' });
  assert.equal(oldBookmark.status, 302);
  assert.equal(oldBookmark.headers.get('location'), '/finance/have');

  const sharedLogin = await fetch(`${baseUrl}/auth/login?next=%2Ftravel%2F`);
  assert.equal(sharedLogin.status, 200);
  assert.match(sharedLogin.headers.get('content-type') ?? '', /text\/html/);
  assert.match(await sharedLogin.text(), /<app-root>/);
  assert.match(sharedLogin.headers.get('cache-control') ?? '', /no-store/);

  const sharedSignup = await fetch(`${baseUrl}/auth/signup`);
  assert.equal(sharedSignup.status, 200);
  assert.match(await sharedSignup.text(), /<app-root>/);

  const financeLogin = await fetch(`${baseUrl}/finance/login?next=%2Ftravel%2F`, { redirect: 'manual' });
  assert.equal(financeLogin.status, 302);
  assert.equal(financeLogin.headers.get('location'), '/auth/login?next=%2Ftravel%2F');

  const prefixedLogin = await fetch(`${baseUrl}/finance/auth/login?next=%2Ftravel%2F`, { redirect: 'manual' });
  assert.equal(prefixedLogin.status, 302);
  assert.equal(prefixedLogin.headers.get('location'), '/auth/login?next=%2Ftravel%2F');

  const financeHome = await fetch(`${baseUrl}/finance/have`);
  assert.equal(financeHome.status, 200);
  assert.match(await financeHome.text(), /<app-root>/);
  assert.match(financeHome.headers.get('cache-control') ?? '', /no-store/);

  const hashed = await fetch(`${baseUrl}/finance/main-AAAAAAAA.js`);
  assert.equal(hashed.status, 200);
  assert.match(hashed.headers.get('cache-control') ?? '', /immutable/);
  assert.match(hashed.headers.get('cache-control') ?? '', /max-age=31536000/);

  const version = await fetch(`${baseUrl}/finance/version.json`);
  assert.equal(version.status, 200);
  assert.equal((await version.json()).release, 'abc');
  assert.match(version.headers.get('cache-control') ?? '', /no-store/);

  const missing = await fetch(`${baseUrl}/finance/missing-suite.js`);
  assert.equal(missing.status, 404);
  assert.doesNotMatch(missing.headers.get('content-type') ?? '', /text\/html/i);
  assert.doesNotMatch(await missing.text(), /<app-root|<!doctype html/i);

  const api = await fetch(`${baseUrl}/api/health`);
  assert.equal(api.status, 200);
  assert.deepEqual(await api.json(), { source: 'mock-api' });
  assert.match(api.headers.get('cache-control') ?? '', /no-store/);
  assert.match(api.headers.get('cache-control') ?? '', /private/);
  assert.doesNotMatch(api.headers.get('cache-control') ?? '', /max-age=600/);

  const financeApi = await fetch(`${baseUrl}/finance/api/health`);
  assert.equal(financeApi.status, 200);
  assert.deepEqual(await financeApi.json(), { source: 'mock-api' });

  const travelSlash = await fetch(`${baseUrl}/travel`, { redirect: 'manual' });
  assert.equal(travelSlash.status, 301);
  assert.equal(travelSlash.headers.get('location'), '/travel/');

  const travelHome = await fetch(`${baseUrl}/travel/`);
  assert.equal(travelHome.status, 200);
  assert.equal(await travelHome.text(), 'travel-root');

  const travelHealth = await fetch(`${baseUrl}/travel/api/health`);
  assert.equal(travelHealth.status, 200);
  assert.deepEqual(await travelHealth.json(), { status: 'ok', app: 'travel' });

  const travelScript = await fetch(`${baseUrl}/travel/static/app.js`);
  assert.equal(travelScript.status, 200);
  assert.match(await travelScript.text(), /console\.log\("travel"\)/);

  const hub = await fetch(`${baseUrl}/hub`);
  assert.equal(hub.status, 200);
  assert.match(await hub.text(), /<app-root>/);
  assert.match(hub.headers.get('cache-control') ?? '', /no-store/);

  const hubAdmin = await fetch(`${baseUrl}/hub/admin`);
  assert.equal(hubAdmin.status, 200);
  assert.match(await hubAdmin.text(), /<app-root>/);
  assert.match(hubAdmin.headers.get('cache-control') ?? '', /no-store/);

  for (const stale of ['/admin', '/admin/users', '/finance/admin', '/finance/admin/users']) {
    const redirected = await fetch(`${baseUrl}${stale}`, { redirect: 'manual' });
    assert.equal(redirected.status, 302, stale);
    assert.equal(redirected.headers.get('location'), '/hub/admin', stale);
  }

  const mediaHome = await fetch(`${baseUrl}/media/`);
  assert.equal(mediaHome.status, 200);
  assert.equal(await mediaHome.text(), 'media-root');

  const mediaHealth = await fetch(`${baseUrl}/media/api/health`);
  assert.equal(mediaHealth.status, 200);
  assert.deepEqual(await mediaHealth.json(), { status: 'ok', app: 'media' });

  console.log('suite routes: OK');
} finally {
  docker(['rm', '--force', webName, mediaName, travelName, apiName], true);
  docker(['network', 'rm', networkName], true);
  await rm(fixtureRoot, { recursive: true, force: true });
}

async function waitForOk(url) {
  const deadline = Date.now() + 15_000;
  let lastError = 'not started';
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 200));
  }
  throw new Error(`Timed out waiting for suite nginx: ${lastError}`);
}

async function findFreePort() {
  const server = createServer();
  await new Promise((resolvePromise, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolvePromise);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Could not allocate a local port.');
  await new Promise((resolvePromise, reject) => server.close((error) => (error ? reject(error) : resolvePromise())));
  return address.port;
}

function docker(args, allowFailure = false) {
  try {
    return execFileSync('docker', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch (error) {
    if (allowFailure) return '';
    const stdout = error.stdout ?? '';
    const stderr = error.stderr ?? '';
    throw new Error(`docker ${args.join(' ')} failed:\n${stdout}${stderr}`);
  }
}
