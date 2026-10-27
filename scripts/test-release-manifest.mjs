import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const writerPath = join(scriptDir, 'write-release-manifest.mjs');
const fixtureRoot = await mkdtemp(join(tmpdir(), 'finance-release-manifest-'));

try {
  const productionDir = join(fixtureRoot, 'production');
  await mkdir(productionDir);
  await writeFile(join(productionDir, 'main-ABC123_X.js'), 'window.fixtureBuild="one";');
  await writeFile(join(productionDir, 'styles-ZYX987_6.css'), 'body{color:#111;}');
  await writeFile(join(productionDir, 'index.html'), productionHtml('one'));

  runWriter(productionDir);
  const firstManifest = await readManifest(productionDir);
  const firstHtml = await readFile(join(productionDir, 'index.html'), 'utf8');
  assert.match(firstHtml, new RegExp(`<meta name="app-release" content="${firstManifest.release}">`));

  runWriter(productionDir);
  assert.deepEqual(await readManifest(productionDir), firstManifest, 'rerunning the writer is deterministic');
  assert.equal(await readFile(join(productionDir, 'index.html'), 'utf8'), firstHtml, 'rerunning does not duplicate or reformat metadata');

  await writeFile(join(productionDir, 'index.html'), firstHtml.replace('<title>one</title>', '<title>two</title>'));
  runWriter(productionDir);
  const changedHtmlManifest = await readManifest(productionDir);
  assert.notEqual(changedHtmlManifest.release, firstManifest.release, 'HTML-only changes produce a new release id');

  const developmentDir = join(fixtureRoot, 'development');
  await mkdir(developmentDir);
  await writeFile(join(developmentDir, 'main.js'), 'window.fixtureBuild="dev";');
  await writeFile(join(developmentDir, 'styles.css'), 'body{color:#222;}');
  await writeFile(join(developmentDir, 'index.html'), `<!doctype html><html><head><title>dev</title><link rel="stylesheet" href="styles.css"></head><body><script src="main.js" type="module"></script><meta name="app-release" content="${'f'.repeat(64)}"></body></html>`);
  await writeFile(join(developmentDir, 'version.json'), JSON.stringify({ release: 'f'.repeat(64) }));
  runWriter(developmentDir);
  assert.doesNotMatch(await readFile(join(developmentDir, 'index.html'), 'utf8'), /name="app-release"/);
  await assert.rejects(readFile(join(developmentDir, 'version.json')), { code: 'ENOENT' });

  console.log('Release manifest fixture checks passed.');
} finally {
  await rm(fixtureRoot, { recursive: true, force: true });
}

function productionHtml(title) {
  return `<!doctype html><html><head><title>${title}</title><link rel="stylesheet" href="styles-ZYX987_6.css"></head><body><script src="main-ABC123_X.js" type="module"></script></body></html>`;
}

function runWriter(outputDir) {
  const result = spawnSync(process.execPath, [writerPath, outputDir], { encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`Release manifest writer failed:\n${result.stdout}${result.stderr}`);
  }
}

async function readManifest(outputDir) {
  return JSON.parse(await readFile(join(outputDir, 'version.json'), 'utf8'));
}
