import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
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
