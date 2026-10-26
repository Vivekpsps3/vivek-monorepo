import { Asset, Holding, Liability, NetWorth } from '../models/transaction.model';
import { computeNetWorth } from '../crypto/client-finance';
import { quoteFreshness } from '../utils/portfolio.util';
import type { PortfolioAccount, PositionHighlight } from './hub-summary';

export interface FinanceHubSnapshot {
  netWorth: NetWorth;
  accounts: PortfolioAccount[];
  positions: PositionHighlight[];
  freshness: string;
  cashOverlap: boolean;
}

/** Same valuation order as computeNetWorth, so account rows sum to portfolio value. */
export function holdingMarketValue(holding: Holding): number {
  const shares = Number(holding.shares) || 0;
  const exactValue = holding.market_value == null ? null : Number(holding.market_value);
  const enrichedValue = holding.value == null ? null : Number(holding.value);
  const price = holding.current_price ?? holding.purchase_price;
  if (exactValue != null && Number.isFinite(exactValue)) return exactValue;
  if (enrichedValue != null && Number.isFinite(enrichedValue)) return enrichedValue;
  if (price == null || !Number.isFinite(Number(price))) return 0;
  return Number(price) * shares;
}

export function activeHoldings(holdings: Holding[]): Holding[] {
  return holdings.filter(holding => holding.lifecycle_status !== 'inactive' && holding.lifecycle_status !== 'staged');
}

export function portfolioAccounts(holdings: Holding[]): PortfolioAccount[] {
  const grouped = new Map<string, PortfolioAccount>();
  for (const holding of activeHoldings(holdings)) {
    const label = (holding.account_display || '').trim() || 'Investments';
    const row = grouped.get(label) ?? {
      label,
      value: 0,
      fidelity: /fidelity/i.test(label),
      positions: 0,
    };
    row.value += holdingMarketValue(holding);
    row.positions += 1;
    grouped.set(label, row);
  }
  return [...grouped.values()].sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
}

export function largestPositions(holdings: Holding[], limit = 3): PositionHighlight[] {
  return activeHoldings(holdings)
    .map(holding => ({
      symbol: (holding.symbol || '').trim().toUpperCase() || 'Unnamed',
      value: holdingMarketValue(holding),
      account: (holding.account_display || '').trim() || 'Investments',
    }))
    .sort((a, b) => b.value - a.value || a.symbol.localeCompare(b.symbol))
    .slice(0, limit);
}

export function financeSnapshot(assets: Asset[], liabilities: Liability[], holdings: Holding[]): NetWorth {
  return computeNetWorth(assets, liabilities, holdings);
}

export function priceFreshnessSummary(holdings: Holding[], asOf?: string): string {
  const rows = activeHoldings(holdings);
  if (!rows.length) return 'No investment positions yet';
  const states = rows.map(row => quoteFreshness(row, asOf));
  if (states.some(state => state === 'Stale')) return 'Some prices are stale';
  if (states.some(state => state === 'Unavailable' || state === 'Unknown')) return 'Some price dates are unknown';
  if (states.every(state => state === 'Imported' || state === 'Provisional')) return 'Values are from your last import';
  return 'Prices are current';
}

export function hasManualCashAndBrokerage(assets: Asset[], holdings: Holding[]): boolean {
  const cashAsset = assets.some(asset => /cash|sweep|money market/i.test(asset.name || ''));
  const brokerage = activeHoldings(holdings).length > 0;
  return cashAsset && brokerage;
}

export function buildFinanceHubSnapshot(assets: Asset[], liabilities: Liability[], holdings: Holding[]): FinanceHubSnapshot {
  return {
    netWorth: financeSnapshot(assets, liabilities, holdings),
    accounts: portfolioAccounts(holdings),
    positions: largestPositions(holdings),
    freshness: priceFreshnessSummary(holdings),
    cashOverlap: hasManualCashAndBrokerage(assets, holdings),
  };
}
