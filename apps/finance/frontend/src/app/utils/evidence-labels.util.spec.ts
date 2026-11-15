import { planningEvidenceCards } from './evidence-labels.util';

describe('evidence-labels.util', () => {
  it('marks planning Monte Carlo as scenario and ledger NW as fact', () => {
    const cards = planningEvidenceCards({
      usesLedgerNetWorth: true,
      usesRecurringSpending: true,
      usesRecurringIncome: false,
      horizonYears: 30,
      nPaths: 500,
    });
    expect(cards.find(c => c.kind === 'fact')?.detail).toContain('encrypted balance sheet');
    expect(cards.find(c => c.kind === 'scenario')?.detail).toContain('never mutates');
  });

});
