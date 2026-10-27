import assert from 'node:assert/strict';
import test from 'node:test';
import { translateLegacyLocation } from '../apps/web/src/app/platform/legacy-routes.mjs';

test('old trip bookmarks retain the selected trip and editor query', () => {
  assert.equal(translateLegacyLocation('https://suite.test/travel/#/trips/42?edit=transport'), '/travel/trips/42?edit=transport');
});

test('old Media search bookmarks retain query, filters, and outer parameters', () => {
  assert.equal(translateLegacyLocation('https://suite.test/media/?from=hub#/search?q=The+Gentlemen&kind=tv'), '/media/search?q=The+Gentlemen&kind=tv&from=hub');
  assert.equal(translateLegacyLocation('https://suite.test/hub/media/#/library'), '/media/library');
});

test('inner query parameters take precedence without losing distinct outer values', () => {
  assert.equal(translateLegacyLocation('/travel/?start=old&view=map#/trips/new?start=2026-11-02'), '/travel/trips/new?start=2026-11-02&view=map');
});

test('canonical paths and ordinary page anchors remain unchanged', () => {
  assert.equal(translateLegacyLocation('/finance/have?t=holdings'), null);
  assert.equal(translateLegacyLocation('/travel/trips/42#notes'), null);
  assert.equal(translateLegacyLocation('/about#experience'), null);
});

test('hash translation cannot escape a domain or accept encoded separators', () => {
  for (const href of ['/travel/#//attacker.test', '/media/#/../finance/have', '/travel/#/%2f%2fattacker.test', '/finance/#/..\\evil']) {
    assert.equal(translateLegacyLocation(href), null, href);
  }
});
