import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import { mayPublish, openBoundedWork } from '../src/bounded-work.ts';

test('a parent that is already aborted does not start the step', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const parent = new AbortController();
    parent.abort();
    const work = openBoundedWork({ parents: [parent.signal], deadlineMs: 5_000 });
    let calls = 0;
    const result = await work.run(() => {
      calls += 1;
      return Promise.resolve('started');
    });
    assert.equal(calls, 0);
    assert.equal(result.status, 'cancelled');
    assert.equal(mayPublish(work, true), false);
    work.dispose();
    work.dispose();
    mock.timers.tick(5_000);
    assert.equal(work.timedOut(), false);
  } finally {
    mock.timers.reset();
  }
});

test('a caller abort is not a deadline, and a deadline is not a caller abort', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const parent = new AbortController();
    const cancelled = openBoundedWork({ parents: [parent.signal], deadlineMs: 5_000 });
    const cancelling = cancelled.run(() => new Promise(() => undefined));
    parent.abort();
    assert.equal((await cancelling).status, 'cancelled');
    assert.equal(cancelled.callerAborted(), true);
    assert.equal(cancelled.timedOut(), false);
    cancelled.dispose();

    const caller = new AbortController();
    const timed = openBoundedWork({ parents: [caller.signal], deadlineMs: 1_000 });
    const waiting = timed.run(() => new Promise(() => undefined));
    mock.timers.tick(999);
    let early = 'pending';
    void waiting.then(result => {
      early = result.status;
    });
    await Promise.resolve();
    assert.equal(early, 'pending');
    mock.timers.tick(1);
    assert.equal((await waiting).status, 'deadline');
    assert.equal(timed.timedOut(), true);
    assert.equal(timed.callerAborted(), false);
    assert.equal(mayPublish(timed, true), false);
    timed.dispose();
  } finally {
    mock.timers.reset();
  }
});

test('one deadline bounds a later step and a late success is ignored', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const work = openBoundedWork({ deadlineMs: 5_000 });
    let secondStarted = false;
    const first = work.run(() => new Promise(() => undefined));
    mock.timers.tick(3_000);
    const second = work.run(() => {
      secondStarted = true;
      return new Promise(resolve => {
        work.signal.addEventListener('abort', () => resolve('late'), { once: true });
      });
    });
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(secondStarted, true);
    mock.timers.tick(1_999);
    mock.timers.tick(1);
    assert.equal((await first).status, 'deadline');
    const late = await second;
    assert.equal(late.status, 'deadline');
    if (late.status === 'ok') assert.fail('late success published');
    work.dispose();
  } finally {
    mock.timers.reset();
  }
});

test('a thrown step stays failed, and dispose is idempotent', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const parent = new AbortController();
    const work = openBoundedWork({ parents: [parent.signal], deadlineMs: 1_000 });
    const failed = await work.run(() => Promise.reject(new Error('parse')));
    assert.equal(failed.status, 'failed');
    if (failed.status === 'failed') assert.equal(failed.error instanceof Error, true);
    const done = await work.run(() => Promise.resolve('kept'));
    assert.deepEqual(done, { status: 'ok', value: 'kept' });
    work.dispose();
    work.dispose();
    parent.abort();
    mock.timers.tick(1_000);
    assert.equal(work.signal.aborted, false);
    assert.equal(mayPublish(work, true), true);
  } finally {
    mock.timers.reset();
  }
});
