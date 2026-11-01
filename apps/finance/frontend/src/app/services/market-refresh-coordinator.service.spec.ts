import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { BehaviorSubject, Observable, Subject, of, throwError } from 'rxjs';
import { SESSION_CONTEXT } from '@vivek/ui';
import { financeTabId, holdDek, wipeDek } from '../crypto/dek-holder';
import { VaultService } from '../crypto/vault.service';
import { FinanceService } from './finance.service';
import { MarketRefreshCoordinatorService } from './market-refresh-coordinator.service';

describe('MarketRefreshCoordinatorService', () => {
  let coordinator: MarketRefreshCoordinatorService;
  let users: BehaviorSubject<any>;
  let finance: jasmine.SpyObj<FinanceService> & { sessionToken: number; dataChanges$: Subject<any> };
  let vault: { isUnlocked: boolean };
  let router: jasmine.SpyObj<Router>;
  let auth: any;

  const quote = (symbol: string, values: Record<string, unknown> = {}) => ({
    symbol, price: 125, price_source: 'live_eod', quote_date: new Date().toISOString().slice(0, 10), valid: true, ...values,
  });

  beforeEach(() => {
    users = new BehaviorSubject<any>({ id: 7, username: 'sam' });
    finance = jasmine.createSpyObj<FinanceService>('FinanceService', [
      'getConfiguredMarketSymbols', 'lookupSharePrice', 'applyMarketQuoteForSymbol', 'refreshCollectionsFromAnotherTab', 'clearSessionState',
    ]) as any;
    finance.sessionToken = 11;
    finance.dataChanges$ = new Subject<any>();
    finance.getConfiguredMarketSymbols.and.resolveTo(['AAPL', 'AAPL', 'FORMERCO']);
    finance.lookupSharePrice.and.callFake((symbol: string) => of(quote(symbol)) as any);
    finance.applyMarketQuoteForSymbol.and.callFake(async (symbol: string) => ({
      holdingsUpdated: symbol === 'AAPL' ? 2 : 0,
      employerValuationsUpdated: symbol === 'FORMERCO' ? 1 : 0,
      failedRecords: [],
    } as any));
    finance.refreshCollectionsFromAnotherTab.and.resolveTo();
    auth = { user$: users.asObservable(), currentUser: users.value, clearLocalSession: jasmine.createSpy('clearLocalSession') };
    vault = { isUnlocked: true };
    router = jasmine.createSpyObj<Router>('Router', ['navigateByUrl']);
    TestBed.configureTestingModule({
      providers: [
        MarketRefreshCoordinatorService,
        { provide: SESSION_CONTEXT, useValue: auth },
        { provide: FinanceService, useValue: finance },
        { provide: VaultService, useValue: vault },
        { provide: Router, useValue: router },
      ],
    });
    coordinator = TestBed.inject(MarketRefreshCoordinatorService);
  });

  afterEach(() => TestBed.resetTestingModule());

  async function waitForFinished(): Promise<any> {
    return new Promise(resolve => {
      const subscription = coordinator.status$.subscribe(state => {
        if (state.phase === 'complete' || state.phase === 'partial' || state.phase === 'failed') {
          subscription.unsubscribe();
          resolve(state);
        }
      });
    });
  }

  it('starts once per authenticated unlocked session and deduplicates holding and former-employer tickers', async () => {
    const finished = waitForFinished();
    coordinator.startForSession(7, 11);
    const state = await finished;

    expect(state.phase).toBe('complete');
    expect(finance.lookupSharePrice.calls.count()).toBe(2);
    expect(finance.lookupSharePrice).toHaveBeenCalledWith('AAPL', true);
    expect(finance.lookupSharePrice).toHaveBeenCalledWith('FORMERCO', true);
    expect(finance.applyMarketQuoteForSymbol).toHaveBeenCalledWith('FORMERCO', jasmine.any(Object), 11);
    coordinator.startForSession(7, 11);
    expect(finance.lookupSharePrice.calls.count()).toBe(2);
  });

  it('continues after one symbol fails and reports a partial outcome', async () => {
    finance.getConfiguredMarketSymbols.and.resolveTo(['AAPL', 'MSFT']);
    finance.lookupSharePrice.and.callFake((symbol: string) => symbol === 'MSFT'
      ? throwError(() => new Error('provider unavailable'))
      : of(quote(symbol)) as any);
    const finished = waitForFinished();
    coordinator.startForSession(7, 11);
    const state = await finished;

    expect(state.phase).toBe('partial');
    expect(state.completedSymbols).toBe(2);
    expect(state.updatedHoldings).toBe(2);
    expect(state.failures).toEqual([jasmine.objectContaining({ symbol: 'MSFT' })]);
    expect(finance.applyMarketQuoteForSymbol).toHaveBeenCalledTimes(1);
  });

  it('clears a prior failure and returns to complete when an explicit retry succeeds', async () => {
    finance.getConfiguredMarketSymbols.and.resolveTo(['AAPL']);
    finance.lookupSharePrice.and.returnValue(throwError(() => new Error('provider unavailable')) as any);
    const finished = waitForFinished();
    coordinator.startForSession(7, 11);
    await finished;

    finance.lookupSharePrice.and.returnValue(of(quote('AAPL')) as any);
    const result = await coordinator.refreshSymbol('AAPL');

    expect(result.error).toBeUndefined();
    expect(coordinator.currentState.phase).toBe('complete');
    expect(coordinator.currentState.failures).toEqual([]);
  });

  it('does not count a manual request twice when it shares the active aggregate quote', async () => {
    finance.getConfiguredMarketSymbols.and.resolveTo(['AAPL']);
    const pending = new Subject<any>();
    let markStarted!: () => void;
    const started = new Promise<void>(resolve => { markStarted = resolve; });
    finance.lookupSharePrice.and.callFake(() => {
      markStarted();
      return pending as Observable<any>;
    });
    const finished = waitForFinished();
    coordinator.startForSession(7, 11);
    await started;
    const manual = coordinator.refreshSymbol('AAPL');
    pending.next(quote('AAPL'));
    pending.complete();
    await manual;
    const state = await finished;

    expect(state.phase).toBe('complete');
    expect(state.completedSymbols).toBe(1);
    expect(state.updatedHoldings).toBe(2);
  });

  it('keeps a one-off ticker out of the session refresh progress while it is active', async () => {
    finance.getConfiguredMarketSymbols.and.resolveTo(['AAPL']);
    const aggregateQuote = new Subject<any>();
    let markStarted!: () => void;
    const started = new Promise<void>(resolve => { markStarted = resolve; });
    finance.lookupSharePrice.and.callFake((symbol: string) => {
      if (symbol === 'AAPL') {
        markStarted();
        return aggregateQuote as any;
      }
      return of(quote(symbol)) as any;
    });
    const finished = waitForFinished();
    coordinator.startForSession(7, 11);
    await started;

    await coordinator.refreshSymbol('META');
    expect(coordinator.currentState.phase).toBe('refreshing');
    expect(coordinator.currentState.totalSymbols).toBe(1);
    expect(coordinator.currentState.completedSymbols).toBe(0);

    aggregateQuote.next(quote('AAPL'));
    aggregateQuote.complete();
    const state = await finished;
    expect(state.phase).toBe('complete');
    expect(state.completedSymbols).toBe(1);
    expect(state.updatedHoldings).toBe(2);
  });

  it('keeps a successful holding update when one employer record save fails', async () => {
    finance.getConfiguredMarketSymbols.and.resolveTo(['AAPL']);
    finance.applyMarketQuoteForSymbol.and.resolveTo({
      holdingsUpdated: 1, employerValuationsUpdated: 0, failedRecords: ['employer valuation 9'],
    } as any);
    const finished = waitForFinished();
    coordinator.startForSession(7, 11);
    const state = await finished;

    expect(state.phase).toBe('partial');
    expect(state.updatedHoldings).toBe(1);
    expect(state.failures[0].symbol).toBe('AAPL');
  });

  it('rejects a future trading date and preserves the prior saved quote', async () => {
    finance.getConfiguredMarketSymbols.and.resolveTo(['AAPL']);
    finance.lookupSharePrice.and.returnValue(of(quote('AAPL', { quote_date: '2999-01-01' })) as any);
    const finished = waitForFinished();
    coordinator.startForSession(7, 11);
    const state = await finished;

    expect(state.phase).toBe('failed');
    expect(state.failures[0].message).toContain('future trading date');
    expect(finance.applyMarketQuoteForSymbol).not.toHaveBeenCalled();
  });

  it('does not apply a quote after the vault session changes while the request is pending', async () => {
    finance.getConfiguredMarketSymbols.and.resolveTo(['AAPL']);
    const pending = new Subject<any>();
    const cancelled = jasmine.createSpy('cancelled');
    let markStarted!: () => void;
    const started = new Promise<void>(resolve => { markStarted = resolve; });
    finance.lookupSharePrice.and.callFake(() => {
      markStarted();
      return new Observable<any>(subscriber => {
        const subscription = pending.subscribe(subscriber);
        return () => {
          cancelled();
          subscription.unsubscribe();
        };
      });
    });
    coordinator.startForSession(7, 11);
    await started;
    coordinator.endSession();
    finance.sessionToken = 12;
    expect(cancelled).toHaveBeenCalled();
    pending.next(quote('AAPL'));
    pending.complete();
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(finance.applyMarketQuoteForSymbol).not.toHaveBeenCalled();
  });

  it('reloads only scoped encrypted snapshots from a matching tab invalidation', async () => {
    await (coordinator as any).receiveTabMessage({ version: 1, userId: 7, kind: 'invalidate', collections: ['holdings'] });
    await (coordinator as any).receiveTabMessage({ version: 1, userId: 8, kind: 'invalidate', collections: ['assets'] });

    expect(finance.refreshCollectionsFromAnotherTab).toHaveBeenCalledOnceWith(['holdings']);
  });
  it('ignores a lock from this tab and opens unlock for another tab', async () => {
    holdDek({} as CryptoKey);
    const receive = (tabId: string) => (coordinator as unknown as { receiveTabMessage(m: object): Promise<void> }).receiveTabMessage({ version: 1, userId: 7, kind: 'lock', tabId });
    await receive(financeTabId());
    await receive('other-tab');
    expect(router.navigateByUrl).toHaveBeenCalledOnceWith('/finance/vault/unlock');
    router.navigateByUrl.calls.reset();
    wipeDek();
    await receive('other-tab');
    expect(router.navigateByUrl).not.toHaveBeenCalled();
  });
});
