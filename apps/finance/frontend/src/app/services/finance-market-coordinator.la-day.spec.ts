import type { EncryptedStoreService } from '../crypto/encrypted-store.service';
import type { Holding, MarketPriceQuote } from '../models/transaction.model';
import { FinanceMarketCoordinator, type FinanceMarketStatePort } from './finance-market-coordinator';

/**
 * The future-quote guard must read the Los Angeles calendar day (issue
 * #113's decided day semantics), not the UTC day. At 17:30 PDT on Monday
 * 2026-10-12, Los Angeles is on 2026-10-12 while UTC is on 2026-10-13.
 */
describe('FinanceMarketCoordinator quote-date guard (Los Angeles day)', () => {
  let store: jasmine.SpyObj<EncryptedStoreService>;
  let coordinator: FinanceMarketCoordinator;

  const quote = (quoteDate: string): MarketPriceQuote => ({
    symbol: 'AAPL', price: 125, price_source: 'live_eod', quote_date: quoteDate, valid: true,
  });

  beforeEach(() => {
    jasmine.clock().install();
    jasmine.clock().mockDate(new Date('2026-10-12T17:30:00-07:00'));
    store = jasmine.createSpyObj<EncryptedStoreService>('EncryptedStoreService', [
      'getHoldings', 'getJobIncomes', 'updateHoldingPrice', 'updateJobIncomeMarketQuote',
    ]);
    store.getHoldings.and.resolveTo([{ id: 1, symbol: 'AAPL' } as unknown as Holding]);
    store.getJobIncomes.and.resolveTo([]);
    store.updateHoldingPrice.and.resolveTo({ id: 1, symbol: 'AAPL' } as unknown as Holding);
    const state: FinanceMarketStatePort = {
      sessionToken: () => 5,
      dataEpoch: () => 'epoch',
      publishHoldings: () => undefined,
      publishJobIncomes: () => undefined,
      afterQuoteChanges: () => undefined,
    };
    coordinator = new FinanceMarketCoordinator(store, state);
  });

  afterEach(() => jasmine.clock().uninstall());

  it('applies a quote dated the Los Angeles day at the evening boundary', async () => {
    const result = await coordinator.applyQuoteForSymbol('AAPL', quote('2026-10-12'), 5);
    expect(result.holdingsUpdated).toBe(1);
    expect(store.updateHoldingPrice).toHaveBeenCalledTimes(1);
  });

  it('rejects a quote dated the day after the Los Angeles day even though it is the UTC day', async () => {
    await expectAsync(coordinator.applyQuoteForSymbol('AAPL', quote('2026-10-13'), 5))
      .toBeRejectedWithError(/invalid or future trading date/);
    expect(store.updateHoldingPrice).not.toHaveBeenCalled();
  });
});
