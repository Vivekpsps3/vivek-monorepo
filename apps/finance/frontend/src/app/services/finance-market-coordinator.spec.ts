import type { EncryptedStoreService } from '../crypto/encrypted-store.service';
import type { Holding, MarketPriceQuote } from '../models/transaction.model';
import { FinanceMarketCoordinator, type FinanceMarketStatePort } from './finance-market-coordinator';

/**
 * CI3: the future-quote guard must read the Los Angeles calendar day (the
 * decided day semantics), not the UTC day. At 17:30 PDT on Thursday
 * 2026-10-15, Los Angeles is on 2026-10-15 while UTC is on 2026-10-16.
 */
describe('FinanceMarketCoordinator quote-date guard (CI3)', () => {
  let store: jasmine.SpyObj<EncryptedStoreService>;
  let coordinator: FinanceMarketCoordinator;

  const quote = (quoteDate: string): MarketPriceQuote => ({
    symbol: 'AAPL', price: 125, price_source: 'live_eod', quote_date: quoteDate, valid: true,
  });

  beforeEach(() => {
    jasmine.clock().install();
    jasmine.clock().mockDate(new Date('2026-10-15T17:30:00-07:00'));
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
    const result = await coordinator.applyQuoteForSymbol('AAPL', quote('2026-10-15'), 5);
    expect(result.holdingsUpdated).toBe(1);
    expect(store.updateHoldingPrice).toHaveBeenCalledTimes(1);
  });

  it('rejects a quote dated after the Los Angeles day', async () => {
    await expectAsync(coordinator.applyQuoteForSymbol('AAPL', quote('2026-10-17'), 5))
      .toBeRejectedWithError(/invalid or future trading date/);
    expect(store.updateHoldingPrice).not.toHaveBeenCalled();
  });
});
