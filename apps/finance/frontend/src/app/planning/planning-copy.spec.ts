import type { PlanningInputs } from './planning-copy';
import { dateWarnings, planningFactsCopy, planningSourceLabel, spendingBasisSentence } from './planning-copy';

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
    asset_count: 0,
    debt_count: 0,
    holding_count: 0,
    active_job_count: 0,
    active_bill_count: 0,
    active_subscription_count: 0,
    income_is_net: false,
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
    expect(dateWarnings(inputs({ undated_portfolio_quotes: 0, undated_portfolio_positions: 0 }))).toEqual([]);
    expect(dateWarnings(null)).toEqual([]);
    expect(dateWarnings(inputs({ undated_portfolio_quotes: 1, undated_portfolio_positions: 0 }))).toEqual([{
      text: '1 holding has no price date.',
      link: '/finance/have',
      linkText: 'Check prices',
      queryParams: { t: 'holdings' },
    }]);
    expect(dateWarnings(inputs({ undated_portfolio_quotes: 2 }))[0].text).toBe(
      '2 holdings have no price date.',
    );
    expect(dateWarnings(inputs({ undated_portfolio_positions: 1 }))[0].linkText).toBe('Add a date');
  });

  it('pluralizes source counts and does not call gross pay take-home', () => {
    const now = new Date('2026-10-22T18:00:00Z');
    const none = planningFactsCopy(inputs({}), now);
    expect(none.netWorth.small).toBe('From your assets and debts (0 assets, 0 debts)');
    expect(none.portfolio.small).toBe('From your holdings (0 holdings)');
    expect(none.takeHome.label).toBe('Yearly pay');
    expect(none.takeHome.amount.replace(/\u2060/g, '')).toBe('$0.00 a year before taxes');
    expect(none.takeHome.small).toBe('From your active jobs (0 active jobs). Take-home: not set');
    expect(none.scheduled.small).toBe('From your bills and subscriptions (0 bills, 0 subscriptions)');

    const one = planningFactsCopy(inputs({
      asset_count: 1,
      debt_count: 0,
      holding_count: 1,
      active_job_count: 1,
      active_bill_count: 1,
      active_subscription_count: 0,
      avg_monthly_income: 4_000,
      income_is_net: true,
      oldest_balance_as_of: '2026-10-01',
      oldest_portfolio_quote_date: '2026-10-22T15:38:00Z',
    }), now);
    expect(one.netWorth.small).toContain('(1 asset, 0 debts)');
    expect(one.netWorth.small).toContain('as of Oct 1');
    expect(one.portfolio.small).toContain('(1 holding)');
    expect(one.portfolio.small).toContain('prices as of');
    expect(one.takeHome.label).toBe('Take-home');
    expect(one.takeHome.amount.replace(/\u2060/g, '')).toBe('$48,000.00 a year');
    expect(one.takeHome.amount).not.toContain('before taxes');
    expect(one.takeHome.small).toBe('From your active jobs (1 active job)');
    expect(one.takeHome.small).not.toContain('not set');
    expect(one.scheduled.small).toBe('From your bills and subscriptions (1 bill, 0 subscriptions)');

    const many = planningFactsCopy(inputs({
      asset_count: 2,
      debt_count: 3,
      holding_count: 4,
      active_job_count: 2,
      active_bill_count: 2,
      active_subscription_count: 3,
      avg_monthly_income: 5_000,
      income_is_net: false,
    }), now);
    expect(many.netWorth.small).toBe('From your assets and debts (2 assets, 3 debts)');
    expect(many.portfolio.small).toBe('From your holdings (4 holdings)');
    expect(many.takeHome.label).toBe('Yearly pay');
    expect(many.takeHome.small).toBe('From your active jobs (2 active jobs). Take-home: not set');
    expect(many.scheduled.small).toBe('From your bills and subscriptions (2 bills, 3 subscriptions)');

    for (const copy of [none, one, many]) {
      const rendered = JSON.stringify(copy);
      expect(rendered).not.toContain('balance-sheet');
      expect(rendered).not.toContain('active-job-income');
      expect(rendered).not.toContain('active-recurring-schedules');
      expect(rendered).not.toContain('income_is_net');
    }
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
