import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function read(relative) {
  return fs.readFileSync(path.join(root, relative), 'utf8');
}

function routeTables(dir) {
  const found = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...routeTables(full));
    else if (/routes/i.test(entry.name) && entry.name.endsWith('.ts')) {
      found.push(path.relative(root, full));
    }
  }
  return found;
}

test('public home is composed by the one client route table', () => {
  assert.equal(fs.existsSync(path.join(root, 'apps/web')), false);
  assert.equal(fs.existsSync(path.join(root, 'apps/site/src/app/app.routes.server.ts')), false);
  assert.deepEqual(routeTables(path.join(root, 'apps/site/src')), ['apps/site/src/app/app.routes.ts']);

  const main = read('apps/site/src/main.ts');
  assert.equal(main.match(/bootstrapApplication\(/g).length, 1);
  assert.match(main, /bootstrapApplication\(AppComponent, appConfig\)/);

  const config = read('apps/site/src/app/app.config.ts');
  assert.match(config, /from '\.\/app\.routes'/);
  assert.equal(config.match(/provideRouter\(/g).length, 1);

  const routes = read('apps/site/src/app/app.routes.ts');
  assert.match(routes, /HomeComponent/);
  assert.match(routes, /path: 'home',\s*component: HomeComponent/);
  assert.equal(read('apps/site/src/app/app.component.html').match(/<router-outlet\s*\/>/g).length, 1);
});

test('travel renders from the module entry, not a second bootstrap', () => {
  assert.equal(fs.existsSync(path.join(root, 'apps/travel/backend/static/app.js')), false);
  const html = read('apps/travel/backend/static/index.html');
  const scripts = [...html.matchAll(/<script type="module" src="([^"]+)"><\/script>/g)].map(match => match[1]);
  assert.deepEqual(scripts, ['__TRAVEL_ROOT__/static/modules/app.mjs']);
  const app = read('apps/travel/backend/static/modules/app.mjs');
  assert.equal(app.match(/\bboot\(\)/g).length, 2);
  assert.match(app, /import \{ render, paint \} from "\.\/router\.mjs"/);
  assert.match(app, /\nboot\(\);\n$/);
});
