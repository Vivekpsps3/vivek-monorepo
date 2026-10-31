import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { ESLint } from 'eslint';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PURITY = 'worldgen-design.md §6.1: engine must be pure';
const SOURCE = [
  'void self.crypto;',
  'void globalThis.localStorage;',
  'void globalThis.Intl;',
  'void globalThis.Math.random;',
].join('\n');
const RULES = [
  'no-restricted-properties',
  'no-restricted-properties',
  'no-restricted-properties',
  'no-restricted-syntax',
];

test('engine purity flags self and globalThis escapes', async () => {
  const eslint = new ESLint({
    cwd: root,
    overrideConfigFile: path.join(root, 'eslint.config.js'),
  });
  const enginePath = path.join(root, 'apps/web/src/app/world/engine/purity.fixture.ts');
  const [result] = await eslint.lintText(SOURCE, { filePath: enginePath });
  assert.ok(result);
  SOURCE.split('\n').forEach((line, index) => {
    const hit = result.messages.find((message) => message.line === index + 1 && message.message.includes(PURITY));
    assert.ok(hit, `${line} was not flagged: ${JSON.stringify(result.messages)}`);
    assert.equal(hit.ruleId, RULES[index], line);
  });

  const outside = path.join(root, 'apps/web/src/app/world/purity.fixture.ts');
  const [other] = await eslint.lintText(SOURCE, { filePath: outside });
  assert.ok(other);
  assert.equal(other.messages.some((message) => message.message.includes(PURITY)), false);
});
