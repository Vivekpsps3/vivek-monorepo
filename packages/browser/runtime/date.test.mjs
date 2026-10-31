import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import {
  WEEK_STARTS_ON,
  daysBetweenDateOnly,
  formatDate,
  formatOpenEndedRange,
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

test('a date-only value is the same calendar day in Los Angeles and Kolkata', () => {
  const script = `
    import { formatDate, parseDateOnly } from ${JSON.stringify(new URL('./date.mjs', import.meta.url).href)};
    const now = new Date('2026-11-01T12:00:00Z');
    console.log(JSON.stringify({
      valid: formatDate('2026-03-01', 'table', now),
      leap: formatDate('2026-02-29', 'table', now),
      parsed: parseDateOnly('2026-02-29'),
    }));
  `;
  const run = (timeZone) => {
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
      env: { ...process.env, TZ: timeZone },
      encoding: 'utf8',
    });
    assert.equal(result.status, 0, result.stderr);
    return JSON.parse(result.stdout);
  };
  const losAngeles = run('America/Los_Angeles');
  const kolkata = run('Asia/Kolkata');
  assert.equal(losAngeles.valid, 'Mar 1');
  assert.equal(kolkata.valid, losAngeles.valid);
  assert.equal(losAngeles.leap, 'No date');
  assert.equal(kolkata.leap, 'No date');
  assert.equal(losAngeles.parsed, null);
  assert.equal(kolkata.parsed, null);
});

test('Tokyo evening is the next local date and planning uses that today', () => {
  assert.equal(
    formatDate('2026-10-21T21:00:00Z', 'table', new Date('2026-11-01T00:00:00Z'), 'Asia/Tokyo'),
    'Oct 22',
  );
  assert.equal(isOnOrBeforeToday('2026-10-22', '2026-10-22'), true);
  assert.equal(isOnOrBeforeToday('2026-10-23', '2026-10-22'), false);
});

test('open-ended finance ranges keep the arrow and Present', () => {
  assert.equal(formatOpenEndedRange('2024-10-01', null), 'Oct 1, 2024 → Present');
  assert.equal(formatOpenEndedRange('2024-10-01', '2025-01-02'), 'Oct 1, 2024 → Jan 2, 2025');
});
