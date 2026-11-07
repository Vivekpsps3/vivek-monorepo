import { incomeRowSubtitle, incomeRowTitle } from './income-row-copy';

describe('income-row-copy (F18)', () => {
  it('paycheck and posted titles', () => {
    expect(
      incomeRowTitle({ kind: 'paycheck', label: 'Projected paycheck', name: 'Acme', detail: '', payday_frequency: 'biweekly' }),
    ).toBe('Acme paycheck');
    expect(incomeRowTitle({ kind: 'posted', label: 'Recorded income', name: 'Refund Co', detail: '' })).toBe(
      'Refund Co income',
    );
    expect(incomeRowTitle({ kind: 'estimate', label: 'Annual bonus estimate', name: 'Acme', detail: '' })).toBe(
      'Annual bonus',
    );
  });

  it('paycheck subtitle names the cadence', () => {
    expect(incomeRowSubtitle({ kind: 'paycheck', label: '', name: '', detail: 'x', payday_frequency: 'biweekly' })).toBe(
      'Estimated net · Every two weeks',
    );
    expect(incomeRowSubtitle({ kind: 'paycheck', label: '', name: '', detail: 'x' })).toBe('Estimated net');
    expect(incomeRowSubtitle({ kind: 'estimate', label: '', name: '', detail: 'Undated estimate' })).toBe(
      'Undated estimate',
    );
  });
});
