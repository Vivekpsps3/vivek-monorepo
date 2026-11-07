import type {
  Asset,
  FixedExpense,
  Holding,
  Liability,
  Subscription,
  Transaction,
} from '../models/transaction.model';
import { dueSoon, firstSteps, homeAsOfLine, isoAddDays } from './home-summary';

const now = new Date('2026-10-20T19:00:00Z'); // 12:00 PT

function asset(asOf: string): Asset {
  return { id: 1, name: 'Checking', category: 'cash', current_value: 100, as_of_date: asOf } as Asset;
}

function liability(asOf: string): Liability {
  return { id: 2, name: 'Card', category: 'credit_card', balance_owed: 50, as_of_date: asOf } as Liability;
}

function bill(name: string, dueDay: number, amount = 10): FixedExpense {
  return {
    id: 1,
    name,
    category: 'utilities',
    amount,
    frequency: 'monthly',
    start_date: '2026-01-01',
    due_day: dueDay,
    is_active: true,
  } as FixedExpense;
}

describe('home-summary (F14)', () => {
  it('as-of line joins balances and prices', () => {
    const holding = {
      id: 3,
      symbol: 'VOO',
      shares: 1,
      current_price: 700.81,
      price_source: 'live',
      price_as_of: '2026-10-20T14:38:00Z',
    } as Holding;
    expect(homeAsOfLine([asset('2026-10-22')], [liability('2026-09-30')], [holding], now)).toBe(
      'Balances Oct 22 · Prices as of 7:38 AM PT',
    );
  });

  it('as-of line with only holdings at purchase price', () => {
    const holding = { id: 3, symbol: 'VOO', shares: 1, price_source: 'unavailable' } as Holding;
    expect(homeAsOfLine([], [], [holding], now)).toBe('Holdings at purchase price');
  });

  it('as-of line is empty with no records', () => {
    expect(homeAsOfLine([], [], [], now)).toBe('');
  });

  it('as-of line never says no date', () => {
    const line = homeAsOfLine([asset(''), asset('2026-10-22')], [], [], now);
    expect(line).toBe('Balances Oct 22');
    expect(line).not.toContain('No date');
    expect(line).not.toContain('Date unknown');
    expect(line).not.toContain('with no date');
  });

  it('dueSoon window is 14 days inclusive', () => {
    const items = dueSoon(
      '2026-10-20',
      14,
      [],
      [bill('Today bill', 20), bill('Edge bill', 2), bill('Late bill', 3)],
      [],
    );
    expect(items.map(item => item.name)).toEqual(['Today bill', 'Edge bill']);
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

  it('dueSoon sorts by date then name', () => {
    const items = dueSoon(
      '2026-10-20',
      14,
      [],
      [bill('Zebra', 25), bill('Alpha', 25), bill('First', 21)],
      [],
    );
    expect(items.map(item => item.name)).toEqual(['First', 'Alpha', 'Zebra']);
  });

  it('firstSteps marks each step', () => {
    const steps = firstSteps({
      assets: 1,
      liabilities: 0,
      holdings: 0,
      transactions: 3,
      jobIncomes: 0,
      fixed: 0,
      subs: 1,
    });
    expect(steps.map(step => step.done)).toEqual([true, false, true, true]);
    expect(steps.map(step => step.label)).toEqual([
      'Add a balance',
      'Add holdings',
      'Add activity',
      'Add pay and bills',
    ]);
  });

  it('isoAddDays crosses the DST change', () => {
    expect(isoAddDays('2026-10-31', 2)).toBe('2026-11-02');
  });
});
