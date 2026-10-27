import assert from 'node:assert/strict';
import test from 'node:test';
import { safeNextPathFrom } from '../../../../packages/auth/src/navigation.mjs';
const origin = 'https://suite.test';

test('sign-in keeps the requested private app, query, and section', () => {
  assert.equal(safeNextPathFrom('/finance/spending?page=2#recent', origin), '/finance/spending?page=2#recent');
  assert.equal(safeNextPathFrom('/travel/trips/42?view=map', origin), '/travel/trips/42?view=map');
  assert.equal(safeNextPathFrom('/media/search?q=The+Gentlemen&kind=tv', origin), '/media/search?q=The+Gentlemen&kind=tv');
});

test('sign-in cannot return to itself through an alias or dot segment', () => {
  for(const path of ['/auth/login','/auth/signup/','/login','/signup','/enroll','/finance/login','/finance/auth/login','/finance/trips/../auth/login','/finance/%2e%2e/auth/login']) {
    assert.equal(safeNextPathFrom(path, origin), null, path);
  }
});

test('cross-origin, protocol-relative, malformed and encoded-separator returns are rejected', () => {
  for(const path of ['https://attacker.test/path','//attacker.test/path','/\\attacker.test/path','/media/%2f%2fattacker.test','/travel/%5csecret','/%ZZ']) {
    assert.equal(safeNextPathFrom(path, origin), null, path);
  }
});

test('normalization preserves Unicode names and safe fragment bookmarks', () => {
  assert.equal(safeNextPathFrom('/media//search?q=Björk#results', origin), '/media/search?q=Bj%C3%B6rk#results');
  assert.equal(safeNextPathFrom('/travel/#/trips/42', origin), '/travel/#/trips/42');
  assert.equal(safeNextPathFrom('/finance-other/about', origin), '/finance-other/about');
});
