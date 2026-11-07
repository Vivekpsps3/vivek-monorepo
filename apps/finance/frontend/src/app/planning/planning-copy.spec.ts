import type { PlanningInputs } from './planning-copy';
import { dateWarnings, planningSourceLabel, spendingBasisSentence } from './planning-copy';

function inputs(partial: Partial<PlanningInputs>): PlanningInputs {
  return {
    disclaimer: '',
    as_of: '2026-10-20',
    snapshot_hash: '',
    net_worth_total: 0,
    net_worth_portfolio: 0,
    net_worth_liabilities: 0,
    avg_monthly_income: 0,
    avg_monthly_expense: 0,
    implied_annual_spending: 0,
    implied_annual_savings: 0,
    transaction_count: 0,
    ...partial,
  };
}

describe('planning-copy (F18)', () => {
  it('sources are plain', () => {
    expect(planningSourceLabel('net_worth')).toBe('From your assets and debts');
    expect(planningSourceLabel('income')).toBe('From your active jobs');
    expect(planningSourceLabel('spending')).toBe('From your bills and subscriptions');
    for (const kind of ['net_worth', 'income', 'spending'] as const) {
      const label = planningSourceLabel(kind);
      expect(label).not.toContain('balance-sheet');
      expect(label).not.toContain('active-job-income');
      expect(label).not.toContain('active-recurring-schedules');
    }
  });

  it('warnings pluralise and hide at zero', () => {
    expect(dateWarnings(inputs({ undated_portfolio_positions: 1 }))[0].text).toBe(
      '1 holding has no position date.',
    );
    expect(dateWarnings(inputs({ undated_portfolio_positions: 2 }))[0].text).toBe(
      '2 holdings have no position date.',
    );
    expect(
      dateWarnings(inputs({ undated_asset_balances: 1, undated_liability_balances: 0 }))[0].text,
    ).toBe('1 balance has no date.');
    expect(dateWarnings(inputs({}))).toEqual([]);
    expect(dateWarnings(inputs({ undated_portfolio_quotes: 3, undated_portfolio_positions: 0 }))).toEqual([]);
    expect(dateWarnings(null)).toEqual([]);
  });

  it('spending sentences', () => {
    // Money formatting inserts a word joiner after the currency symbol.
    expect(spendingBasisSentence('recurring', 1500).replace(/⁠/g, '')).toBe(
      "Use your bills and subscriptions ($1,500.00 a year). Card purchases aren't included.",
    );
    expect(spendingBasisSentence('components', 0)).toBe('Add up categories yourself.');
    expect(spendingBasisSentence('manual', 0)).toBe('Enter one yearly total.');
  });
});
