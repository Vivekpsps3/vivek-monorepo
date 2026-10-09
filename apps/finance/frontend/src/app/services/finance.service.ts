import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import {
  BehaviorSubject,
  Observable,
  forkJoin,
  from,
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
import { VaultService } from '../crypto/vault.service';
import {
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
} from '../utils/bank-import.util';
import {
  buildFidelityImportPreview,
  commitFidelityImportRows,
  listClientBrokerageImports,
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

@Injectable({ providedIn: 'root' })
export class FinanceService {
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
  ) {}

  loadDashboard(force = false): Observable<DashboardLoadResult> {
    if (force) this.dashboardLoad$ = null;
    if (!this.dashboardLoad$) {
      this.dashboardLoad$ = forkJoin([
        this.getDashboardTransactions({ limit: 5000 }),
        this.getHoldings(),
        this.getAssets(),
        this.getNetWorth(),
        this.getCashflowSummaryForCurrentMonth(),
        this.getJobIncomes(),
        this.getFixedExpenses(),
        this.getSubscriptions(),
      ]).pipe(
        shareReplay({ bufferSize: 1, refCount: false }),
        catchError(err => {
          this.dashboardLoad$ = null;
          return throwError(() => err);
        })
      );
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
    this.getTransactions({ limit: 5000 }).pipe(take(1)).subscribe();
  }

  refreshAll(): Observable<DashboardLoadResult> {
    this.dashboardLoad$ = null;
    this.isLoading.next(true);
    return forkJoin([
      this.getDashboardTransactions({ limit: 5000 }),
      this.getHoldings(),
      this.getAssets(),
      this.getNetWorth(),
      this.getCashflowSummaryForCurrentMonth(),
      this.getJobIncomes(),
      this.getFixedExpenses(),
      this.getSubscriptions(),
    ]).pipe(
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
    return from(this.encStore.getTransactions().then(rows => {
      let out = rows;
      if (options?.search) {
        const q = options.search.toLowerCase();
        out = out.filter(r =>
          (r.description || '').toLowerCase().includes(q) ||
          (r.category || '').toLowerCase().includes(q)
        );
      }
      const skip = options?.skip ?? 0;
      const limit = options?.limit ?? out.length;
      out = out.slice(skip, skip + limit);
      if (options?.append) this._transactions.next([...this._transactions.value, ...out]);
      else this._transactions.next(out);
      return out;
    }));
  }

  getDashboardTransactions(options?: { limit?: number }): Observable<Transaction[]> {
    return from(this.encStore.getTransactions().then(rows => {
      const out = rows.slice(0, options?.limit ?? 5000);
      this._dashboardTransactions.next(out);
      return out;
    }));
  }

  getCashflowSummary(startDate: string, endDate: string): Observable<CashflowSummary> {
    return from(this.encStore.getCashflowSummary(startDate, endDate).then(s => {
      this._cashflowSummary.next(s as CashflowSummary);
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
    return from(this.encStore.getJobIncomes().then(rows => {
      this._jobIncomes.next(rows);
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

  getHoldings(_refreshPrices = false): Observable<Holding[]> {
    return from(this.encStore.getHoldings().then(rows => {
      this._holdings.next(rows);
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
    return from(this.encStore.getHoldings().then(rows => {
      const row = rows.find(r => r.id === holdingId);
      if (!row) throw new Error('Holding not found');
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
    return from(this.encStore.getNetWorth().then(nw => {
      this._netWorth.next(nw);
      return nw;
    }));
  }

  getAssets(): Observable<Asset[]> {
    return from(this.encStore.getAssets().then(rows => {
      this._assets.next(rows);
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
    return from(this.encStore.getLiabilities().then(rows => {
      this._liabilities.next(rows);
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
      return buildBankImportPreviews(files, existing);
    })());
  }

  commitBankImports(rows: ImportPreviewRow[]): Observable<ImportCommitResult> {
    return from(commitBankImportRows(this.encStore, rows)).pipe(tap(() => this.refreshAfterImport()));
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
    _filename: string,
    rows: FidelityPreviewRow[]
  ): Observable<FidelityCommitResult> {
    return from(commitFidelityImportRows(this.encStore, rows)).pipe(
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
