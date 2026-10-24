import { Injectable, inject } from '@angular/core';
import { OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { BehaviorSubject, Subject, firstValueFrom, takeUntil, timeout } from 'rxjs';
import { authNavigation } from '../auth/after-auth';
import { AuthService } from '../auth/auth.service';
import { EncryptedCollection } from '../crypto/encrypted-store.service';
import { VaultService } from '../crypto/vault.service';
import { MarketPriceQuote } from '../models/transaction.model';
import { FinanceService } from './finance.service';
import { ToastService, failureCopy } from '@vivek/ui';

export type MarketRefreshPhase = 'idle' | 'refreshing' | 'complete' | 'partial' | 'failed';

export interface MarketRefreshFailure {
  symbol: string;
  message: string;
}

export interface MarketRefreshState {
  phase: MarketRefreshPhase;
  automatic: boolean;
  totalSymbols: number;
  completedSymbols: number;
  updatedHoldings: number;
  updatedEmployerValuations: number;
  failures: MarketRefreshFailure[];
  startedAt: string | null;
  finishedAt: string | null;
}

export interface MarketSymbolRefreshResult {
  symbol: string;
  holdingsUpdated: number;
  employerValuationsUpdated: number;
  failedRecords: string[];
  error?: string;
}

interface TabMessage {
  version: 1;
  userId: number;
  kind: 'invalidate' | 'lock' | 'signout';
  collections?: EncryptedCollection[];
}

const EMPTY_STATE: MarketRefreshState = {
  phase: 'idle',
  automatic: false,
  totalSymbols: 0,
  completedSymbols: 0,
  updatedHoldings: 0,
  updatedEmployerValuations: 0,
  failures: [],
  startedAt: null,
  finishedAt: null,
};

const SYMBOL_PATTERN = /^[A-Z][A-Z0-9.-]*$/;
const MAX_CONCURRENT_QUOTES = 4;
const QUOTE_TIMEOUT_MS = 12_000;

@Injectable({ providedIn: 'root' })
export class MarketRefreshCoordinatorService implements OnDestroy {
  private readonly auth = inject(AuthService);
  private readonly finance = inject(FinanceService);
  private readonly vault = inject(VaultService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly stateSubject = new BehaviorSubject<MarketRefreshState>({ ...EMPTY_STATE });
  private readonly destroy$ = new Subject<void>();
  private sessionCancel$ = new Subject<void>();
  readonly status$ = this.stateSubject.asObservable();
  readonly disclosure = 'Price refresh sends ticker symbols to the market data service. Holdings, shares, balances, and job records stay encrypted in your vault.';

  private channel: BroadcastChannel | null = null;
  private activeUserId: number | null = null;
  private observedUserId: number | null = null;
  private activeSessionKey: string | null = null;
  private activeSessionToken: number | null = null;
  private automaticSessionKey: string | null = null;
  private operationId = 0;
  private inFlightSymbols = new Map<string, Promise<MarketSymbolRefreshResult>>();
  private activeRefreshSymbols = new Set<string>();
  private pendingInvalidations = new Set<EncryptedCollection>();
  private invalidationTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    if (typeof BroadcastChannel !== 'undefined') {
      this.channel = new BroadcastChannel('finance-vault-sync-v1');
      this.channel.onmessage = event => void this.receiveTabMessage(event.data);
    }
    this.auth.user$.pipe(takeUntil(this.destroy$)).subscribe(user => {
      const nextUserId = user?.id ?? null;
      if (this.observedUserId !== nextUserId) {
        this.clearPendingInvalidations();
        this.endSession();
      }
      this.observedUserId = nextUserId;
      this.activeUserId = user?.id ?? null;
    });
    this.finance.dataChanges$.pipe(takeUntil(this.destroy$)).subscribe(change => {
      if (change.source === 'local') this.queueInvalidation(change.collections);
    });
  }

  get currentState(): MarketRefreshState {
    return this.stateSubject.value;
  }

  ngOnDestroy(): void {
    this.endSession();
    this.clearPendingInvalidations();
    this.channel?.close();
    this.destroy$.next();
    this.destroy$.complete();
  }

  /** Called by the authenticated shell after both account validation and vault unlock. */
  startForSession(userId: number, sessionToken = this.finance.sessionToken): void {
    const key = `${userId}:${sessionToken}`;
    if (this.activeSessionKey !== key) {
      this.operationId += 1;
      this.cancelSessionWork();
      this.clearPendingInvalidations();
      this.activeSessionKey = key;
      this.activeSessionToken = sessionToken;
      this.automaticSessionKey = null;
      this.inFlightSymbols.clear();
      this.activeRefreshSymbols = new Set<string>();
      this.stateSubject.next({ ...EMPTY_STATE });
    }
    this.activeUserId = userId;
    if (this.automaticSessionKey === key) return;
    this.automaticSessionKey = key;
    void this.refreshConfiguredSymbols(true);
  }

  endSession(): void {
    this.operationId += 1;
    this.cancelSessionWork();
    this.activeSessionKey = null;
    this.activeSessionToken = null;
    this.automaticSessionKey = null;
    this.inFlightSymbols.clear();
    this.activeRefreshSymbols = new Set<string>();
    this.clearPendingInvalidations();
    if (this.stateSubject.value.phase !== 'idle') this.stateSubject.next({ ...EMPTY_STATE });
  }

  refreshNow(): Promise<MarketRefreshState> {
    return this.refreshConfiguredSymbols(false);
  }

  async refreshSymbol(rawSymbol: string): Promise<MarketSymbolRefreshResult> {
    const symbol = rawSymbol.trim().toUpperCase();
    if (!SYMBOL_PATTERN.test(symbol)) throw new Error('Enter a valid ticker symbol.');
    this.assertActiveSession();
    const token = this.activeSessionToken!;
    const operation = this.operationId;
    const aggregateSymbols = this.stateSubject.value.phase === 'refreshing' ? this.activeRefreshSymbols : null;
    const alreadyInFlight = this.inFlightSymbols.has(symbol);
    const result = await this.fetchAndApply(symbol, token);
    if (operation !== this.operationId) return result;
    // The shell aggregate owns progress while a session refresh is active. A
    // concurrent one-off request may share a ticker or add another ticker, but
    // neither should inflate or prematurely finish the aggregate counters.
    if (!aggregateSymbols && !alreadyInFlight) this.recordManualSymbolResult(result);
    return result;
  }

  broadcastLock(): void {
    this.broadcastSessionMessage('lock');
  }

  broadcastSignOut(): void {
    this.broadcastSessionMessage('signout');
  }

  private async refreshConfiguredSymbols(automatic: boolean): Promise<MarketRefreshState> {
    this.assertActiveSession();
    const operation = ++this.operationId;
    const sessionKey = this.activeSessionKey!;
    const token = this.activeSessionToken!;
    this.activeRefreshSymbols = new Set<string>();
    this.stateSubject.next({
      ...EMPTY_STATE,
      phase: 'refreshing',
      automatic,
      startedAt: new Date().toISOString(),
    });
    try {
      const symbols = [...new Set((await this.finance.getConfiguredMarketSymbols())
        .map(value => value.trim().toUpperCase())
        .filter(value => SYMBOL_PATTERN.test(value)))].sort();
      this.assertCurrentOperation(sessionKey, token, operation);
      symbols.forEach(symbol => this.activeRefreshSymbols.add(symbol));
      if (!symbols.length) {
        const finished = { ...this.stateSubject.value, phase: 'complete' as const, finishedAt: new Date().toISOString() };
        this.stateSubject.next(finished);
        return finished;
      }
      this.stateSubject.next({ ...this.stateSubject.value, totalSymbols: symbols.length });
      const results: MarketSymbolRefreshResult[] = [];
      let index = 0;
      const worker = async (): Promise<void> => {
        while (index < symbols.length) {
          this.assertCurrentOperation(sessionKey, token, operation);
          const symbol = symbols[index++];
          const result = await this.fetchAndApply(symbol, token);
          results.push(result);
          this.publishProgress(operation, result, symbols.length);
        }
      };
      await Promise.all(Array.from({ length: Math.min(MAX_CONCURRENT_QUOTES, symbols.length) }, () => worker()));
      this.assertCurrentOperation(sessionKey, token, operation);
      const failures = results.flatMap(result => [
        ...(result.error ? [{ symbol: result.symbol, message: result.error }] : []),
        ...(result.failedRecords.length ? [{ symbol: result.symbol, message: 'Some saved records could not be updated; their prior values remain.' }] : []),
      ]);
      const current = this.stateSubject.value;
      const savedRecords = results.reduce(
        (total, result) => total + result.holdingsUpdated + result.employerValuationsUpdated,
        0
      );
      const complete: MarketRefreshState = {
        ...current,
        phase: failures.length ? (savedRecords ? 'partial' : 'failed') : 'complete',
        failures,
        finishedAt: new Date().toISOString(),
      };
      this.stateSubject.next(complete);
      return complete;
    } catch (error) {
      if (this.activeSessionKey !== sessionKey || this.activeSessionToken !== token || operation !== this.operationId) return this.stateSubject.value;
      const current = this.stateSubject.value;
      const failed: MarketRefreshState = {
        ...current,
        phase: 'failed',
        failures: [{ symbol: 'Prices', message: this.errorMessage(error) }],
        finishedAt: new Date().toISOString(),
      };
      this.stateSubject.next(failed);
      return failed;
    }
  }

  private fetchAndApply(symbol: string, sessionToken: number): Promise<MarketSymbolRefreshResult> {
    const current = this.inFlightSymbols.get(symbol);
    if (current) return current;
    const sessionCancel = this.sessionCancel$;
    const request = Promise.resolve().then(async (): Promise<MarketSymbolRefreshResult> => {
      try {
        this.assertActiveSession();
        if (sessionToken !== this.activeSessionToken || sessionToken !== this.finance.sessionToken) throw new Error('Vault session changed');
        const quote = await firstValueFrom(
          this.finance.lookupSharePrice(symbol, true).pipe(timeout(QUOTE_TIMEOUT_MS), takeUntil(sessionCancel))
        );
        this.assertUsableQuote(quote, symbol);
        if (sessionToken !== this.activeSessionToken || sessionToken !== this.finance.sessionToken) throw new Error('Vault session changed');
        const applied = await this.finance.applyMarketQuoteForSymbol(symbol, quote, sessionToken);
        if (sessionToken !== this.activeSessionToken || sessionToken !== this.finance.sessionToken) throw new Error('Vault session changed');
        return { symbol, ...applied };
      } catch (error) {
        if (sessionToken !== this.activeSessionToken || sessionToken !== this.finance.sessionToken) {
          return { symbol, holdingsUpdated: 0, employerValuationsUpdated: 0, failedRecords: [], error: 'Refresh stopped because the vault session changed.' };
        }
        return { symbol, holdingsUpdated: 0, employerValuationsUpdated: 0, failedRecords: [], error: this.errorMessage(error) };
      } finally {
        if (this.inFlightSymbols.get(symbol) === request) this.inFlightSymbols.delete(symbol);
      }
    });
    this.inFlightSymbols.set(symbol, request);
    return request;
  }

  private assertUsableQuote(quote: MarketPriceQuote, symbol: string): void {
    if (!quote?.valid || quote.symbol?.trim().toUpperCase() !== symbol) throw new Error('Market service returned a different or unavailable ticker.');
    if (!Number.isFinite(quote.price) || quote.price <= 0) throw new Error('Market service returned an invalid price.');
    const date = quote.quote_date || '';
    if (!isValidDate(date) || date > new Date().toISOString().slice(0, 10)) throw new Error('Market service returned an invalid or future trading date.');
  }

  private publishProgress(operation: number, result: MarketSymbolRefreshResult, total: number): void {
    if (operation !== this.operationId || this.stateSubject.value.phase !== 'refreshing') return;
    const current = this.stateSubject.value;
    const failures = current.failures.filter(item => item.symbol !== result.symbol);
    if (result.error) failures.push({ symbol: result.symbol, message: result.error });
    else if (result.failedRecords.length) failures.push({ symbol: result.symbol, message: 'Some saved records could not be updated; their prior values remain.' });
    this.stateSubject.next({
      ...current,
      totalSymbols: total,
      completedSymbols: current.completedSymbols + 1,
      updatedHoldings: current.updatedHoldings + result.holdingsUpdated,
      updatedEmployerValuations: current.updatedEmployerValuations + result.employerValuationsUpdated,
      failures,
      phase: 'refreshing',
    });
  }

  private recordManualSymbolResult(result: MarketSymbolRefreshResult): void {
    const current = this.stateSubject.value;
    const failures = result.error
      ? [...current.failures.filter(item => item.symbol !== result.symbol), { symbol: result.symbol, message: result.error }]
      : result.failedRecords.length
        ? [...current.failures.filter(item => item.symbol !== result.symbol), { symbol: result.symbol, message: 'Some saved records could not be updated; their prior values remain.' }]
        : current.failures.filter(item => item.symbol !== result.symbol);
    const refreshing = current.phase === 'refreshing';
    const totalSymbols = refreshing
      ? current.totalSymbols
      : Math.max(current.totalSymbols, current.completedSymbols + 1, 1);
    this.stateSubject.next({
      ...current,
      phase: refreshing ? 'refreshing' : failures.length ? 'partial' : 'complete',
      totalSymbols,
      completedSymbols: refreshing
        ? current.completedSymbols
        : Math.min(totalSymbols, Math.max(current.completedSymbols + 1, 1)),
      updatedHoldings: current.updatedHoldings + result.holdingsUpdated,
      updatedEmployerValuations: current.updatedEmployerValuations + result.employerValuationsUpdated,
      failures,
      finishedAt: refreshing ? current.finishedAt : new Date().toISOString(),
    });
  }

  private assertActiveSession(): void {
    if (!this.activeSessionKey || this.activeSessionToken == null || !this.vault.isUnlocked) {
      throw new Error('Unlock the vault before refreshing prices.');
    }
  }

  private assertCurrentOperation(sessionKey: string, token: number, operation: number): void {
    if (this.activeSessionKey !== sessionKey || this.activeSessionToken !== token || this.finance.sessionToken !== token || operation !== this.operationId) {
      throw new Error('Market refresh stopped because the vault session changed.');
    }
  }

  private errorMessage(error: unknown): string {
    if ((error as any)?.name === 'TimeoutError') return 'Market service timed out. Saved prices remain available.';
    if (error instanceof Error && error.message && error.message !== 'Vault session changed') return `${error.message} Saved prices remain available.`;
    return 'Market quote could not be refreshed. Saved prices remain available.';
  }

  private queueInvalidation(collections: EncryptedCollection[]): void {
    if (this.activeUserId == null || !this.channel) return;
    for (const collection of collections) this.pendingInvalidations.add(collection);
    if (this.invalidationTimer) return;
    this.invalidationTimer = setTimeout(() => {
      this.invalidationTimer = null;
      const pending = [...this.pendingInvalidations];
      this.pendingInvalidations.clear();
      if (pending.length && this.activeUserId != null) {
        this.channel?.postMessage({ version: 1, userId: this.activeUserId, kind: 'invalidate', collections: pending } satisfies TabMessage);
      }
    }, 40);
  }

  private clearPendingInvalidations(): void {
    if (this.invalidationTimer) clearTimeout(this.invalidationTimer);
    this.invalidationTimer = null;
    this.pendingInvalidations.clear();
  }

  private cancelSessionWork(): void {
    this.sessionCancel$.next();
    this.sessionCancel$.complete();
    this.sessionCancel$ = new Subject<void>();
  }

  private broadcastSessionMessage(kind: 'lock' | 'signout'): void {
    if (this.activeUserId == null || !this.channel) return;
    this.channel.postMessage({ version: 1, userId: this.activeUserId, kind } satisfies TabMessage);
  }

  private async receiveTabMessage(message: unknown): Promise<void> {
    if (!isTabMessage(message) || message.userId !== this.auth.currentUser?.id) return;
    if (message.kind === 'invalidate') {
      if (!this.vault.isUnlocked || !message.collections?.length) return;
      try {
        await this.finance.refreshCollectionsFromAnotherTab(message.collections);
      } catch {
        if (this.vault.isUnlocked) {
          this.toast.error(failureCopy('refresh', 'this vault'), {
            label: 'Reload',
            run: () => window.location.reload(),
          });
        }
      }
      return;
    }
    this.endSession();
    this.finance.clearSessionState();
    if (message.kind === 'signout') {
      this.auth.clearLocalSession();
      authNavigation.goToLogin(false);
    } else {
      await this.router.navigateByUrl('/vault/unlock');
    }
  }
}

function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function isTabMessage(value: unknown): value is TabMessage {
  const item = value as Partial<TabMessage> | null;
  return !!item && item.version === 1 && Number.isInteger(item.userId)
    && ['invalidate', 'lock', 'signout'].includes(String(item.kind))
    && (item.collections === undefined || (Array.isArray(item.collections) && item.collections.every(collection => [
      'transactions', 'assets', 'liabilities', 'holdings', 'job_incomes', 'fixed_expenses', 'subscriptions',
      'bank_accounts', 'brokerage_accounts', 'import_batches', 'planning_profiles', 'stock_lab_scenarios',
    ].includes(collection))));
}
