import assert from 'node:assert/strict';
import test from 'node:test';
import {
  acceptMemoryLoad,
  browserZone,
  clearMemoryDraft,
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
