/** Shared fact / inference / scenario labels for planning and Stock Lab. */

export type EvidenceKind = 'fact' | 'inference' | 'scenario';

export interface EvidenceCard {
  kind: EvidenceKind;
  label: string;
  detail: string;
}

export function planningEvidenceCards(opts: {
  usesLedgerNetWorth: boolean;
  usesRecurringSpending: boolean;
  usesRecurringIncome: boolean;
  horizonYears: number;
  nPaths: number;
}): EvidenceCard[] {
  return [
    {
      kind: 'fact',
      label: 'Starting position',
      detail: opts.usesLedgerNetWorth
        ? 'Starting net worth is taken from the current encrypted balance sheet.'
        : 'Starting net worth is a manual override for this run only.',
    },
    {
      kind: 'inference',
      label: 'Cashflow inputs',
      detail: [
        opts.usesRecurringSpending ? 'Spending inferred from recurring schedules' : 'Manual annual spending',
        opts.usesRecurringIncome ? 'income inferred from job schedules' : 'manual monthly income',
      ].join('; ') + '.',
    },
    {
      kind: 'scenario',
      label: 'Uncertainty',
      detail: `${opts.nPaths} Monte Carlo paths over ${opts.horizonYears} years. Returns, shocks, and inflation are assumptions—not predictions. Speculative only; never mutates holdings or net worth.`,
    },
  ];
}

export function stockLabEvidenceCards(opts: {
  primarySymbol: string;
  hasQuote: boolean;
  /** F18: "as of …" phrase for the loaded quote; no cache vocabulary. */
  asOf?: string | null;
}): EvidenceCard[] {
  return [
    {
      kind: 'fact',
      label: 'Public market data',
      detail: opts.hasQuote
        ? `Quote/history for ${opts.primarySymbol || 'ticker'} from public research${opts.asOf ? ` (${opts.asOf})` : ''}. Ticker symbols are disclosed to the backend.`
        : 'No quote loaded yet. Analyze to fetch public market data (discloses ticker symbols).',
    },
    {
      kind: 'inference',
      label: 'Scorecard & returns',
      detail: 'Scorecard and return matrix are derived locally from public series and your scenario inputs.',
    },
    {
      kind: 'scenario',
      label: 'Encrypted scenario',
      detail: 'Purchase plans and saved scenarios stay in your vault. Does not mutate holdings or net worth.',
    },
  ];
}

export function evidenceKindLabel(kind: EvidenceKind): string {
  switch (kind) {
    case 'fact':
      return 'Fact';
    case 'inference':
      return 'Inference';
    case 'scenario':
      return 'Scenario';
  }
}
