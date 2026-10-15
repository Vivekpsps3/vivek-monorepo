import type { Holding, JobIncome, MarketPriceQuote } from '../models/transaction.model';
import type { EncryptedCollection } from '../crypto/encrypted-store.persistence';
import { EncryptedStoreService } from '../crypto/encrypted-store.service';

export interface FinanceMarketStatePort {
  sessionToken(): number;
  dataEpoch(collections: EncryptedCollection[]): string;
  publishHoldings(rows: Holding[]): void;
  publishJobIncomes(rows: JobIncome[]): void;
  afterQuoteChanges(): void;
}

/** Coordinates validated public quotes with encrypted holdings and employer valuations. */
export class FinanceMarketCoordinator {
  constructor(
    private store: EncryptedStoreService,
    private state: FinanceMarketStatePort
  ) {}

  async getConfiguredSymbols(): Promise<string[]> {
    const [holdings, jobs] = await Promise.all([
      this.store.getHoldings(),
      this.store.getJobIncomes(),
    ]);
    const symbols = [
      ...holdings.map(row => row.symbol),
      ...jobs.map(row => row.stock_symbol || ''),
    ].map(value => value.trim().toUpperCase()).filter(value => /^[A-Z][A-Z0-9.-]*$/.test(value));
    return [...new Set(symbols)].sort();
  }

  async applyQuoteForSymbol(
    symbol: string,
    quote: MarketPriceQuote,
    expectedSessionToken: number
  ): Promise<{ holdingsUpdated: number; employerValuationsUpdated: number; failedRecords: string[] }> {
    const requested = symbol.trim().toUpperCase();
    this.assertUsableQuote(quote, requested);
    if (expectedSessionToken !== this.state.sessionToken()) throw new Error('Vault session changed');
    const [holdings, jobs] = await Promise.all([
      this.store.getHoldings(),
      this.store.getJobIncomes(),
    ]);
    if (expectedSessionToken !== this.state.sessionToken()) throw new Error('Vault session changed');
    const holdingTargets = holdings.filter(row => row.symbol.trim().toUpperCase() === requested);
    const jobTargets = jobs.filter(row => row.stock_symbol?.trim().toUpperCase() === requested);
    let holdingsUpdated = 0;
    let employerValuationsUpdated = 0;
    const failedRecords: string[] = [];
    await Promise.all([
      ...holdingTargets.map(async row => {
        try {
          await this.store.updateHoldingPrice(row.id, quote, expectedSessionToken);
          holdingsUpdated += 1;
        } catch (error) {
          if (expectedSessionToken !== this.state.sessionToken()) throw error;
          failedRecords.push(`holding ${row.id}`);
        }
      }),
      ...jobTargets.map(async row => {
        try {
          await this.store.updateJobIncomeMarketQuote(row.id, requested, quote, expectedSessionToken);
          employerValuationsUpdated += 1;
        } catch (error) {
          if (expectedSessionToken !== this.state.sessionToken()) throw error;
          failedRecords.push(`employer valuation ${row.id}`);
        }
      }),
    ]);
    if (expectedSessionToken !== this.state.sessionToken()) throw new Error('Vault session changed');

    const holdingsEpoch = this.state.dataEpoch(['holdings']);
    const incomesEpoch = this.state.dataEpoch(['job_incomes']);
    const changedCollections: EncryptedCollection[] = [];
    if (holdingsUpdated) {
      const latest = await this.store.getHoldings();
      if (holdingsEpoch === this.state.dataEpoch(['holdings'])
        && expectedSessionToken === this.state.sessionToken()) {
        this.state.publishHoldings(latest);
      }
      changedCollections.push('holdings');
    }
    if (employerValuationsUpdated) {
      const latest = await this.store.getJobIncomes();
      if (incomesEpoch === this.state.dataEpoch(['job_incomes'])
        && expectedSessionToken === this.state.sessionToken()) {
        this.state.publishJobIncomes(latest);
      }
      changedCollections.push('job_incomes');
    }
    if (changedCollections.length) this.state.afterQuoteChanges();
    return { holdingsUpdated, employerValuationsUpdated, failedRecords };
  }

  private assertUsableQuote(quote: MarketPriceQuote, requestedSymbol: string): void {
    const date = quote?.quote_date || '';
    if (!quote?.valid || quote.symbol?.trim().toUpperCase() !== requestedSymbol) {
      throw new Error('Market quote did not match the requested ticker.');
    }
    if (!Number.isFinite(quote.price) || quote.price <= 0) {
      throw new Error('Market quote price must be a positive finite number.');
    }
    if (!isValidMarketDate(date) || date > new Date().toISOString().slice(0, 10)) {
      throw new Error('Market quote has an invalid or future trading date.');
    }
  }
}

function isValidMarketDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}
