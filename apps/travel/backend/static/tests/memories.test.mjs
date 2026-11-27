import assert from 'node:assert/strict';
import test from 'node:test';
import {
  acceptMemoryLoad,
  browserZone,
  civilDay,
  clearMemoryDraft,
  memoryCredit,
  memoryDates,
  memoryLoggedDay,
  memoryOverlapNames,
  memoryPlace,
  settleMemoryWrite,
} from '../../../frontend/src/memories.mjs';

test('a memory list publishes only for the load that is still current', () => {
  const current = { epoch: 4, currentEpoch: 4, sessionActive: true };
  assert.equal(acceptMemoryLoad(current), true);
  assert.equal(acceptMemoryLoad({ ...current, sessionActive: false }), false);
  assert.equal(acceptMemoryLoad({ ...current, epoch: 3 }), false);
});

test('an empty timezone name falls back to UTC', () => {
  assert.equal(browserZone(undefined), 'UTC');
  assert.equal(browserZone(null), 'UTC');
  assert.equal(browserZone(''), 'UTC');
  assert.equal(browserZone('   '), 'UTC');
  assert.equal(browserZone(' America/Los_Angeles '), 'America/Los_Angeles');
});

test('a memory write drops, reloads, or applies from the visible draft', () => {
  const base = {
    epoch: 2,
    currentEpoch: 2,
    sessionActive: true,
    tripId: 8,
    editingTripId: 8,
    start: '2090-09-01',
    end: '2090-09-04',
    sentStart: '2090-09-01',
    sentEnd: '2090-09-04',
  };
  assert.equal(settleMemoryWrite(base), 'apply');
  assert.equal(settleMemoryWrite({ ...base, sessionActive: false }), 'drop');
  assert.equal(settleMemoryWrite({ ...base, currentEpoch: 3 }), 'drop');
  assert.equal(settleMemoryWrite({ ...base, editingTripId: null }), 'apply');
  assert.equal(settleMemoryWrite({ ...base, editingTripId: 9 }), 'reload');
  assert.equal(settleMemoryWrite({ ...base, start: '2090-11-02' }), 'drop');
  assert.equal(settleMemoryWrite({ ...base, end: '2090-11-08' }), 'drop');
  assert.equal(settleMemoryWrite({ ...base, tripId: '8', editingTripId: 8 }), 'apply');
});

test('clearing a memory draft returns empty private fields', () => {
  const first = clearMemoryDraft();
  first.note = 'pier light';
  first.start = '2090-09-01';
  const second = clearMemoryDraft();
  assert.deepEqual(second, { tripId: null, start: '', end: '', note: '' });
});

test('memory cards label span, place, and credit without repeating the rules', () => {
  assert.equal(civilDay('2024-02-29'), 'February 29, 2024');
  assert.equal(civilDay('2090-08-07'), 'August 7, 2090');
  assert.equal(civilDay('not-a-day'), '');
  const late = {
    span_text: 'March 1, 2020 through March 10, 2020',
    span_days: 10,
    span_end: '2020-03-10',
    destinations: ['Oslo'],
    status: 'booked',
    credit_date: null,
    logged_on: '2026-11-27',
    logged_text: 'Logged on November 27, 2026.',
    overlaps: [{ title: 'Late south', span_text: 'March 8, 2020 through March 15, 2020' }],
  };
  assert.equal(memoryDates(late), 'March 1, 2020 through March 10, 2020 · 10 days');
  assert.equal(memoryPlace(late), 'Oslo');
  assert.equal(memoryPlace({ destinations: [] }), 'No saved city');
  assert.equal(memoryPlace({ destinations: ['Lisbon', 'Bergen', 'Portland'] }), 'Lisbon, Bergen, and Portland');
  assert.equal(memoryCredit(late), 'No credit · logged late');
  assert.equal(memoryLoggedDay(late), 'November 27, 2026');
  assert.equal(memoryOverlapNames(late), 'Late south');
  assert.equal(memoryDates(late).includes('March 8, 2020'), false);
  assert.equal(
    memoryCredit({ status: 'done', credit_date: '2090-08-07', span_text: 'August 1, 2090 through August 6, 2090' }),
    'August 7, 2090',
  );
  assert.equal(memoryCredit({ status: 'planning', credit_date: null }), 'No credit · planned');
  assert.equal(memoryCredit({ status: 'done', credit_date: null, logged_on: null }), 'No credit · no logged time');
  assert.equal(memoryCredit({ status: 'paused', credit_date: null, logged_on: '2090-01-01', span_end: '2090-01-02' }), 'No credit');
  assert.equal(memoryLoggedDay({ status: 'planning', credit_date: null }), '');
  assert.equal(memoryOverlapNames({ overlaps: [] }), '');
  assert.equal(memoryDates({ span_text: 'August 1, 2090', span_days: 1 }), 'August 1, 2090 · 1 day');
});
