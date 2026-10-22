import {
  excludedAmountNote,
  needsFixing,
  sumCountableDollars,
  validateAsset,
  validateSubscription,
} from '@vivek/browser';

describe('finance field validators', () => {
  it('rejects a negative subscription inline and excludes it from totals', () => {
    const issues = validateSubscription({ name: 'Stream', amount: -40 });
    expect(issues.map(issue => issue.message)).toContain('Enter an amount above $0.');
    expect(needsFixing(-40, 'positive')).toBeTrue();
    const total = sumCountableDollars([-40, 12], 'positive');
    expect(total.total).toBe(12);
    expect(total.excluded).toBe(1);
    expect(excludedAmountNote(1)).toBe('Excludes 1 entry with an invalid amount');
  });

  it('rejects an amount above the maximum', () => {
    const issues = validateAsset({ name: 'Cash', value: 1e20 });
    expect(issues.some(issue => issue.message.includes('999,999,999,999.99'))).toBeTrue();
    expect(needsFixing(1e20, 'nonNegative')).toBeTrue();
    expect(sumCountableDollars([1e20, 10], 'nonNegative')).toEqual({ total: 10, excluded: 1 });
  });

  it('accepts an ordinary asset value', () => {
    expect(validateAsset({ name: 'Checking', value: 1350 })).toEqual([]);
  });
});
