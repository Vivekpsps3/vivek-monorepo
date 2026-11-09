import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { intendedProjects, ownedExclusions, townTestMatch } from '../tests/e2e/discovery.mjs';
import { evaluateDiscovery, formatReport, selects } from './check-e2e-discovery.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function withTree(files, run) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ver02-discovery-'));
  try {
    for (const [relative, body] of Object.entries(files)) {
      const full = path.join(root, relative);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, body);
    }
    return run(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

test('LOCAL1: a spec outside the active selector fails with project and path', () => {
  const report = withTree({
    'apps/web/e2e/orphan-journey.spec.ts': 'test("hidden", () => {});\n',
    'apps/web/e2e/pixels-year.spec.ts': 'test("year", () => {});\n',
  }, (root) => evaluateDiscovery({
    root,
    projects: [{ name: 'town', testDir: 'apps/web/e2e', testMatch: townTestMatch }],
    exclusions: [],
  }));
  assert.equal(report.ok, false);
  const text = report.errors.join('\n');
  assert.match(text, /orphan spec outside active selector: project=town path=apps\/web\/e2e\/orphan-journey\.spec\.ts/);
  assert.doesNotMatch(`${text}\n${formatReport(report)}`, /\bpassed\b/i);
});

test('LOCAL2: an intended project that discovers zero tests fails', () => {
  const report = withTree({}, (root) => evaluateDiscovery({
    root,
    projects: [{ name: 'vacant', testDir: 'apps/vacant/e2e' }],
    exclusions: [],
  }));
  assert.equal(report.ok, false);
  assert.match(report.errors.join('\n'), /intended project vacant discovered zero tests/);
  assert.doesNotMatch(formatReport(report), /\bpassed\b/i);
});

test('LOCAL3: an exclusion with no owner fails', () => {
  const report = withTree({
    'apps/web/e2e/town.spec.ts': 'test.fixme(true, "pending");\n',
    'apps/web/e2e/pixels-year.spec.ts': 'test("year", () => {});\n',
  }, (root) => evaluateDiscovery({
    root,
    projects: [{ name: 'town', testDir: 'apps/web/e2e', testMatch: townTestMatch }],
    exclusions: [{ project: 'town', file: 'apps/web/e2e/town.spec.ts', owner: '', issue: '', reason: 'pending owner' }],
  }));
  assert.equal(report.ok, false);
  assert.match(report.errors.join('\n'), /exclusion has no owner: project=town path=apps\/web\/e2e\/town\.spec\.ts/);
  assert.equal(report.notes.length, 0);
});

test('an exclusion with an owner and no reason fails', () => {
  const report = withTree({
    'apps/web/e2e/town.spec.ts': 'test("pending", () => {});\n',
    'apps/web/e2e/world.spec.ts': 'test("world", () => {});\n',
  }, (root) => evaluateDiscovery({
    root,
    projects: [{ name: 'town', testDir: 'apps/web/e2e', testMatch: townTestMatch }],
    exclusions: [{ project: 'town', file: 'apps/web/e2e/town.spec.ts', owner: 'TOWN-01', issue: '#249', reason: '  ' }],
  }));
  assert.match(report.errors.join('\n'), /exclusion has no reason: project=town path=apps\/web\/e2e\/town\.spec\.ts/);
});

test('an owned omission is not-run and a selected file stays listed', () => {
  const report = withTree({
    'apps/web/e2e/town.spec.ts': 'test.fixme(true, "pending");\n',
    'apps/web/e2e/pixels-year.spec.ts': 'test("year", () => {});\n',
  }, (root) => evaluateDiscovery({
    root,
    projects: [{ name: 'town', testDir: 'apps/web/e2e', testMatch: townTestMatch }],
    exclusions: [{
      project: 'town',
      file: 'apps/web/e2e/town.spec.ts',
      owner: 'TOWN-01',
      issue: '#249',
      reason: 'Waiting for TOWN-01.',
    }],
  }));
  assert.equal(report.ok, true, report.errors.join('\n'));
  assert.deepEqual(report.counts, [{ name: 'town', listed: 1 }]);
  assert.deepEqual(report.notes, ['not-run project=town path=apps/web/e2e/town.spec.ts owner=TOWN-01 issue=#249']);
  assert.match(formatReport(report), /status=listed-not-executed/);
  assert.match(formatReport(report), /discovery list is not execution/);
  assert.doesNotMatch(formatReport(report), /\bpassed\b/i);
});

test('the town allowlist keeps five files and leaves the owned gaps', () => {
  const town = intendedProjects.find((project) => project.name === 'town');
  for (const name of ['pixels-year.spec.ts', 'pixels-detail.spec.ts', 'pixels-life.spec.ts', 'hub-pixels.spec.ts', 'world.spec.ts']) {
    assert.equal(selects(town, name), true, name);
  }
  for (const name of ['town.spec.ts', 'town-checkin.spec.ts', 'town-dialogs.spec.ts', 'pixels-settings.spec.ts']) {
    assert.equal(selects(town, name), false, name);
  }
});

test('viewport and platform specs stay selected inside their projects', () => {
  const finance = intendedProjects.find((project) => project.name === 'finance');
  const travel = intendedProjects.find((project) => project.name === 'travel');
  const media = intendedProjects.find((project) => project.name === 'media');
  assert.equal(selects(finance, 'activity.spec.ts'), true);
  assert.equal(selects(finance, 'suite-v2-a11y.spec.ts'), true);
  assert.equal(selects(travel, 'native.spec.js'), true);
  assert.equal(selects(media, 'native.spec.ts'), true);
  assert.equal(ownedExclusions.some((item) => /activity|native|screenshots/.test(item.file)), false);
});

test('the current tree lists every intended project and records exclusion owners', () => {
  const report = evaluateDiscovery({ root: repoRoot, projects: intendedProjects, exclusions: ownedExclusions });
  assert.equal(report.ok, true, report.errors.join('\n'));
  for (const count of report.counts) assert.ok(count.listed > 0, count.name);
  const townDir = path.join(repoRoot, 'apps/web/e2e');
  const townPresent = fs.readdirSync(townDir).filter((name) => name.endsWith('.spec.ts')).length;
  const town = report.counts.find((count) => count.name === 'town');
  assert.equal(town.listed, townPresent - ownedExclusions.length);
  assert.deepEqual(report.notes, [
    'not-run project=town path=apps/web/e2e/pixels-settings.spec.ts owner=UX-01 issue=#259',
    'not-run project=town path=apps/web/e2e/town-checkin.spec.ts owner=TOWN-01 issue=#249',
    'not-run project=town path=apps/web/e2e/town-dialogs.spec.ts owner=TOWN-01 issue=#249',
    'not-run project=town path=apps/web/e2e/town.spec.ts owner=TOWN-01 issue=#249',
  ]);
  assert.doesNotMatch(formatReport(report), /\bpassed\b/i);
});
