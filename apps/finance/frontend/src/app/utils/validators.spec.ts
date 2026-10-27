import { excludedAmountNote, needsFixing, sumCountableDollars, validateAsset, validateMoney, validateSubscription, validateTransaction, validateUnitPrice } from './validators';

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

  it('limits names to 80 characters and dates to a year ahead', () => {
    const longName = 'A'.repeat(81);
    expect(validateAsset({ name: longName, value: 1 }).map(issue => issue.message)).toContain('Use 80 characters or fewer.');
    const issues = validateTransaction({ amount: '10', date: '2028-01-01', category: 'Food' }, '2026-10-22');
    expect(issues.map(issue => issue.message)).toContain('Use a date within a year.');
    expect(validateTransaction({ amount: '10', date: '2026-02-29', category: 'Food' }, '2026-10-22')
      .map(issue => issue.message)).toContain('Enter a date.');
  });

  it('keeps four decimal places on a unit price and rejects a 2-decimal money value with extra digits', () => {
    expect(validateUnitPrice(0.1234)).toBeNull();
    expect(validateUnitPrice('0.12345')).toBe('Enter a price with up to 4 decimal places.');
    expect(validateMoney(1.005, {
      allowZero: false,
      negativeMessage: 'Enter an amount above $0.',
      emptyMessage: 'Enter an amount above $0.',
    })).toEqual({ error: 'Enter an amount with up to 2 decimal places.' });
  });
});
