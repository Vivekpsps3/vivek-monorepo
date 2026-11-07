import { frozenToday } from '../frozen-clock';

/**
 * F8 acceptance fixture: one refund month.
 * Posted: Food $12.00 + $5.25, Shopping refund $3.25, pay $5,000.
 * Scheduled: an unposted $45 subscription on day 20.
 * Expected: Spent 14.00 · Scheduled 45 · Income 5,000 · Net +4,986.
 * Prior month: $10 Food on day 1, so the like-for-like delta through the
 * frozen "today" is computable.
 */
export function refundMonthSeed() {
  const today = frozenToday();
  const [year, month] = today.split('-').map(Number);
  const day = (value: number) => `${year}-${String(month).padStart(2, '0')}-${String(value).padStart(2, '0')}`;
  const prior = new Date(year, month - 2, 1);
  const priorDay1 = `${prior.getFullYear()}-${String(prior.getMonth() + 1).padStart(2, '0')}-01`;
  return {
    transactions: [
      { id: 1, date: day(2), type: 'expense', kind: 'purchase', category: 'Food', description: 'Grocer', amount: 12 },
      { id: 2, date: day(3), type: 'expense', kind: 'purchase', category: 'Food', description: 'Bakery', amount: 5.25 },
      { id: 3, date: day(4), type: 'expense', kind: 'refund', category: 'Shopping', description: 'Returned shoes', amount: 3.25 },
      { id: 4, date: day(5), type: 'income', kind: 'income', category: 'Pay', description: 'Paycheck', amount: 5000 },
      { id: 5, date: priorDay1, type: 'expense', kind: 'purchase', category: 'Food', description: 'Prior month grocer', amount: 10 },
    ],
    subscriptions: [
      { id: 20, name: 'Streaming', amount: 45, monthly_amount: 45, frequency: 'monthly', next_bill_date: day(20), next_due_date: day(20), category: 'Entertainment', is_active: true },
    ],
  };
}

export const refundMonthExpectations = {
  spent: '14.00',
  scheduled: '45.00',
  income: '5,000.00',
  net: '4,986.00',
  foodNet: '17.25',
  shoppingNet: '-3.25',
};
