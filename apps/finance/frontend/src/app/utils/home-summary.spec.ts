import type {
Asset,
Subscription,
Transaction
} from '../models/transaction.model';
import { dueSoon,homeAsOfLine,isoAddDays } from './home-summary';

const now = new Date('2026-10-20T19:00:00Z'); // 12:00 PT

function asset(asOf: string): Asset {
  return { id: 1, name: 'Checking', category: 'cash', current_value: 100, as_of_date: asOf } as Asset;
}

describe('home-summary (F14)', () => {

  it('as-of line never says no date', () => {
    const line = homeAsOfLine([asset(''), asset('2026-10-22')], [], [], now);
    expect(line).toBe('Balances Oct 22');
    expect(line).not.toContain('No date');
    expect(line).not.toContain('Date unknown');
    expect(line).not.toContain('with no date');
  });

  it('dueSoon drops a bill that already posted', () => {
    const sub = {
      id: 1,
      name: 'Music',
      category: 'entertainment',
      amount: 45,
      frequency: 'monthly',
      next_bill_date: '2026-10-20',
      is_active: true,
    } as Subscription;
    const posted = {
      id: 9,
      date: '2026-10-19',
      type: 'expense',
      category: 'entertainment',
      amount: 45,
    } as unknown as Transaction;
    expect(dueSoon('2026-10-19', 14, [posted], [], [sub])).toEqual([]);
  });

  it('isoAddDays crosses the DST change', () => {
    expect(isoAddDays('2026-10-31', 2)).toBe('2026-11-02');
  });
});
