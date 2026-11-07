import { DestroyRef, Injectable, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { SESSION_CONTEXT } from '@vivek/ui';
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
import { silentErrorToast } from '@vivek/ui';
import { EncryptedStoreService } from '../crypto/encrypted-store.service';
import { FinanceImportService } from './finance-import.service';
import { FinanceMarketCoordinator } from './finance-market-coordinator';
import { EncryptedCollection } from '../crypto/encrypted-store.service';
import { hasDek, readLockEpoch } from '../crypto/dek-holder';
import { bindLockSnapshots } from '../crypto/lock-finance';
import { VaultService, type VaultWriteOptions } from '../crypto/vault.service';
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
import { BrokerageAccountRecord, FidelityStageRecord } from '../utils/fidelity-import.util';

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
  private market: FinanceMarketCoordinator;

  constructor(
    private http: HttpClient,
    private vault: VaultService,
    private encStore: EncryptedStoreService,
    private financeImports: FinanceImportService
  ) {
    const releaseSnapshots = bindLockSnapshots(() => this.clearSessionState());
    inject(DestroyRef).onDestroy(releaseSnapshots);
    inject(SESSION_CONTEXT, { optional: true })?.cleared$?.pipe(takeUntilDestroyed()).subscribe(() => this.clearSessionState());
    this.market = new FinanceMarketCoordinator(this.encStore, {
      sessionToken: () => this.encStore.sessionToken,
      dataEpoch: collections => this.dataEpoch(collections),
      publishHoldings: rows => this._holdings.next(rows),
      publishJobIncomes: rows => this._jobIncomes.next(rows),
      afterQuoteChanges: () => {
        this.invalidateDashboardCache();
        this.refreshDerivedMetrics();
      },
    });
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

  /** Callers that show their own error pass silent so only that write skips the fallback toast. */
  private commit<T>(work: (options: VaultWriteOptions) => Promise<T>, silent = false): Observable<T> {
    return from(work(silent ? { silent: true } : {}));
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

  /**
   * B0F2 N2 (defense in depth — the store itself throws when locked): a read
   * that resolves after the vault locked must not hand decrypted rows to the
   * subscriber or publish them into a subject. It completes silently instead,
   * the same shape getAssets and getNetWorth already use.
   */
  private guardedRead<T>(read: () => Promise<T>, publish: (value: T) => void): Observable<T> {
    const lock = readLockEpoch();
    return new Observable(subscriber => {
      void read().then(value => {
        if (lock !== readLockEpoch() || !hasDek()) { subscriber.complete(); return; }
        publish(value);
        subscriber.next(value);
        subscriber.complete();
      }, (error: unknown) => subscriber.error(error));
    });
  }

  /** A write-back publishes only when the vault stayed unlocked for the whole write. */
  private publishValueIfUnlocked<T>(lock: number, subject: BehaviorSubject<T>, value: T): void {
    if (lock === readLockEpoch() && hasDek()) subject.next(value);
  }

  private async publishReadBackIfUnlocked<T>(
    lock: number,
    subject: BehaviorSubject<T[]>,
    read: () => Promise<T[]>
  ): Promise<void> {
    this.publishValueIfUnlocked(lock, subject, await read());
  }

  getConfiguredMarketSymbols(): Promise<string[]> {
    return this.market.getConfiguredSymbols();
  }

  applyMarketQuoteForSymbol(
    symbol: string,
    quote: MarketPriceQuote,
    expectedSessionToken: number
  ): Promise<MarketQuoteApplyResult> {
    return this.market.applyQuoteForSymbol(symbol, quote, expectedSessionToken);
  }

  /** Replaces only clean encrypted snapshots after another tab reports a scoped invalidation. */
  async refreshCollectionsFromAnotherTab(collections: EncryptedCollection[]): Promise<void> {
    const unique = [...new Set(collections)];
    this.snapshotEpoch += 1;
    this.invalidateDashboardCache();
    unique.forEach(collection => this.bumpCollectionEpoch(collection));
    const epochs = new Map<EncryptedCollection, string>(unique.map(collection => [collection, this.dataEpoch([collection])]));
    const sessionToken = this.encStore.sessionToken;
    await this.encStore.reloadCollections(unique, { silent: true });
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
      const request = forkJoin([
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
    return this.guardedRead(async () => {
      const rows = await this.encStore.getTransactions();
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
      return out.slice(skip, skip + limit);
    }, out => {
      if (epoch === this.dataEpoch(['transactions'])) {
        if (options?.append) this._transactions.next([...this._transactions.value, ...out]);
        else this._transactions.next(out);
      }
    });
  }

  /** Full encrypted ledger for totals that must stay correct when the visible table is paged. */
  getAllTransactions(): Observable<Transaction[]> {
    return from(this.encStore.getTransactions());
  }

  getDashboardTransactions(_options?: { limit?: number }): Observable<Transaction[]> {
    const epoch = this.dataEpoch(['transactions']);
    // Dashboard totals must use the complete ledger; visible pagination is a component concern.
    return this.guardedRead(() => this.encStore.getTransactions(), rows => {
      if (epoch === this.dataEpoch(['transactions'])) this._dashboardTransactions.next(rows);
    });
  }

  getCashflowSummary(startDate: string, endDate: string): Observable<CashflowSummary> {
    const dependencies: EncryptedCollection[] = ['transactions', 'job_incomes', 'fixed_expenses', 'subscriptions'];
    const epoch = this.dataEpoch(dependencies);
    return this.guardedRead(async () => (await this.encStore.getCashflowSummary(startDate, endDate)) as CashflowSummary, summary => {
      if (epoch === this.dataEpoch(dependencies)) this._cashflowSummary.next(summary);
    });
  }

  getCashflowSummaryForCurrentMonth(): Observable<CashflowSummary> {
    const now = new Date();
    const start = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    const endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const end = `${endDate.getFullYear()}-${String(endDate.getMonth() + 1).padStart(2, '0')}-${String(endDate.getDate()).padStart(2, '0')}`;
    return this.getCashflowSummary(start, end);
  }

  addTransaction(tx: TransactionCreate, silent = false): Observable<Transaction> {
    return this.commit(async options => {
      const lock = readLockEpoch();
      const row = await this.encStore.addTransaction(tx as Omit<Transaction, 'id'>, options);
      await this.publishReadBackIfUnlocked(lock, this._transactions, () => this.encStore.getTransactions());
      this.invalidateDashboardCache();
      return row;
    }, silent);
  }

  updateTransaction(id: number, tx: Partial<TransactionCreate>, silent = false): Observable<Transaction> {
    return this.commit(async options => {
      const lock = readLockEpoch();
      const row = await this.encStore.updateTransaction(id, tx as Partial<Transaction>, options);
      await this.publishReadBackIfUnlocked(lock, this._transactions, () => this.encStore.getTransactions());
      this.invalidateDashboardCache();
      return row;
    }, silent);
  }

  restoreTransaction(record: Transaction, silent = false): Observable<{ record: Transaction; outcome: 'restored' | 'already-restored' }> {
    return this.commit(async options => {
      const result = await this.encStore.restoreTransaction(record, options);
      this._transactions.next(await this.encStore.getTransactions());
      this.invalidateDashboardCache();
      return result;
    }, silent);
  }

  deleteTransaction(id: number, silent = false): Observable<{ ok: boolean }> {
    return this.commit(async options => {
      const lock = readLockEpoch();
      await this.encStore.deleteTransaction(id, options);
      await this.publishReadBackIfUnlocked(lock, this._transactions, () => this.encStore.getTransactions());
      this.invalidateDashboardCache();
      return { ok: true };
    }, silent);
  }

  getJobIncomes(): Observable<JobIncome[]> {
    const epoch = this.dataEpoch(['job_incomes']);
    return this.guardedRead(() => this.encStore.getJobIncomes(), rows => {
      if (epoch === this.dataEpoch(['job_incomes'])) this._jobIncomes.next(rows);
    });
  }

  addJobIncome(body: JobIncomeCreate, silent = false): Observable<JobIncome> {
    return this.commit(async options => {
      const lock = readLockEpoch();
      const row = await this.encStore.addJobIncome(body, options);
      await this.publishReadBackIfUnlocked(lock, this._jobIncomes, () => this.encStore.getJobIncomes());
      this.invalidateDashboardCache();
      return row;
    }, silent);
  }

  updateJobIncome(id: number, body: Partial<JobIncomeCreate>, silent = false): Observable<JobIncome> {
    return this.commit(async options => {
      const lock = readLockEpoch();
      const row = await this.encStore.updateJobIncome(id, body, options);
      await this.publishReadBackIfUnlocked(lock, this._jobIncomes, () => this.encStore.getJobIncomes());
      this.invalidateDashboardCache();
      return row;
    }, silent);
  }

  deleteJobIncome(id: number, silent = false): Observable<{ ok: boolean }> {
    return this.commit(async options => {
      const lock = readLockEpoch();
      await this.encStore.deleteJobIncome(id, options);
      await this.publishReadBackIfUnlocked(lock, this._jobIncomes, () => this.encStore.getJobIncomes());
      this.invalidateDashboardCache();
      return { ok: true };
    }, silent);
  }

  getFixedExpenses(): Observable<FixedExpense[]> {
    const epoch = this.dataEpoch(['fixed_expenses']);
    return this.guardedRead(() => this.encStore.getFixedExpenses(), rows => {
      if (epoch === this.dataEpoch(['fixed_expenses'])) this._fixedExpenses.next(rows);
    });
  }

  getSubscriptions(): Observable<Subscription[]> {
    const epoch = this.dataEpoch(['subscriptions']);
    return this.guardedRead(() => this.encStore.getSubscriptions(), rows => {
      if (epoch === this.dataEpoch(['subscriptions'])) this._subscriptions.next(rows);
    });
  }

  addSubscription(body: SubscriptionCreate, silent = false): Observable<Subscription> {
    return this.commit(async options => {
      const lock = readLockEpoch();
      const row = await this.encStore.addSubscription(body, options);
      await this.publishReadBackIfUnlocked(lock, this._subscriptions, () => this.encStore.getSubscriptions());
      this.invalidateDashboardCache();
      return row;
    }, silent);
  }

  updateSubscription(id: number, body: Partial<SubscriptionCreate>, silent = false): Observable<Subscription> {
    return this.commit(async options => {
      const lock = readLockEpoch();
      const row = await this.encStore.updateSubscription(id, body, options);
      await this.publishReadBackIfUnlocked(lock, this._subscriptions, () => this.encStore.getSubscriptions());
      this.invalidateDashboardCache();
      return row;
    }, silent);
  }

  deleteSubscription(id: number, silent = false): Observable<{ ok: boolean }> {
    return this.commit(async options => {
      const lock = readLockEpoch();
      await this.encStore.deleteSubscription(id, options);
      await this.publishReadBackIfUnlocked(lock, this._subscriptions, () => this.encStore.getSubscriptions());
      this.invalidateDashboardCache();
      return { ok: true };
    }, silent);
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
    return this.http.post<{ ok: boolean }>(apiUrl('/auth/reset-data'), { confirm: 'CLEAR MY DATA' }, { context: silentErrorToast() }).pipe(
      tap(() => this.clearSessionState())
    );
  }

  addFixedExpense(body: FixedExpenseCreate, silent = false): Observable<FixedExpense> {
    return this.commit(async options => {
      const lock = readLockEpoch();
      const row = await this.encStore.addFixedExpense(body, options);
      await this.publishReadBackIfUnlocked(lock, this._fixedExpenses, () => this.encStore.getFixedExpenses());
      this.invalidateDashboardCache();
      return row;
    }, silent);
  }

  updateFixedExpense(id: number, body: Partial<FixedExpenseCreate>, silent = false): Observable<FixedExpense> {
    return this.commit(async options => {
      const lock = readLockEpoch();
      const row = await this.encStore.updateFixedExpense(id, body, options);
      await this.publishReadBackIfUnlocked(lock, this._fixedExpenses, () => this.encStore.getFixedExpenses());
      this.invalidateDashboardCache();
      return row;
    }, silent);
  }

  deleteFixedExpense(id: number, silent = false): Observable<{ ok: boolean }> {
    return this.commit(async options => {
      const lock = readLockEpoch();
      await this.encStore.deleteFixedExpense(id, options);
      await this.publishReadBackIfUnlocked(lock, this._fixedExpenses, () => this.encStore.getFixedExpenses());
      this.invalidateDashboardCache();
      return { ok: true };
    }, silent);
  }

  renameCategory(fromCategory: string, toCategory: string): Observable<CategoryRenameResult> {
    const from_category = fromCategory.trim();
    const to_category = toCategory.trim();
    const lock = readLockEpoch();
    return from(this.encStore.bulkRenameTransactionCategories([{ fromCategory: from_category, toCategory: to_category }]).then(async result => {
      this.invalidateDashboardCache();
      await this.publishReadBackIfUnlocked(lock, this._transactions, () => this.encStore.getTransactions());
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
    const lock = readLockEpoch();
    return from(this.encStore.bulkRenameTransactionCategories(rows).then(async result => {
      this.invalidateDashboardCache();
      await this.publishReadBackIfUnlocked(lock, this._transactions, () => this.encStore.getTransactions());
      return {
        updated: result.updated,
        renames: payload.renames.map(row => ({ ...row, updated: 0 })),
      };
    }));
  }

  bulkCategorizeMerchant(merchant: string, category: string): Observable<{ updated: number; conflicts: number }> {
    const lock = readLockEpoch();
    return from(this.encStore.bulkCategorizeMerchant(merchant, category).then(async result => {
      await this.publishReadBackIfUnlocked(lock, this._transactions, () => this.encStore.getTransactions());
      this.invalidateDashboardCache();
      return result;
    }));
  }

  getHoldings(_refreshPrices = false): Observable<Holding[]> {
    const epoch = this.dataEpoch(['holdings']);
    return this.guardedRead(() => this.encStore.getHoldings(), rows => {
      if (epoch === this.dataEpoch(['holdings'])) this._holdings.next(rows);
    });
  }

  refreshAllHoldingPrices(): Observable<{ holdings: Holding[]; updated: number; failed: number }> {
    const lock = readLockEpoch();
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
            this.publishValueIfUnlocked(lock, this._holdings, refreshed);
            this.refreshDerivedMetrics();
            return { holdings: refreshed, ...result };
          })
        );
      })
    );
  }

  refreshHoldingPrice(holdingId: number): Observable<Holding> {
    const lock = readLockEpoch();
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
              await this.publishReadBackIfUnlocked(lock, this._holdings, () => this.encStore.getHoldings());
              this.refreshDerivedMetrics();
              return updated;
            }));
          })
        );
      })
    );
  }

  confirmHoldingPosition(holdingId: number, asOfDate: string): Observable<Holding> {
    const lock = readLockEpoch();
    return from(this.encStore.updateHolding(holdingId, { position_as_of: asOfDate }).then(async row => {
      await this.publishReadBackIfUnlocked(lock, this._holdings, () => this.encStore.getHoldings());
      this.refreshDerivedMetrics();
      return row;
    }));
  }

  lookupSharePrice(symbol: string, refresh = true): Observable<MarketPriceQuote> {
    const upper = symbol.trim().toUpperCase();
    let params = new HttpParams();
    if (refresh) params = params.set('refresh', 'true');
    return this.http.get<MarketPriceQuote>(apiUrl(`/market/price/${encodeURIComponent(upper)}`), { params, context: silentErrorToast() });
  }

  addHolding(holding: HoldingCreate, silent = false): Observable<Holding> {
    return this.commit(async options => {
      const lock = readLockEpoch();
      const row = await this.encStore.addHolding(holding, options);
      await this.publishReadBackIfUnlocked(lock, this._holdings, () => this.encStore.getHoldings());
      this.refreshDerivedMetrics();
      return row;
    }, silent);
  }

  updateHolding(id: number, holding: Partial<HoldingCreate>, silent = false): Observable<Holding> {
    return this.commit(async options => {
      const lock = readLockEpoch();
      const row = await this.encStore.updateHolding(id, holding as Partial<Holding>, this.encStore.sessionToken, options);
      await this.publishReadBackIfUnlocked(lock, this._holdings, () => this.encStore.getHoldings());
      this.refreshDerivedMetrics();
      return row;
    }, silent);
  }

  deleteHolding(id: number, silent = false): Observable<{ ok: boolean }> {
    return this.commit(async options => {
      const lock = readLockEpoch();
      await this.encStore.deleteHolding(id, options);
      await this.publishReadBackIfUnlocked(lock, this._holdings, () => this.encStore.getHoldings());
      this.refreshDerivedMetrics();
      return { ok: true };
    }, silent);
  }

  getNetWorth(): Observable<NetWorth> {
    const dependencies: EncryptedCollection[] = ['holdings', 'assets', 'liabilities'];
    const epoch = this.dataEpoch(dependencies), lock = readLockEpoch();
    return new Observable(subscriber => { void this.encStore.getNetWorth().then(nw => {
      if (!hasDek() || lock !== readLockEpoch()) { subscriber.complete(); return; }
      if (epoch === this.dataEpoch(dependencies)) this._netWorth.next(nw);
      subscriber.next(nw); subscriber.complete();
    }, (error: unknown) => subscriber.error(error)); });
  }

  getAssets(): Observable<Asset[]> {
    const epoch = this.dataEpoch(['assets']);
    const lock = readLockEpoch();
    return new Observable(subscriber => {
      void this.encStore.getAssets().then(rows => {
        if (lock !== readLockEpoch() || !hasDek()) return subscriber.complete();
        if (epoch === this.dataEpoch(['assets'])) this._assets.next(rows);
        subscriber.next(rows);
        subscriber.complete();
      }, (error: unknown) => subscriber.error(error));
    });
  }

  addAsset(body: AssetCreate, silent = false): Observable<Asset> {
    return this.commit(async options => {
      const lock = readLockEpoch();
      const row = await this.encStore.addAsset(body, options);
      await this.publishReadBackIfUnlocked(lock, this._assets, () => this.encStore.getAssets());
      this.refreshDerivedMetrics();
      return row;
    }, silent);
  }

  updateAsset(id: number, body: Partial<AssetCreate>, silent = false): Observable<Asset> {
    return this.commit(async options => {
      const lock = readLockEpoch();
      const row = await this.encStore.updateAsset(id, body, options);
      await this.publishReadBackIfUnlocked(lock, this._assets, () => this.encStore.getAssets());
      this.refreshDerivedMetrics();
      return row;
    }, silent);
  }

  deleteAsset(id: number, silent = false): Observable<{ ok: boolean }> {
    return this.commit(async options => {
      const lock = readLockEpoch();
      await this.encStore.deleteAsset(id, options);
      await this.publishReadBackIfUnlocked(lock, this._assets, () => this.encStore.getAssets());
      this.refreshDerivedMetrics();
      return { ok: true };
    }, silent);
  }

  getLiabilities(): Observable<Liability[]> {
    const epoch = this.dataEpoch(['liabilities']);
    return this.guardedRead(() => this.encStore.getLiabilities(), rows => {
      if (epoch === this.dataEpoch(['liabilities'])) this._liabilities.next(rows);
    });
  }

  addLiability(body: LiabilityCreate, silent = false): Observable<Liability> {
    return this.commit(async options => {
      const lock = readLockEpoch();
      const row = await this.encStore.addLiability(body, options);
      await this.publishReadBackIfUnlocked(lock, this._liabilities, () => this.encStore.getLiabilities());
      this.refreshDerivedMetrics();
      return row;
    }, silent);
  }

  updateLiability(id: number, body: Partial<LiabilityCreate>, silent = false): Observable<Liability> {
    return this.commit(async options => {
      const lock = readLockEpoch();
      const row = await this.encStore.updateLiability(id, body, options);
      await this.publishReadBackIfUnlocked(lock, this._liabilities, () => this.encStore.getLiabilities());
      this.refreshDerivedMetrics();
      return row;
    }, silent);
  }

  deleteLiability(id: number, silent = false): Observable<{ ok: boolean }> {
    return this.commit(async options => {
      const lock = readLockEpoch();
      await this.encStore.deleteLiability(id, options);
      await this.publishReadBackIfUnlocked(lock, this._liabilities, () => this.encStore.getLiabilities());
      this.refreshDerivedMetrics();
      return { ok: true };
    }, silent);
  }

  getImportBanks(): Observable<BankImportOption[]> {
    return of(this.financeImports.listBanks());
  }

  previewBankImport(bankSlug: string, file: File): Observable<ImportPreviewResult> {
    return from(this.financeImports.previewBank(bankSlug, file));
  }

  previewBankImports(files: BankImportFile[]): Observable<BankImportFilePreview[]> {
    return from(this.financeImports.previewBanks(files));
  }

  getBankAccounts(): Observable<BankAccountRecord[]> {
    return from(this.financeImports.getBankAccounts());
  }

  getImportReceipts(): Observable<ImportReceipt[]> {
    return from(this.financeImports.getReceipts());
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
    return from(this.financeImports.commitBanks(rows, context)).pipe(tap(() => this.refreshAfterImport()));
  }

  resumeBankImport(receiptId: number): Observable<ImportCommitResult> {
    return from(this.financeImports.resumeBankReceipt(receiptId)).pipe(tap(() => this.refreshAfterImport()));
  }

  undoBankImport(receiptId: number): Observable<{ removed: number; edited: number; missing: number }> {
    return from(this.financeImports.undoBankReceipt(receiptId)).pipe(tap(() => this.refreshAfterImport()));
  }

  commitBankImport(
    _bankSlug: string,
    _filename: string,
    rows: ImportPreviewRow[]
  ): Observable<ImportCommitResult> {
    return from(this.financeImports.commitBank(rows)).pipe(tap(() => this.refreshAfterImport()));
  }

  getBrokerageImports(): Observable<FidelityImportOption[]> {
    return of(this.financeImports.listBrokerages());
  }

  previewFidelityImport(file: File): Observable<FidelityPreviewResult> {
    return from(this.financeImports.previewFidelity(file));
  }

  commitFidelityImport(
    filename: string,
    rows: FidelityPreviewRow[],
    selectedAccountMasks?: string[],
  ): Observable<FidelityCommitResult> {
    return from(this.financeImports.commitFidelity(filename, rows, selectedAccountMasks)).pipe(
      tap(() => {
        this.invalidateDashboardCache();
        this.getHoldings().pipe(take(1)).subscribe();
        this.getNetWorth().pipe(take(1)).subscribe();
      })
    );
  }

  getBrokerageAccounts(): Observable<BrokerageAccountRecord[]> {
    return from(this.financeImports.getBrokerageAccounts());
  }

  getHoldingImportStages(): Observable<FidelityStageRecord[]> {
    return from(this.financeImports.getHoldingStages());
  }

  resumeFidelityImportStage(stageId: number): Observable<FidelityCommitResult> {
    return from(this.financeImports.resumeHoldingStage(stageId)).pipe(
      tap(() => {
        this.invalidateDashboardCache();
        this.getHoldings().pipe(take(1)).subscribe();
        this.getNetWorth().pipe(take(1)).subscribe();
      })
    );
  }

  setAccountNickname(accountId: number, nickname: string | null): Observable<unknown> {
    return from(this.financeImports.setAccountNickname(accountId, nickname)).pipe(
      tap(() => {
        this.invalidateDashboardCache();
        this.getHoldings().pipe(take(1)).subscribe();
        this.getNetWorth().pipe(take(1)).subscribe();
      })
    );
  }

}
