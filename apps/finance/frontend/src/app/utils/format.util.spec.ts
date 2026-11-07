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
    expect(plural(0, 'transaction')).toBe(PLURAL_ZERO_IS_NO ? 'No transactions' : '0 transactions');
  });

  it('covers both settings of a zero count', () => {
    expect(plural(0, 'deposit', { zeroIsNo: true })).toBe('No deposits');
    expect(plural(0, 'deposit', { zeroIsNo: false })).toBe('0 deposits');
    expect(plural(0, 'deposit', 'deposits')).toBe(PLURAL_ZERO_IS_NO ? 'No deposits' : '0 deposits');
  });

  it('uses an irregular plural and can combine it with a zero count', () => {
    expect(plural(2, 'person', 'people')).toBe('2 people');
    expect(plural(0, 'person', { plural: 'people', zeroIsNo: true })).toBe('No people');
    expect(plural(1, 'person', { plural: 'people', zeroIsNo: false })).toBe('1 person');
    expect(plural(0, 'person', { plural: 'people', zeroIsNo: false })).toBe('0 people');
  });

  it('keeps compact amounts recognizable', () => {
    const compact = formatCompactMoney(1_250_000);
    expect(compact).toContain('12');
    expect(compact).toMatch(/\$|USD/);
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

  it('displays untouched x.xx5 stored dollars the way main did', () => {
    const rows: Array<[number, string]> = [
      [1.005, glued('$1.01')],
      [0.285, glued('$0.29')],
      [2.675, glued('$2.68')],
      [19.995, glued('$20.00')],
      [-1.005, glued('−$1.01')],
      [-0.285, glued('−$0.29')],
      [-2.675, glued('−$2.68')],
      [-0.005, glued('−$0.01')],
    ];
    for (const [amount, display] of rows) {
      expect(formatMoney(fromDollars(amount))).withContext(String(amount)).toBe(display);
    }
  });

  it('rejects blank, hex, boolean, and badly grouped money text', () => {
    expect(fromDollars('')).toBeNull();
    expect(fromDollars('0x10')).toBeNull();
    expect(fromDollars(true)).toBeNull();
    expect(fromDollars(false)).toBeNull();
    expect(fromDollars('1,234')).toBeNull();
    expect(fromDollars(Number.NaN)).toBeNull();
    expect(parseMoneyInput('1,2,3')).toEqual({ error: MAX_AMOUNT_MESSAGE });
    expect(parseMoneyInput('1,234.50')).toEqual({ cents: 123450 });
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
