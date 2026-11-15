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

});
