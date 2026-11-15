import { summarizeMonthSpend } from './spend-summary.util';

describe('spend-summary util', () => {
  it('summarizes one month of spend', () => {
    const summary = summarizeMonthSpend(
      [
        { id: 1, date: '2026-08-10', type: 'expense', category: 'Software', description: 'OpenRouter', amount: 21.1 },
        { id: 2, date: '2026-08-11', type: 'expense', category: 'Food', description: 'Costco', amount: 84 },
        { id: 3, date: '2026-08-11', type: 'expense', category: 'Food', description: 'Coffee', amount: 6 },
        { id: 4, date: '2026-08-12', type: 'income', category: 'Pay', description: 'Job', amount: 200 },
        { id: 5, date: '2026-07-01', type: 'expense', category: 'Food', description: 'July', amount: 999 },
      ],
      '2026-08'
    );

    expect(summary.expenseTotal).toBe(111.1);
    expect(summary.incomeTotal).toBe(200);
    expect(summary.net).toBe(88.9);
    expect(summary.activeDays).toBe(3);
    expect(summary.categories).toEqual([
      { label: 'Food', value: 90, pct: (90 / 111.1) * 100 },
      { label: 'Software', value: 21.1, pct: (21.1 / 111.1) * 100 },
    ]);
    expect(summary.topPurchases.map(row => row.description)).toEqual(['Costco', 'OpenRouter', 'Coffee']);
  });

});
