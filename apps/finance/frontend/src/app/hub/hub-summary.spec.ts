import { Asset, Holding, Liability } from '../models/transaction.model';
import {
  financeSnapshot,
  hasManualCashAndBrokerage,
  largestPositions,
  portfolioAccounts,
  priceFreshnessSummary,
} from './finance-hub-snapshot';
import { journalKindLabel, mediaReleaseLabel } from './hub-summary';

function holding(partial: Partial<Holding>): Holding {
  return {
    id: 1,
    symbol: 'AAPL',
    shares: 1,
    purchase_price: 10,
    purchase_date: '2024-01-01',
    ...partial,
  };
}

describe('hub finance summary', () => {
  const today = '2026-10-15';

  it('uses the balance-sheet net worth and does not double count holdings', () => {
    const holdings = [
      holding({ id: 1, symbol: 'VTI', shares: 2, market_value: 100, account_display: 'Fidelity ···1234' }),
      holding({ id: 2, symbol: 'SPAXX', shares: 1, market_value: 40, account_display: 'Fidelity ···1234' }),
      holding({ id: 3, symbol: 'VXUS', shares: 1, value: 60, account_display: 'Brokerage ···88' }),
      holding({ id: 4, symbol: 'OLD', shares: 9, market_value: 999, lifecycle_status: 'inactive', account_display: 'Fidelity ···1234' }),
    ];
    const net = financeSnapshot(
      [{ id: 1, name: 'Savings', category: 'cash', current_value: 500, as_of_date: today } as Asset],
      [{ id: 1, name: 'Card', category: 'credit', balance_owed: 25, as_of_date: today } as Liability],
      holdings,
    );

    expect(net.portfolio).toBe(200);
    expect(net.total).toBe(675);
    expect(portfolioAccounts(holdings).map(account => [account.label, account.value, account.fidelity])).toEqual([
      ['Fidelity ···1234', 140, true],
      ['Brokerage ···88', 60, false],
    ]);
    expect(portfolioAccounts(holdings).reduce((sum, account) => sum + account.value, 0)).toBe(net.portfolio);
    expect(largestPositions(holdings).map(row => row.symbol)).toEqual(['VTI', 'VXUS', 'SPAXX']);
  });

  it('describes stale and unknown prices without changing values', () => {
    const fresh = holding({ quote_date: '2026-10-14', price_source: 'live_eod', market_value: 10 });
    const stale = holding({ id: 2, symbol: 'MSFT', quote_date: '2026-10-01', price_source: 'live_eod', market_value: 10 });
    const undated = holding({ id: 3, symbol: 'CASH', quote_date: null, price_source: 'manual', market_value: 10 });

    expect(priceFreshnessSummary([fresh], today)).toBe('Prices are current');
    expect(priceFreshnessSummary([fresh, stale], today)).toBe('Some prices are stale');
    expect(priceFreshnessSummary([undated], today)).toBe('Some price dates are unknown');
    expect(financeSnapshot([], [], [stale]).portfolio).toBe(10);
  });

  it('flags brokerage holdings beside a manual cash asset', () => {
    expect(hasManualCashAndBrokerage(
      [{ id: 1, name: 'Checking cash', category: 'cash', current_value: 20, as_of_date: today } as Asset],
      [holding({ market_value: 5 })],
    )).toBeTrue();
    expect(hasManualCashAndBrokerage(
      [{ id: 1, name: 'House', category: 'property', current_value: 20, as_of_date: today } as Asset],
      [holding({ market_value: 5 })],
    )).toBeFalse();
  });

  it('uses the journal kind labels', () => {
    expect(journalKindLabel('tv')).toBe('Series');
    expect(journalKindLabel('book')).toBe('Book');
    expect(journalKindLabel('track')).toBe('Song');
    expect(journalKindLabel('game')).toBe('Game');
  });

  it('keeps month and year releases from looking like a specific day', () => {
    expect(mediaReleaseLabel({ when: 'upcoming', precision: 'year', release_on: '2027-01-01' })).toBe('2027');
    expect(mediaReleaseLabel({ when: 'upcoming', precision: 'month', release_on: '2026-11-01' })).toBe('November 2026');
    expect(mediaReleaseLabel({ when: 'this_month', precision: 'month', release_on: '2026-10-01' })).toBe('This month');
    expect(mediaReleaseLabel({ when: 'unknown', precision: 'unknown', release_on: null })).toBe('No date');
    expect(mediaReleaseLabel({ when: 'upcoming', precision: 'day', release_on: '2026-12-02' })).toBeNull();
  });
});
