import {
  MAX_AMOUNT_MESSAGE,
  formatCompactMoney,
  formatMoney,
  fromDollars,
  parseMoneyInput,
  plural,
  toDollars,
} from '@vivek/browser';

describe('formatMoney', () => {
  const stored = [0, 0.01, 0.1, 1.15, 10.1, 19.99, 1234.56, -45.67, 999999999999.99, 1000, 333, 1100];

  it('formats cents, signs, estimates, and missing values', () => {
    expect(formatMoney(-4567)).toBe('−$45.67');
    expect(formatMoney(fromDollars(-0.004))).toBe('$0.00');
    expect(formatMoney(500000, { sign: 'always' })).toBe('+$5,000.00');
    expect(formatMoney(568800, { style: 'whole', approx: true })).toBe('about $5,688');
    expect(formatMoney(null)).toBe('—');
    expect(formatMoney(Number.POSITIVE_INFINITY)).toBe('—');
    expect(formatCompactMoney(Number.NaN)).toBe('—');
    expect(formatMoney(100000000000000000)).toBe('—');
  });

  it('uses the requested locale', () => {
    expect(formatMoney(123450, { locale: 'de-DE' })).not.toBe(formatMoney(123450, { locale: 'en-US' }));
  });

  it('round-trips cent-aligned stored dollars without changing the record', () => {
    for (const amount of stored) {
      const record = { amount };
      const cents = fromDollars(record.amount);
      expect(cents).withContext(String(amount)).not.toBeNull();
      expect(JSON.stringify(toDollars(cents!))).toBe(JSON.stringify(amount));
      expect(record.amount).toBe(amount);
    }
  });

  it('rejects scientific notation and amounts above the maximum', () => {
    expect(parseMoneyInput('1e20')).toEqual({ error: MAX_AMOUNT_MESSAGE });
    expect(parseMoneyInput('1000000000000000')).toEqual({ error: MAX_AMOUNT_MESSAGE });
    expect(parseMoneyInput('1.005')).toEqual({ error: 'Enter an amount with up to 2 decimal places.' });
  });

  it('pluralizes counts', () => {
    expect(plural(1, 'purchase')).toBe('1 purchase');
    expect(plural(110, 'purchase')).toBe('110 purchases');
    expect(plural(0, 'transaction')).toBe('No transactions');
  });

  it('keeps compact amounts recognizable', () => {
    const compact = formatCompactMoney(1_250_000);
    expect(compact).toContain('12');
    expect(compact).toMatch(/\$|USD/);
  });
});
