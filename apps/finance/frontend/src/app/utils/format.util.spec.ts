import {
MAX_AMOUNT_MESSAGE,
PLURAL_ZERO_IS_NO,
formatCompactMoney,
formatMoney,
formatPercent,
fromDollars,
parseMoneyInput,
plural,
roundHalfAwayFromZero,
toDollars,
} from '@vivek/browser';

describe('formatMoney', () => {
  const stored = [0, 0.01, 0.1, 1.15, 10.1, 19.99, 1234.56, -45.67, 999999999999.99, 1000, 333, 1100];
  const wordJoiner = '\u2060';
  const glued = (text: string) =>
    text.replaceAll('−', `−${wordJoiner}`).replaceAll('+', `+${wordJoiner}`).replaceAll('$', `$${wordJoiner}`);

  it('formats cents, signs, estimates, and missing values', () => {
    expect(formatMoney(-4567)).toBe(glued('−$45.67'));
    expect(formatMoney(fromDollars(-0.004))).toBe(glued('$0.00'));
    expect(formatMoney(500000, { sign: 'always' })).toBe(glued('+$5,000.00'));
    expect(formatMoney(568800, { style: 'whole', approx: true })).toBe(glued('about $5,688'));
    expect(formatMoney(null)).toBe('—');
    expect(formatMoney(Number.POSITIVE_INFINITY)).toBe('—');
    expect(formatCompactMoney(Number.NaN)).toBe('—');
    expect(formatMoney(100000000000000000)).toBe('—');
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

  it('rounds half away from zero, including values Math.round gets wrong', () => {
    expect(roundHalfAwayFromZero(-0.5)).toBe(-1);
    expect(roundHalfAwayFromZero(0.5)).toBe(1);
    expect(roundHalfAwayFromZero(-1.5)).toBe(-2);
    expect(Math.round(-0.5)).not.toBe(-1);
    expect(fromDollars(-0.005)).toBe(-1);
    expect(fromDollars(2.675)).toBe(268);
    expect(formatMoney(fromDollars(2.675))).toBe(glued('$2.68'));
  });

  it('uses a true minus sign for percents and does not print −$0', () => {
    expect(formatPercent(-3, 0)).toBe('−3%');
    expect(formatPercent(3.25, 1)).toBe('3.3%');
    expect(formatPercent(null)).toBe('—');
    expect(formatCompactMoney(-4)).toBe(glued('$0'));
    expect(formatCompactMoney(-4)).not.toContain('−');
    expect(formatCompactMoney(-5)).toBe(glued('−$0.1'));
    expect(plural(0, 'deposit')).toBe(PLURAL_ZERO_IS_NO ? 'No deposits' : '0 deposits');
  });
});
