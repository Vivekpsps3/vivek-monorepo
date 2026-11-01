import { Injector } from '@angular/core';
import { loadFinanceBudgetKept } from './public-api';

describe('loadFinanceBudgetKept', () => {
  const injector = { get: () => { throw new Error('unread'); } } as unknown as Injector;
  const signal = new AbortController().signal;

  it('throws a bad today, weeks, or deadline as a synchronous RangeError', () => {
    expect(() => loadFinanceBudgetKept(injector, signal, { today: 'not-a-date', weeks: 1 })).toThrowError(RangeError);
    expect(() => loadFinanceBudgetKept(injector, signal, { today: '2026-10-14', weeks: 1.5 })).toThrowError(RangeError);
    expect(() => loadFinanceBudgetKept(injector, signal, { today: '2026-10-14', weeks: 1, deadlineMs: Number.NaN }))
      .toThrowError(RangeError);
  });

  it('still rejects with RangeError when an async caller awaits a bad argument', async () => {
    const call = async () => loadFinanceBudgetKept(injector, signal, { today: 'not-a-date', weeks: 1 });
    await expectAsync(call()).toBeRejectedWithError(RangeError);
  });
});
