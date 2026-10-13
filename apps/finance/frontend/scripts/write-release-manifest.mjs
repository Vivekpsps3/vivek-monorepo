import { createHash } from 'node:crypto';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const frontendRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputDir = resolve(process.argv[2] ?? join(frontendRoot, 'dist/finance-app/browser'));
const indexPath = join(outputDir, 'index.html');
const manifestPath = join(outputDir, 'version.json');
const releaseMeta = /<meta\s+name=["']app-release["']\s+content=["']([^"']*)["']\s*\/?\s*>/i;
const hashedBundle = /-[A-Za-z0-9_-]{8}\.(?:js|css)$/i;

const originalHtml = await readFile(indexPath, 'utf8');
const normalizedHtml = originalHtml.replace(releaseMeta, '');
const assetReferences = [...originalHtml.matchAll(/(?:src|href)=["']([^"']+\.(?:js|css))(?:\?[^"']*)?["']/gi)]
  .map((match) => new URL(match[1], 'https://finance.invalid/').pathname.slice(1))
  .filter((path) => path && !path.startsWith('../'));
const entries = [...new Set(assetReferences)].sort();

// Development and direct `ng build --configuration development` output is
// intentionally left without a release id. Angular production names every
// entry bundle with its eight-character output hash.
if (entries.length === 0 || !entries.some((entry) => entry.endsWith('.js')) || !entries.every((entry) => hashedBundle.test(entry))) {
  await rm(manifestPath, { force: true });
  const developmentHtml = originalHtml.replace(releaseMeta, '');
  if (developmentHtml !== originalHtml) await writeFile(indexPath, developmentHtml);
  console.log('Skipped release metadata: output does not contain Angular production-hashed entry bundles.');
  process.exit(0);
}

const releaseHash = createHash('sha256');
releaseHash.update(normalizedHtml);
releaseHash.update('\0');
for (const entry of entries) {
  const assetPath = resolve(outputDir, entry);
  const relativePath = relative(outputDir, assetPath);
  if (relativePath.startsWith(`..${sep}`) || relativePath === '..') {
    throw new Error(`Bundle path escapes build output: ${entry}`);
  }
  releaseHash.update(entry);
  releaseHash.update('\0');
  releaseHash.update(await readFile(assetPath));
  releaseHash.update('\0');
}

const release = releaseHash.digest('hex');
const meta = `<meta name="app-release" content="${release}">`;
const finalHtml = releaseMeta.test(originalHtml)
  ? originalHtml.replace(releaseMeta, meta)
  : originalHtml.replace(/<\/head>/i, `${meta}</head>`);
if (!releaseMeta.test(finalHtml)) throw new Error('Could not add the app-release meta tag to the built index.html.');

await writeFile(indexPath, finalHtml);
await writeFile(manifestPath, `${JSON.stringify({ release })}\n`);
console.log(`Wrote release ${release} to index.html and version.json.`);
