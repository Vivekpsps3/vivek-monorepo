import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import {
  BehaviorSubject,
  Subject,
  Observable,
  forkJoin,
  from,
  firstValueFrom,
  of,
  mergeMap,
  reduce,
  tap,
  timeout,
  catchError,
  throwError,
  shareReplay,
  take,
} from 'rxjs';
import { apiUrl } from '../core/api-url';
import { EncryptedStoreService } from '../crypto/encrypted-store.service';
import { EncryptedCollection } from '../crypto/encrypted-store.service';
import { VaultService } from '../crypto/vault.service';
import {
  BankAccountRecord,
  Holding,
  HoldingCreate,
  NetWorth,
  MarketPriceQuote,
  Asset,
  AssetCreate,
  BankImportOption,
  BankImportFile,
  BankImportFilePreview,
  CashflowSummary,
  CategoryBulkRenameResult,
  CategoryRenameResult,
  FixedExpense,
  FixedExpenseCreate,
  FidelityImportOption,
  FidelityPreviewResult,
  FidelityPreviewRow,
  FidelityCommitResult,
  ImportCommitResult,
  ImportReceipt,
  ImportRowNote,
  ImportPreviewResult,
  ImportPreviewRow,
  JobIncome,
  JobIncomeCreate,
  Liability,
  LiabilityCreate,
  Subscription,
  SubscriptionCreate,
  Transaction,
  TransactionCreate,
} from '../models/transaction.model';
import {
  buildBankImportPreview,
  buildBankImportPreviews,
  commitBankImportRows,
  listClientBankImports,
  resumeBankImportReceipt,
} from '../utils/bank-import.util';
import {
  buildFidelityImportPreview,
  commitFidelityImportRows,
  getResumableFidelityStages,
  listClientBrokerageImports,
  resumeFidelityImportStage as resumeStagedFidelityImport,
  BrokerageAccountRecord,
  FidelityStageRecord,
} from '../utils/fidelity-import.util';

export type DashboardLoadResult = [
  Transaction[],
  Holding[],
  Asset[],
  NetWorth,
  CashflowSummary,
  JobIncome[],
  FixedExpense[],
  Subscription[],
];

export interface FinanceDataChange {
  collections: EncryptedCollection[];
  source: 'local' | 'remote';
}

export interface MarketQuoteApplyResult {
  holdingsUpdated: number;
  employerValuationsUpdated: number;
  failedRecords: string[];
}

@Injectable({ providedIn: 'root' })
export class FinanceService {
  private dataChangesSubject = new Subject<FinanceDataChange>();
  private snapshotEpoch = 0;
  private collectionEpochs = new Map<EncryptedCollection, number>();
  readonly dataChanges$ = this.dataChangesSubject.asObservable();
  private _transactions = new BehaviorSubject<Transaction[]>([]);
  private _dashboardTransactions = new BehaviorSubject<Transaction[]>([]);
  private _holdings = new BehaviorSubject<Holding[]>([]);
  private _netWorth = new BehaviorSubject<NetWorth | null>(null);
  private _assets = new BehaviorSubject<Asset[]>([]);
  private _liabilities = new BehaviorSubject<Liability[]>([]);
  private _jobIncomes = new BehaviorSubject<JobIncome[]>([]);
  private _fixedExpenses = new BehaviorSubject<FixedExpense[]>([]);
  private _subscriptions = new BehaviorSubject<Subscription[]>([]);
  private _cashflowSummary = new BehaviorSubject<CashflowSummary | null>(null);

  transactions$ = this._transactions.asObservable();
  dashboardTransactions$ = this._dashboardTransactions.asObservable();
  holdings$ = this._holdings.asObservable();
  netWorth$ = this._netWorth.asObservable();
  assets$ = this._assets.asObservable();
  liabilities$ = this._liabilities.asObservable();
  jobIncomes$ = this._jobIncomes.asObservable();
  fixedExpenses$ = this._fixedExpenses.asObservable();
  subscriptions$ = this._subscriptions.asObservable();
  cashflowSummary$ = this._cashflowSummary.asObservable();

  private isLoading = new BehaviorSubject<boolean>(false);
  isLoading$ = this.isLoading.asObservable();

  private dashboardLoad$: Observable<DashboardLoadResult> | null = null;

  constructor(
    private http: HttpClient,
    private vault: VaultService,
    private encStore: EncryptedStoreService
  ) {
    this.encStore.changes$?.subscribe(change => {
      this.snapshotEpoch += 1;
      this.bumpCollectionEpoch(change.collection);
      this.invalidateDashboardCache();
      if (change.source === 'remote') {
        const epochs = new Map<EncryptedCollection, string>([[change.collection, this.dataEpoch([change.collection])]]);
        void this.refreshCollectionViewsFromStore([change.collection], this.encStore.sessionToken, epochs)
          .catch(() => undefined);
      }
      this.dataChangesSubject.next({ collections: [change.collection], source: change.source });
    });
  }

  get sessionToken(): number {
    return this.encStore.sessionToken;
  }

  private bumpCollectionEpoch(collection: EncryptedCollection): void {
    this.collectionEpochs.set(collection, (this.collectionEpochs.get(collection) ?? 0) + 1);
  }

  private dataEpoch(collections: EncryptedCollection[]): string {
    const versions = [...new Set(collections)].sort().map(collection =>
      `${collection}:${this.collectionEpochs.get(collection) ?? 0}`
    ).join('|');
    return `${this.encStore.sessionToken}::${versions}`;
  }

  async getConfiguredMarketSymbols(): Promise<string[]> {
    const [holdings, jobs] = await Promise.all([
      this.encStore.getHoldings(),
      this.encStore.getJobIncomes(),
    ]);
    const symbols = [
      ...holdings.map(row => row.symbol),
      ...jobs.map(row => row.stock_symbol || ''),
    ].map(value => value.trim().toUpperCase()).filter(value => /^[A-Z][A-Z0-9.-]*$/.test(value));
    return [...new Set(symbols)].sort();
  }

  async applyMarketQuoteForSymbol(
    symbol: string,
    quote: MarketPriceQuote,
    expectedSessionToken: number
  ): Promise<MarketQuoteApplyResult> {
    const requested = symbol.trim().toUpperCase();
    this.assertUsableMarketQuote(quote, requested);
    if (expectedSessionToken !== this.encStore.sessionToken) throw new Error('Vault session changed');
    const [holdings, jobs] = await Promise.all([
      this.encStore.getHoldings(),
      this.encStore.getJobIncomes(),
    ]);
    if (expectedSessionToken !== this.encStore.sessionToken) throw new Error('Vault session changed');
    const holdingTargets = holdings.filter(row => row.symbol.trim().toUpperCase() === requested);
    const jobTargets = jobs.filter(row => row.stock_symbol?.trim().toUpperCase() === requested);
    let holdingsUpdated = 0;
    let employerValuationsUpdated = 0;
    const failedRecords: string[] = [];
    await Promise.all([
      ...holdingTargets.map(async row => {
        try {
          await this.encStore.updateHoldingPrice(row.id, quote, expectedSessionToken);
          holdingsUpdated += 1;
        } catch (error) {
          if (expectedSessionToken !== this.encStore.sessionToken) throw error;
          failedRecords.push(`holding ${row.id}`);
        }
      }),
      ...jobTargets.map(async row => {
        try {
          await this.encStore.updateJobIncomeMarketQuote(row.id, requested, quote, expectedSessionToken);
          employerValuationsUpdated += 1;
        } catch (error) {
          if (expectedSessionToken !== this.encStore.sessionToken) throw error;
          failedRecords.push(`employer valuation ${row.id}`);
        }
      }),
    ]);
    if (expectedSessionToken !== this.encStore.sessionToken) throw new Error('Vault session changed');
    const changedCollections: EncryptedCollection[] = [];
    const holdingsEpoch = this.dataEpoch(['holdings']);
    const incomesEpoch = this.dataEpoch(['job_incomes']);
    if (holdingsUpdated) {
      const latest = await this.encStore.getHoldings();
      if (holdingsEpoch === this.dataEpoch(['holdings']) && expectedSessionToken === this.encStore.sessionToken) this._holdings.next(latest);
      changedCollections.push('holdings');
    }
    if (employerValuationsUpdated) {
      const latest = await this.encStore.getJobIncomes();
      if (incomesEpoch === this.dataEpoch(['job_incomes']) && expectedSessionToken === this.encStore.sessionToken) this._jobIncomes.next(latest);
      changedCollections.push('job_incomes');
    }
    if (changedCollections.length) {
      this.invalidateDashboardCache();
      this.refreshDerivedMetrics();
    }
    return { holdingsUpdated, employerValuationsUpdated, failedRecords };
  }

  private assertUsableMarketQuote(quote: MarketPriceQuote, requestedSymbol: string): void {
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

  /** Replaces only clean encrypted snapshots after another tab reports a scoped invalidation. */
  async refreshCollectionsFromAnotherTab(collections: EncryptedCollection[]): Promise<void> {
    const unique = [...new Set(collections)];
    this.snapshotEpoch += 1;
    this.invalidateDashboardCache();
    unique.forEach(collection => this.bumpCollectionEpoch(collection));
    const epochs = new Map<EncryptedCollection, string>(unique.map(collection => [collection, this.dataEpoch([collection])]));
    const sessionToken = this.encStore.sessionToken;
    await this.encStore.reloadCollections(unique);
    if (sessionToken !== this.encStore.sessionToken) return;
    await this.refreshCollectionViewsFromStore(unique, sessionToken, epochs);
    if (sessionToken !== this.encStore.sessionToken) return;
    this.snapshotEpoch += 1;
    this.invalidateDashboardCache();
    this.dataChangesSubject.next({ collections: unique, source: 'remote' });
  }

  private async refreshCollectionViewsFromStore(
    collections: EncryptedCollection[],
    sessionToken: number,
    expectedEpochs: Map<EncryptedCollection, string>
  ): Promise<void> {
    const unique = [...new Set(collections)];
    const isCurrent = (required: EncryptedCollection[]) => sessionToken === this.encStore.sessionToken
      && required.every(collection => expectedEpochs.get(collection) === this.dataEpoch([collection]));
    if (unique.includes('transactions')) {
      const rows = await this.encStore.getTransactions();
      if (sessionToken !== this.encStore.sessionToken) return;
      if (isCurrent(['transactions'])) {
        this._transactions.next(rows);
        this._dashboardTransactions.next(rows);
      }
    }
    if (unique.includes('holdings')) {
      const rows = await this.encStore.getHoldings();
      if (sessionToken !== this.encStore.sessionToken) return;
      if (isCurrent(['holdings'])) this._holdings.next(rows);
    }
    if (unique.includes('assets')) {
      const rows = await this.encStore.getAssets();
      if (sessionToken !== this.encStore.sessionToken) return;
      if (isCurrent(['assets'])) this._assets.next(rows);
    }
    if (unique.includes('liabilities')) {
      const rows = await this.encStore.getLiabilities();
      if (sessionToken !== this.encStore.sessionToken) return;
      if (isCurrent(['liabilities'])) this._liabilities.next(rows);
    }
    if (unique.includes('job_incomes')) {
      const rows = await this.encStore.getJobIncomes();
      if (sessionToken !== this.encStore.sessionToken) return;
      if (isCurrent(['job_incomes'])) this._jobIncomes.next(rows);
    }
    if (unique.includes('fixed_expenses')) {
      const rows = await this.encStore.getFixedExpenses();
      if (sessionToken !== this.encStore.sessionToken) return;
      if (isCurrent(['fixed_expenses'])) this._fixedExpenses.next(rows);
    }
    if (unique.includes('subscriptions')) {
      const rows = await this.encStore.getSubscriptions();
      if (sessionToken !== this.encStore.sessionToken) return;
      if (isCurrent(['subscriptions'])) this._subscriptions.next(rows);
    }
    const cashflowCollections: EncryptedCollection[] = ['transactions', 'job_incomes', 'fixed_expenses', 'subscriptions'];
    const balanceCollections: EncryptedCollection[] = ['holdings', 'assets', 'liabilities'];
    if (unique.some(name => cashflowCollections.includes(name))) {
      await firstValueFrom(this.getCashflowSummaryForCurrentMonth().pipe(take(1)));
      if (sessionToken !== this.encStore.sessionToken) return;
    }
    if (unique.some(name => balanceCollections.includes(name))) {
      await firstValueFrom(this.getNetWorth().pipe(take(1)));
      if (sessionToken !== this.encStore.sessionToken) return;
    }
  }

  loadDashboard(force = false): Observable<DashboardLoadResult> {
    if (force) this.dashboardLoad$ = null;
    if (!this.dashboardLoad$) {
      const requestedEpoch = this.snapshotEpoch;
      let request!: Observable<DashboardLoadResult>;
      request = forkJoin([
        this.getDashboardTransactions({ limit: 5000 }),
        this.getHoldings(),
        this.getAssets(),
        this.getNetWorth(),
        this.getCashflowSummaryForCurrentMonth(),
        this.getJobIncomes(),
        this.getFixedExpenses(),
        this.getSubscriptions(),
      ]).pipe(
        mergeMap(result => requestedEpoch === this.snapshotEpoch ? of(result) : this.loadDashboard()),
        shareReplay({ bufferSize: 1, refCount: false }),
        catchError(err => {
          if (this.dashboardLoad$ === request) this.dashboardLoad$ = null;
          return throwError(() => err);
        })
      );
      this.dashboardLoad$ = request;
    }
    return this.dashboardLoad$;
  }

  private refreshDerivedMetrics(): void {
    this.getNetWorth().pipe(take(1)).subscribe();
  }

  private invalidateDashboardCache(): void {
    this.dashboardLoad$ = null;
  }

  private refreshAfterImport(): void {
    this.invalidateDashboardCache();
    this.getDashboardTransactions({ limit: 5000 }).pipe(take(1)).subscribe();
    this.getTransactions().pipe(take(1)).subscribe();
  }

  refreshAll(): Observable<DashboardLoadResult> {
    this.isLoading.next(true);
    return this.loadDashboard(true).pipe(
      timeout(60_000),
      tap({
        next: () => this.isLoading.next(false),
        error: () => this.isLoading.next(false),
      }),
      catchError(err => {
        if (err?.name === 'TimeoutError') {
          return throwError(() => new Error('Refresh timed out. Check the API and try again.'));
        }
        return throwError(() => err);
      })
    );
  }

  getTransactions(options?: {
    search?: string;
    skip?: number;
    limit?: number;
    append?: boolean;
  }): Observable<Transaction[]> {
    const epoch = this.dataEpoch(['transactions']);
    return from(this.encStore.getTransactions().then(rows => {
      let out = rows;
      if (options?.search) {
        const q = options.search.toLowerCase();
        out = out.filter(r =>
          (r.description || '').toLowerCase().includes(q) ||
          (r.category || '').toLowerCase().includes(q) ||
          (r.merchant || '').toLowerCase().includes(q) ||
          (r.account_display || '').toLowerCase().includes(q) ||
          (r.kind || '').toLowerCase().includes(q)
        );
      }
      const skip = options?.skip ?? 0;
      const limit = options?.limit ?? out.length;
      out = out.slice(skip, skip + limit);
      if (epoch === this.dataEpoch(['transactions'])) {
        if (options?.append) this._transactions.next([...this._transactions.value, ...out]);
        else this._transactions.next(out);
      }
      return out;
    }));
  }

  /** Full encrypted ledger for totals that must stay correct when the visible table is paged. */
  getAllTransactions(): Observable<Transaction[]> {
    return from(this.encStore.getTransactions());
  }

  getDashboardTransactions(options?: { limit?: number }): Observable<Transaction[]> {
    const epoch = this.dataEpoch(['transactions']);
    return from(this.encStore.getTransactions().then(rows => {
      // Dashboard totals must use the complete ledger; visible pagination is a component concern.
      const out = rows;
      if (epoch === this.dataEpoch(['transactions'])) this._dashboardTransactions.next(out);
      return out;
    }));
  }

  getCashflowSummary(startDate: string, endDate: string): Observable<CashflowSummary> {
    const dependencies: EncryptedCollection[] = ['transactions', 'job_incomes', 'fixed_expenses', 'subscriptions'];
    const epoch = this.dataEpoch(dependencies);
    return from(this.encStore.getCashflowSummary(startDate, endDate).then(s => {
      if (epoch === this.dataEpoch(dependencies)) this._cashflowSummary.next(s as CashflowSummary);
      return s as CashflowSummary;
    }));
  }

  getCashflowSummaryForCurrentMonth(): Observable<CashflowSummary> {
    const now = new Date();
    const start = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    const endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const end = `${endDate.getFullYear()}-${String(endDate.getMonth() + 1).padStart(2, '0')}-${String(endDate.getDate()).padStart(2, '0')}`;
    return this.getCashflowSummary(start, end);
  }

  addTransaction(tx: TransactionCreate): Observable<Transaction> {
    return from(this.encStore.addTransaction(tx as Omit<Transaction, 'id'>).then(async row => {
      this._transactions.next(await this.encStore.getTransactions());
      this.invalidateDashboardCache();
      return row;
    }));
  }

  updateTransaction(id: number, tx: Partial<TransactionCreate>): Observable<Transaction> {
    return from(this.encStore.updateTransaction(id, tx as Partial<Transaction>).then(async row => {
      this._transactions.next(await this.encStore.getTransactions());
      this.invalidateDashboardCache();
      return row;
    }));
  }

  deleteTransaction(id: number): Observable<{ ok: boolean }> {
    return from(this.encStore.deleteTransaction(id).then(async () => {
      this._transactions.next(await this.encStore.getTransactions());
      this.invalidateDashboardCache();
      return { ok: true };
    }));
  }

  getJobIncomes(): Observable<JobIncome[]> {
    const epoch = this.dataEpoch(['job_incomes']);
    return from(this.encStore.getJobIncomes().then(rows => {
      if (epoch === this.dataEpoch(['job_incomes'])) this._jobIncomes.next(rows);
      return rows;
    }));
  }

  addJobIncome(body: JobIncomeCreate): Observable<JobIncome> {
    return from(this.encStore.addJobIncome(body).then(async row => {
      this._jobIncomes.next(await this.encStore.getJobIncomes());
      this.invalidateDashboardCache();
      return row;
    }));
  }

  updateJobIncome(id: number, body: Partial<JobIncomeCreate>): Observable<JobIncome> {
    return from(this.encStore.updateJobIncome(id, body).then(async row => {
      this._jobIncomes.next(await this.encStore.getJobIncomes());
      this.invalidateDashboardCache();
      return row;
    }));
  }

  deleteJobIncome(id: number): Observable<{ ok: boolean }> {
    return from(this.encStore.deleteJobIncome(id).then(async () => {
      this._jobIncomes.next(await this.encStore.getJobIncomes());
      this.invalidateDashboardCache();
      return { ok: true };
    }));
  }

  getFixedExpenses(): Observable<FixedExpense[]> {
    return from(this.encStore.getFixedExpenses().then(rows => {
      this._fixedExpenses.next(rows);
      return rows;
    }));
  }

  getSubscriptions(): Observable<Subscription[]> {
    return from(this.encStore.getSubscriptions().then(rows => {
      this._subscriptions.next(rows);
      return rows;
    }));
  }

  addSubscription(body: SubscriptionCreate): Observable<Subscription> {
    return from(this.encStore.addSubscription(body).then(async row => {
      this._subscriptions.next(await this.encStore.getSubscriptions());
      this.invalidateDashboardCache();
      return row;
    }));
  }

  updateSubscription(id: number, body: Partial<SubscriptionCreate>): Observable<Subscription> {
    return from(this.encStore.updateSubscription(id, body).then(async row => {
      this._subscriptions.next(await this.encStore.getSubscriptions());
      this.invalidateDashboardCache();
      return row;
    }));
  }

  deleteSubscription(id: number): Observable<{ ok: boolean }> {
    return from(this.encStore.deleteSubscription(id).then(async () => {
      this._subscriptions.next(await this.encStore.getSubscriptions());
      this.invalidateDashboardCache();
      return { ok: true };
    }));
  }

  clearSessionState(): void {
    this.snapshotEpoch += 1;
    this.encStore.clear();
    this.vault.lock();
    this.dashboardLoad$ = null;
    this._transactions.next([]);
    this._dashboardTransactions.next([]);
    this._holdings.next([]);
    this._netWorth.next(null);
    this._assets.next([]);
    this._liabilities.next([]);
    this._jobIncomes.next([]);
    this._fixedExpenses.next([]);
    this._subscriptions.next([]);
    this._cashflowSummary.next(null);
  }

  resetMyData(): Observable<{ ok: boolean }> {
    return this.http.post<{ ok: boolean }>(apiUrl('/auth/reset-data'), { confirm: 'CLEAR MY DATA' }).pipe(
      tap(() => this.clearSessionState())
    );
  }

  addFixedExpense(body: FixedExpenseCreate): Observable<FixedExpense> {
    return from(this.encStore.addFixedExpense(body).then(async row => {
      this._fixedExpenses.next(await this.encStore.getFixedExpenses());
      this.invalidateDashboardCache();
      return row;
    }));
  }

  updateFixedExpense(id: number, body: Partial<FixedExpenseCreate>): Observable<FixedExpense> {
    return from(this.encStore.updateFixedExpense(id, body).then(async row => {
      this._fixedExpenses.next(await this.encStore.getFixedExpenses());
      this.invalidateDashboardCache();
      return row;
    }));
  }

  deleteFixedExpense(id: number): Observable<{ ok: boolean }> {
    return from(this.encStore.deleteFixedExpense(id).then(async () => {
      this._fixedExpenses.next(await this.encStore.getFixedExpenses());
      this.invalidateDashboardCache();
      return { ok: true };
    }));
  }

  renameCategory(fromCategory: string, toCategory: string): Observable<CategoryRenameResult> {
    const from_category = fromCategory.trim();
    const to_category = toCategory.trim();
    return from(this.encStore.bulkRenameTransactionCategories([{ fromCategory: from_category, toCategory: to_category }]).then(async result => {
      this.invalidateDashboardCache();
      this._transactions.next(await this.encStore.getTransactions());
      return { updated: result.updated, from_category, to_category };
    }));
  }

  bulkRenameCategories(
    renames: { fromCategory: string; toCategory: string }[]
  ): Observable<CategoryBulkRenameResult> {
    const payload = {
      renames: renames.map(row => ({
        from_category: row.fromCategory.trim(),
        to_category: row.toCategory.trim(),
      })),
    };
    const rows = payload.renames.map(row => ({ fromCategory: row.from_category, toCategory: row.to_category }));
    return from(this.encStore.bulkRenameTransactionCategories(rows).then(async result => {
      this.invalidateDashboardCache();
      this._transactions.next(await this.encStore.getTransactions());
      return {
        updated: result.updated,
        renames: payload.renames.map(row => ({ ...row, updated: 0 })),
      };
    }));
  }

  bulkCategorizeMerchant(merchant: string, category: string): Observable<{ updated: number; conflicts: number }> {
    return from(this.encStore.bulkCategorizeMerchant(merchant, category).then(async result => {
      this._transactions.next(await this.encStore.getTransactions());
      this.invalidateDashboardCache();
      return result;
    }));
  }

  getHoldings(_refreshPrices = false): Observable<Holding[]> {
    const epoch = this.dataEpoch(['holdings']);
    return from(this.encStore.getHoldings().then(rows => {
      if (epoch === this.dataEpoch(['holdings'])) this._holdings.next(rows);
      return rows;
    }));
  }

  refreshAllHoldingPrices(): Observable<{ holdings: Holding[]; updated: number; failed: number }> {
    return from(this.encStore.getHoldings()).pipe(
      mergeMap(holdings => {
        const symbols = [...new Set(holdings.map(row => row.symbol.trim().toUpperCase()).filter(symbol => /^[A-Z][A-Z0-9.-]*$/.test(symbol)))];
        return from(symbols).pipe(
          mergeMap(symbol => this.lookupSharePrice(symbol, true).pipe(
            catchError(() => of(null)),
            mergeMap(quote => from((async () => {
              if (!quote?.valid) return { updated: 0, failed: 1 };
              const matching = holdings.filter(row => row.symbol.trim().toUpperCase() === symbol);
              await Promise.all(matching.map(row => this.encStore.updateHoldingPrice(row.id, quote)));
              return { updated: matching.length, failed: 0 };
            })())
          )), 4),
          reduce((total, result) => ({ updated: total.updated + result.updated, failed: total.failed + result.failed }), { updated: 0, failed: 0 }),
          mergeMap(async result => {
            const refreshed = await this.encStore.getHoldings();
            this._holdings.next(refreshed);
            this.refreshDerivedMetrics();
            return { holdings: refreshed, ...result };
          })
        );
      })
    );
  }

  refreshHoldingPrice(holdingId: number): Observable<Holding> {
    return from(this.encStore.getHoldings()).pipe(
      mergeMap(rows => {
        const row = rows.find(item => item.id === holdingId);
        if (!row) return throwError(() => new Error('Holding not found'));
        if (!/^[A-Z][A-Z0-9.-]*$/i.test(row.symbol.trim())) {
          return throwError(() => new Error('This holding does not have a market ticker.'));
        }
        return this.lookupSharePrice(row.symbol, true).pipe(
          mergeMap(quote => {
            if (!quote.valid) return throwError(() => new Error('No valid market quote was returned.'));
            return from(this.encStore.updateHoldingPrice(row.id, quote).then(async updated => {
              this._holdings.next(await this.encStore.getHoldings());
              this.refreshDerivedMetrics();
              return updated;
            }));
          })
        );
      })
    );
  }

  confirmHoldingPosition(holdingId: number, asOfDate: string): Observable<Holding> {
    return from(this.encStore.updateHolding(holdingId, { position_as_of: asOfDate }).then(async row => {
      this._holdings.next(await this.encStore.getHoldings());
      this.refreshDerivedMetrics();
      return row;
    }));
  }

  lookupSharePrice(symbol: string, refresh = true): Observable<MarketPriceQuote> {
    const upper = symbol.trim().toUpperCase();
    let params = new HttpParams();
    if (refresh) params = params.set('refresh', 'true');
    return this.http.get<MarketPriceQuote>(apiUrl(`/market/price/${encodeURIComponent(upper)}`), { params });
  }

  addHolding(holding: HoldingCreate): Observable<Holding> {
    return from(this.encStore.addHolding(holding).then(async row => {
      this._holdings.next(await this.encStore.getHoldings());
      this.refreshDerivedMetrics();
      return row;
    }));
  }

  updateHolding(id: number, holding: Partial<HoldingCreate>): Observable<Holding> {
    return from(this.encStore.updateHolding(id, holding as Partial<Holding>).then(async row => {
      this._holdings.next(await this.encStore.getHoldings());
      this.refreshDerivedMetrics();
      return row;
    }));
  }

  deleteHolding(id: number): Observable<{ ok: boolean }> {
    return from(this.encStore.deleteHolding(id).then(async () => {
      this._holdings.next(await this.encStore.getHoldings());
      this.refreshDerivedMetrics();
      return { ok: true };
    }));
  }

  getNetWorth(): Observable<NetWorth> {
    const dependencies: EncryptedCollection[] = ['holdings', 'assets', 'liabilities'];
    const epoch = this.dataEpoch(dependencies);
    return from(this.encStore.getNetWorth().then(nw => {
      if (epoch === this.dataEpoch(dependencies)) this._netWorth.next(nw);
      return nw;
    }));
  }

  getAssets(): Observable<Asset[]> {
    const epoch = this.dataEpoch(['assets']);
    return from(this.encStore.getAssets().then(rows => {
      if (epoch === this.dataEpoch(['assets'])) this._assets.next(rows);
      return rows;
    }));
  }

  addAsset(body: AssetCreate): Observable<Asset> {
    return from(this.encStore.addAsset(body).then(async row => {
      this._assets.next(await this.encStore.getAssets());
      this.refreshDerivedMetrics();
      return row;
    }));
  }

  updateAsset(id: number, body: Partial<AssetCreate>): Observable<Asset> {
    return from(this.encStore.updateAsset(id, body).then(async row => {
      this._assets.next(await this.encStore.getAssets());
      this.refreshDerivedMetrics();
      return row;
    }));
  }

  deleteAsset(id: number): Observable<{ ok: boolean }> {
    return from(this.encStore.deleteAsset(id).then(async () => {
      this._assets.next(await this.encStore.getAssets());
      this.refreshDerivedMetrics();
      return { ok: true };
    }));
  }

  getLiabilities(): Observable<Liability[]> {
    const epoch = this.dataEpoch(['liabilities']);
    return from(this.encStore.getLiabilities().then(rows => {
      if (epoch === this.dataEpoch(['liabilities'])) this._liabilities.next(rows);
      return rows;
    }));
  }

  addLiability(body: LiabilityCreate): Observable<Liability> {
    return from(this.encStore.addLiability(body).then(async row => {
      this._liabilities.next(await this.encStore.getLiabilities());
      this.refreshDerivedMetrics();
      return row;
    }));
  }

  updateLiability(id: number, body: Partial<LiabilityCreate>): Observable<Liability> {
    return from(this.encStore.updateLiability(id, body).then(async row => {
      this._liabilities.next(await this.encStore.getLiabilities());
      this.refreshDerivedMetrics();
      return row;
    }));
  }

  deleteLiability(id: number): Observable<{ ok: boolean }> {
    return from(this.encStore.deleteLiability(id).then(async () => {
      this._liabilities.next(await this.encStore.getLiabilities());
      this.refreshDerivedMetrics();
      return { ok: true };
    }));
  }

  getImportBanks(): Observable<BankImportOption[]> {
    return of(listClientBankImports());
  }

  previewBankImport(bankSlug: string, file: File): Observable<ImportPreviewResult> {
    return from(
      (async () => {
        const [content, transactions] = await Promise.all([
          file.text(),
          this.encStore.getTransactions(),
        ]);
        const existing = new Set(
          transactions.map(tx => String((tx as Transaction & { dedupe_key?: string }).dedupe_key || '')).filter(Boolean)
        );
        return buildBankImportPreview(bankSlug, file.name, content, existing);
      })()
    );
  }

  previewBankImports(files: BankImportFile[]): Observable<BankImportFilePreview[]> {
    return from((async () => {
      const transactions = await this.encStore.getTransactions();
      const existing = new Set(
        transactions.map(tx => String((tx as Transaction & { dedupe_key?: string }).dedupe_key || '')).filter(Boolean)
      );
      const legacy = new Set(transactions
        .filter(tx => tx.source === 'import' && !tx.bank_account_key)
        .map(tx => String((tx as Transaction & { dedupe_key?: string }).dedupe_key || ''))
        .filter(Boolean));
      return buildBankImportPreviews(files, existing, legacy);
    })());
  }

  getBankAccounts(): Observable<BankAccountRecord[]> {
    return from(this.encStore.getBankAccounts());
  }

  getImportReceipts(): Observable<ImportReceipt[]> {
    return from(this.encStore.getImportReceipts());
  }

  commitBankImports(
    rows: ImportPreviewRow[],
    context?: {
      bank_slugs?: string[];
      filenames?: string[];
      unresolved?: ImportRowNote[];
      account_displays?: string[];
      coverage?: ImportReceipt['coverage'];
      resume_receipt_id?: number;
      confirmed_bank_accounts?: Array<Omit<BankAccountRecord, 'id'> & { id?: number }>;
    }
  ): Observable<ImportCommitResult> {
    return from(commitBankImportRows(this.encStore, rows, context)).pipe(tap(() => this.refreshAfterImport()));
  }

  resumeBankImport(receiptId: number): Observable<ImportCommitResult> {
    return from(resumeBankImportReceipt(this.encStore, receiptId)).pipe(tap(() => this.refreshAfterImport()));
  }

  undoBankImport(receiptId: number): Observable<{ removed: number; edited: number; missing: number }> {
    return from(this.encStore.undoImportReceipt(receiptId)).pipe(tap(() => this.refreshAfterImport()));
  }

  commitBankImport(
    _bankSlug: string,
    _filename: string,
    rows: ImportPreviewRow[]
  ): Observable<ImportCommitResult> {
    return from(commitBankImportRows(this.encStore, rows)).pipe(
      tap(() => this.refreshAfterImport())
    );
  }

  getBrokerageImports(): Observable<FidelityImportOption[]> {
    return of(listClientBrokerageImports());
  }

  previewFidelityImport(file: File): Observable<FidelityPreviewResult> {
    return from(file.text().then(content => buildFidelityImportPreview(file.name, content)));
  }

  commitFidelityImport(
    filename: string,
    rows: FidelityPreviewRow[],
    selectedAccountMasks?: string[],
  ): Observable<FidelityCommitResult> {
    return from(commitFidelityImportRows(this.encStore, rows, selectedAccountMasks, filename)).pipe(
      tap(() => {
        this.invalidateDashboardCache();
        this.getHoldings().pipe(take(1)).subscribe();
        this.getNetWorth().pipe(take(1)).subscribe();
      })
    );
  }

  getBrokerageAccounts(): Observable<BrokerageAccountRecord[]> {
    return from(this.encStore.getBrokerageAccounts());
  }

  getHoldingImportStages(): Observable<FidelityStageRecord[]> {
    return from(getResumableFidelityStages(this.encStore));
  }

  resumeFidelityImportStage(stageId: number): Observable<FidelityCommitResult> {
    return from(resumeStagedFidelityImport(this.encStore, stageId)).pipe(
      tap(() => {
        this.invalidateDashboardCache();
        this.getHoldings().pipe(take(1)).subscribe();
        this.getNetWorth().pipe(take(1)).subscribe();
      })
    );
  }

  setAccountNickname(accountId: number, nickname: string | null): Observable<unknown> {
    return from(this.encStore.setBrokerageAccountNickname(accountId, nickname)).pipe(
      tap(() => {
        this.invalidateDashboardCache();
        this.getHoldings().pipe(take(1)).subscribe();
        this.getNetWorth().pipe(take(1)).subscribe();
      })
    );
  }
}

function isValidMarketDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}
