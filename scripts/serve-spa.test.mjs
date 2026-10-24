import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import http from 'node:http';
import { createSpaServer } from './serve-spa.mjs';

test('mounted bundle falls back only for extensionless routes', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'spa-'));
  fs.writeFileSync(path.join(root, 'index.html'), '<html>app</html>');
  fs.writeFileSync(path.join(root, 'main.js'), 'console.log(1)');
  const server = createSpaServer(root, { mount: '/finance' });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const get = pathname => fetch(`http://127.0.0.1:${port}${pathname}`);
  try {
    const home = await get('/finance/');
    assert.equal(home.status, 200);
    assert.match(await home.text(), /app/);

    const route = await get('/finance/spending');
    assert.equal(route.status, 200);
    assert.match(await route.text(), /app/);

    const hub = await get('/hub');
    assert.equal(hub.status, 200);
    assert.match(await hub.text(), /app/);

    const auth = await get('/auth/login');
    assert.equal(auth.status, 200);

    const script = await get('/finance/main.js');
    assert.equal(script.status, 200);
    assert.match(await script.text(), /console/);

    const missingScript = await get('/finance/missing.js');
    assert.equal(missingScript.status, 404);
    assert.equal(await missingScript.text(), 'Not found');

    const missingStyle = await get('/finance/missing.css');
    assert.equal(missingStyle.status, 404);

    const outside = await get('/login');
    assert.equal(outside.status, 404);

    const badEscape = await get('/finance/%E0');
    assert.equal(badEscape.status, 400);
    assert.equal(await badEscape.text(), 'Bad request');
  } finally {
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('api paths proxy to the finance server when a target is set', async () => {
  const upstream = http.createServer((request, response) => {
    const chunks = [];
    request.on('data', chunk => chunks.push(chunk));
    request.on('end', () => {
      response.writeHead(201, { 'content-type': 'application/json', 'x-upstream': 'yes' });
      response.end(JSON.stringify({ path: request.url, body: Buffer.concat(chunks).toString() }));
    });
  });
  await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve));
  const { port: apiPort } = upstream.address();
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'spa-proxy-'));
  fs.writeFileSync(path.join(root, 'index.html'), '<html>app</html>');
  const server = createSpaServer(root, { mount: '/finance', apiProxy: `http://127.0.0.1:${apiPort}` });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  try {
    const page = await fetch(`http://127.0.0.1:${port}/hub`);
    assert.equal(page.status, 200);
    const api = await fetch(`http://127.0.0.1:${port}/api/auth/passwordless/challenge`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'ada' }),
    });
    assert.equal(api.status, 201);
    assert.equal(api.headers.get('x-upstream'), 'yes');
    assert.deepEqual(await api.json(), {
      path: '/api/auth/passwordless/challenge',
      body: JSON.stringify({ username: 'ada' }),
    });
  } finally {
    await new Promise(resolve => server.close(resolve));
    await new Promise(resolve => upstream.close(resolve));
    fs.rmSync(root, { recursive: true, force: true });
  }
});
