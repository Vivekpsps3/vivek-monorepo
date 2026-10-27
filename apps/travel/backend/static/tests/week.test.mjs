import assert from 'node:assert/strict';
import test from 'node:test';
import { rotateWeekLabels, weekStartsOn } from '../../../../../packages/browser/runtime/week.mjs';
import { monthMatrix, weekdayHeads } from '../../../frontend/src/calendar-model.mjs';

test('Travel pure calendar follows the shared week setting and rotates its header', () => {
  const previous = globalThis.localStorage;
  const memory = new Map();
  globalThis.localStorage = { getItem: key => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, value) };
  try {
    assert.equal(weekStartsOn(), 0);
    localStorage.setItem('suite-week-start', '1');
    assert.equal(weekdayHeads()[0].title, 'Monday');
    assert.equal(rotateWeekLabels(['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'])[0], 'Mon');
    assert.equal(monthMatrix(2026, 10)[0][0].getDay(), 1);
    localStorage.setItem('suite-week-start', '0');
    assert.equal(weekdayHeads()[0].title, 'Sunday');
  } finally {
    if (previous === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previous;
  }
});
