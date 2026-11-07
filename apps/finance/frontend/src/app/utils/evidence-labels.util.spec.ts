import { planningEvidenceCards, stockLabEvidenceCards } from './evidence-labels.util';

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

  it('discloses ticker disclosure on stock lab facts', () => {
    const cards = stockLabEvidenceCards({
      primarySymbol: 'VTI',
      hasQuote: true,
      asOf: 'as of Oct 22',
    });
    expect(cards[0].detail).toContain('VTI');
    expect(cards[0].detail).toContain('disclosed');
    expect(cards[0].detail).toContain('as of Oct 22');
  });
});
