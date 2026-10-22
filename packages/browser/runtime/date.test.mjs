import assert from 'node:assert/strict';
import test from 'node:test';
import {
  WEEK_STARTS_ON,
  daysBetweenDateOnly,
  formatDate,
  isOnOrBeforeToday,
  parseDateOnly,
  weekStartIndex,
} from './date.mjs';

test('week starts on Sunday and Thursday is column 4', () => {
  assert.equal(WEEK_STARTS_ON, 0);
  const thursday = parseDateOnly('2026-10-01');
  assert.ok(thursday);
  assert.equal(weekStartIndex(thursday), 4);
});

test('day counts ignore US daylight-saving transitions', () => {
  assert.equal(daysBetweenDateOnly('2026-03-07', '2026-03-09'), 2);
  assert.equal(daysBetweenDateOnly('2026-10-31', '2026-11-02'), 2);
  assert.equal(parseDateOnly('2026-02-31'), null);
});

test('a Pacific 6pm instant stays on October 21', () => {
  const formatted = formatDate(
    '2026-10-22T01:00:00Z',
    'timestamp',
    new Date('2026-11-01T12:00:00Z'),
    'America/Los_Angeles',
  );
  assert.match(formatted, /Oct 21/);
  assert.equal(formatDate('2026-10-21', 'table', new Date('2026-10-22T12:00:00Z')), 'Oct 21');
  assert.equal(formatDate(null), 'No date');
});

test('Tokyo evening is the next local date and planning uses that today', () => {
  assert.equal(
    formatDate('2026-10-21T21:00:00Z', 'table', new Date('2026-11-01T00:00:00Z'), 'Asia/Tokyo'),
    'Oct 22',
  );
  assert.equal(isOnOrBeforeToday('2026-10-22', '2026-10-22'), true);
  assert.equal(isOnOrBeforeToday('2026-10-23', '2026-10-22'), false);
});
