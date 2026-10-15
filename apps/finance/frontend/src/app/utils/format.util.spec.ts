import { formatCompactMoney, formatMoney } from '@vivek/browser';

describe('browser money formatting utilities', () => {
  it('formats money with locale currency', () => {
    expect(formatMoney(1234.5, 'USD', 'en-US')).toBe('$1,234.50');
    expect(formatMoney(null)).toBe('—');
    expect(formatMoney(Number.POSITIVE_INFINITY)).toBe('—');
    expect(formatCompactMoney(Number.NaN)).toBe('—');
  });

  it('formats compact money', () => {
    const compact = formatCompactMoney(12_500, 'USD', 'en-US');
    expect(compact).toContain('12');
    expect(compact).toMatch(/\$|USD/);
  });
});
