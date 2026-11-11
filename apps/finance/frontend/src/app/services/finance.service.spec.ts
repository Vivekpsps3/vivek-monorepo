import { Injector } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { BehaviorSubject, firstValueFrom, Observable, of, Subject } from 'rxjs';
import { ToastService } from '@vivek/ui';
import { holdDek, wipeDek } from '../crypto/dek-holder';
import { VAULT_PRESENCE } from '../crypto/dek-store';
import { lockFinance, lockLoad } from '../crypto/lock-finance';
import { loadFinanceHubSnapshot } from '../hub/finance-hub-facade';
import { FinanceService } from './finance.service';
import { searchFinanceNames } from './finance-search';
import { VaultService } from '../crypto/vault.service';
import { EncryptedStoreService } from '../crypto/encrypted-store.service';
import {
  Asset, CashflowSummary, FixedExpense, Holding, JobIncome, Liability, Subscription, Transaction, TransactionCreate,
} from '../models/transaction.model';

describe('FinanceService', () => {
  let service: FinanceService;
  let http: HttpTestingController;
  let encStore: jasmine.SpyObj<EncryptedStoreService>;
  let storeChanges: Subject<any>;

  beforeEach(() => {
    encStore = jasmine.createSpyObj<EncryptedStoreService>('EncryptedStoreService', [
      'getTransactions',
      'addTransaction',
      'getHoldings',
      'getNetWorth',
      'getAssets',
      'getLiabilities',
      'getJobIncomes',
      'getFixedExpenses',
      'getSubscriptions',
      'getCashflowSummary',
      'reloadCollections',
      'updateHoldingPrice',
      'bulkRenameTransactionCategories',
      'getBrokerageAccounts',
      'upsertBrokerageAccount',
      'createHoldingImportStage',
      'getHoldingImportStages',
      'getHoldingImportStageRows',
      'verifyHoldingImportStage',
      'activateHoldingImportStage',
      'updateHolding',
    ]);
    storeChanges = new Subject<any>();
    (encStore as any).changes$ = storeChanges.asObservable();
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        FinanceService,
        { provide: VaultService, useValue: {} },
        { provide: EncryptedStoreService, useValue: encStore },
      ],
    });
    service = TestBed.inject(FinanceService);
    http = TestBed.inject(HttpTestingController);
    holdDek({} as CryptoKey);
  });

  afterEach(() => http.verify());
  afterEach(() => wipeDek());

  it('refreshes the complete transaction stream after an import instead of truncating it', async () => {
    const transactions = Array.from({ length: 5001 }, (_, id) => ({
      id: id + 1, date: '2026-01-01', type: 'expense', category: 'Other', amount: 1,
    })) as any;
    encStore.getTransactions.and.resolveTo(transactions);

    (service as any).refreshAfterImport();
    await new Promise(resolve => setTimeout(resolve, 0));

    expect((service as any)._transactions.value.length).toBe(5001);
    expect((service as any)._dashboardTransactions.value.length).toBe(5001);
  });

  it('retries an in-flight Home snapshot after a holding quote invalidates the dashboard cache', async () => {
    encStore.getTransactions.and.resolveTo([] as any);
    encStore.getAssets.and.resolveTo([] as any);
    encStore.getLiabilities.and.resolveTo([] as any);
    encStore.getJobIncomes.and.resolveTo([] as any);
    encStore.getFixedExpenses.and.resolveTo([] as any);
    encStore.getSubscriptions.and.resolveTo([] as any);
    encStore.getNetWorth.and.resolveTo({ total: 0 } as any);
    encStore.getCashflowSummary.and.resolveTo({} as any);
    const beforeQuote = [{ id: 1, symbol: 'VOO', shares: 2, purchase_price: 100, purchase_date: null, current_price: 100 }];
    const afterQuote = [{ ...beforeQuote[0], current_price: 125 }];
    let releaseInitial!: (rows: any[]) => void;
    const initialHoldings = new Promise<any[]>(resolve => { releaseInitial = resolve; });
    let calls = 0;
    encStore.getHoldings.and.callFake(() => calls++ === 0 ? initialHoldings as any : Promise.resolve(afterQuote) as any);

    const dashboard = firstValueFrom(service.loadDashboard());
    storeChanges.next({ collection: 'holdings', source: 'local' });
    releaseInitial(beforeQuote);
    const result = await dashboard;

    expect(calls).toBe(2);
    expect(result[1]).toEqual(afterQuote);
  });

  it('publishes overlapping remote invalidations for different collections independently', async () => {
    const asset = { id: 3, name: 'Remote cash', current_value: 100 };
    const liability = { id: 4, name: 'Remote loan', current_balance: 200 };
    let releaseAssets!: (rows: any[]) => void;
    const assetRead = new Promise<any[]>(resolve => { releaseAssets = resolve; });
    encStore.reloadCollections.and.resolveTo();
    encStore.getAssets.and.returnValue(assetRead as any);
    encStore.getLiabilities.and.resolveTo([liability] as any);
    encStore.getNetWorth.and.resolveTo({ total: -100 } as any);
    const events: any[] = [];
    const subscription = service.dataChanges$.subscribe(change => events.push(change));

    const assetsRefresh = service.refreshCollectionsFromAnotherTab(['assets']);
    await new Promise(resolve => setTimeout(resolve, 0));
    const liabilitiesRefresh = service.refreshCollectionsFromAnotherTab(['liabilities']);
    await liabilitiesRefresh;
    releaseAssets([asset]);
    await assetsRefresh;
    subscription.unsubscribe();

    expect((service as any)._assets.value).toEqual([asset]);
    expect((service as any)._liabilities.value).toEqual([liability]);
    expect(events).toContain(jasmine.objectContaining({ collections: ['assets'], source: 'remote' }));
    expect(events).toContain(jasmine.objectContaining({ collections: ['liabilities'], source: 'remote' }));
  });

  it('refreshCollectionsFromAnotherTab reloads silently', async () => {
    encStore.reloadCollections.and.resolveTo();
    encStore.getTransactions.and.resolveTo([]);
    encStore.getCashflowSummary.and.resolveTo({} as never);

    await service.refreshCollectionsFromAnotherTab(['transactions']);

    expect(encStore.reloadCollections).toHaveBeenCalledOnceWith(['transactions'], { silent: true });
  });

  it('does not deliver decrypted assets after a lock', async () => {
    const secret = { id: 9, name: 'secret-asset', current_value: 1 } as Asset;
    let release: (rows: Asset[]) => void = () => undefined;
    encStore.getAssets.and.returnValue(new Promise<Asset[]>(resolve => { release = resolve; }));
    let token = 4;
    Object.defineProperty(encStore, 'sessionToken', { configurable: true, get: () => token });
    (encStore as unknown as { clear(): void }).clear = () => { token += 1; };
    (TestBed.inject(VaultService) as unknown as { lock(): void }).lock = () => { wipeDek(); };
    const seen: Asset[][] = [];
    let completed = false;
    service.getAssets().subscribe({ next: rows => seen.push(rows), complete: () => { completed = true; } });
    service.clearSessionState();
    release([secret]);
    await Promise.resolve();
    expect([seen, completed]).toEqual([[], true]);
    wipeDek(); const worth: unknown[] = []; encStore.getNetWorth.and.resolveTo({ total: 9 } as never);
    service.getNetWorth().subscribe(value => worth.push(value)); await Promise.resolve();
    expect([worth, (service as unknown as { _netWorth: { value: unknown } })._netWorth.value]).toEqual([[], null]);
  });

  it('does not replay cached plaintext or apply an in-flight refresh once lockFinance starts', async () => {
    const secret = { id: 9, name: 'secret-asset', current_value: 1 } as Asset;
    const subjects = service as unknown as Record<string, { next(value: unknown): void }>;
    for (const name of ['_transactions', '_dashboardTransactions', '_holdings', '_assets', '_liabilities', '_jobIncomes', '_fixedExpenses', '_subscriptions']) subjects[name].next([secret]);
    subjects['_netWorth'].next({ total: 40 });
    subjects['_cashflowSummary'].next({ total: 40 });
    let token = 1;
    Object.defineProperty(encStore, 'sessionToken', { configurable: true, get: () => token });
    (encStore as unknown as { clear(): void }).clear = () => { token += 1; };
    (TestBed.inject(VaultService) as unknown as { lock(): void }).lock = () => undefined;
    let release: (rows: Asset[]) => void = () => undefined;
    encStore.reloadCollections.and.resolveTo();
    encStore.getAssets.and.returnValue(new Promise<Asset[]>(resolve => { release = resolve; }));
    encStore.getNetWorth.and.resolveTo({ total: 1 } as never);
    const refresh = service.refreshCollectionsFromAnotherTab(['assets']);
    await new Promise(resolve => setTimeout(resolve, 0));
    const epoch = (service as unknown as { snapshotEpoch: number }).snapshotEpoch;
    const real = lockLoad.modules;
    lockLoad.modules = (() => new Promise(() => undefined)) as typeof lockLoad.modules;
    const replay: unknown[] = [];
    try {
      void lockFinance(TestBed.inject(Injector));
      for (const stream of [service.transactions$, service.dashboardTransactions$, service.holdings$, service.assets$, service.liabilities$, service.jobIncomes$, service.fixedExpenses$, service.subscriptions$, service.netWorth$, service.cashflowSummary$] as Array<{ subscribe(next: (value: unknown) => void): unknown }>) stream.subscribe(value => replay.push(value));
      expect(replay).toEqual([[], [], [], [], [], [], [], [], null, null]);
      expect([(service as unknown as { snapshotEpoch: number }).snapshotEpoch, token]).toEqual([epoch + 1, 2]);
      release([secret]);
      await refresh.catch(() => undefined);
      const after: Asset[][] = [];
      service.assets$.subscribe(rows => after.push(rows));
      expect(after).toEqual([[]]);
    } finally { lockLoad.modules = real; }
  });

  it('does not deliver asset rows deferred across lockFinance', async () => {
    const secret = { id: 9, name: 'secret-asset', current_value: 1 } as Asset;
    let release: (rows: Asset[]) => void = () => undefined;
    const hang = () => encStore.getAssets.and.returnValue(new Promise<Asset[]>(resolve => { release = resolve; }));
    const seen: Asset[][] = [];
    let cleared = 0;
    (encStore as unknown as { clear(): void }).clear = () => { cleared += 1; };
    (TestBed.inject(VaultService) as unknown as { lock(): void }).lock = () => undefined;
    spyOn(TestBed.inject(ToastService), 'error');
    const real = lockLoad.modules;
    try {
      hang(); service.getAssets().subscribe(rows => seen.push(rows));
      lockLoad.modules = (() => new Promise(() => undefined)) as typeof lockLoad.modules;
      void lockFinance(TestBed.inject(Injector)); release([secret]); await Promise.resolve();
      hang(); service.getAssets().subscribe(rows => seen.push(rows));
      lockLoad.modules = (() => Promise.reject(new Error('chunk'))) as typeof lockLoad.modules;
      await lockFinance(TestBed.inject(Injector)); release([secret]); await Promise.resolve();
      expect([seen, cleared]).toEqual([[], 5]);
    } finally { lockLoad.modules = real; }
  });

  it('lock-gates every subject-emitting getter while a read is in flight (B0F2 N2)', async () => {
    interface Subjects {
      _transactions: BehaviorSubject<Transaction[]>;
      _dashboardTransactions: BehaviorSubject<Transaction[]>;
      _holdings: BehaviorSubject<Holding[]>;
      _liabilities: BehaviorSubject<Liability[]>;
      _jobIncomes: BehaviorSubject<JobIncome[]>;
      _fixedExpenses: BehaviorSubject<FixedExpense[]>;
      _subscriptions: BehaviorSubject<Subscription[]>;
      _cashflowSummary: BehaviorSubject<CashflowSummary | null>;
    }
    const subjects = service as unknown as Subjects;
    const rows = <T>(...ids: number[]): T[] => ids.map(id => ({ id } as unknown as T));
    async function expectLocked<R, S>(config: {
      configure: (promise: Promise<R>) => void;
      call: () => Observable<R>;
      subject: BehaviorSubject<S>;
      sentinel: S;
      stale: R;
    }): Promise<void> {
      holdDek({} as CryptoKey);
      config.subject.next(config.sentinel);
      let release!: (value: R) => void;
      config.configure(new Promise<R>(resolve => { release = resolve; }));
      const seen: R[] = [];
      let completed = false;
      config.call().subscribe({ next: value => seen.push(value), complete: () => { completed = true; } });
      wipeDek();
      release(config.stale);
      await new Promise(resolve => setTimeout(resolve, 0));
      expect(seen).toEqual([]);
      expect(completed).toBeTrue();
      expect(config.subject.value).toEqual(config.sentinel);
    }
    await expectLocked({
      configure: promise => encStore.getTransactions.and.returnValue(promise),
      call: () => service.getTransactions(),
      subject: subjects._transactions,
      sentinel: rows<Transaction>(9001),
      stale: rows<Transaction>(1),
    });
    await expectLocked({
      configure: promise => encStore.getTransactions.and.returnValue(promise),
      call: () => service.getDashboardTransactions(),
      subject: subjects._dashboardTransactions,
      sentinel: rows<Transaction>(9002),
      stale: rows<Transaction>(2),
    });
    await expectLocked({
      configure: promise => encStore.getCashflowSummary.and.returnValue(promise),
      call: () => service.getCashflowSummary('2026-10-01', '2026-10-31'),
      subject: subjects._cashflowSummary,
      sentinel: { stale: 'sentinel' } as unknown as CashflowSummary,
      stale: { stale: 'read' } as unknown as CashflowSummary,
    });
    await expectLocked({
      configure: promise => encStore.getJobIncomes.and.returnValue(promise),
      call: () => service.getJobIncomes(),
      subject: subjects._jobIncomes,
      sentinel: rows<JobIncome>(9003),
      stale: rows<JobIncome>(3),
    });
    await expectLocked({
      configure: promise => encStore.getFixedExpenses.and.returnValue(promise),
      call: () => service.getFixedExpenses(),
      subject: subjects._fixedExpenses,
      sentinel: rows<FixedExpense>(9004),
      stale: rows<FixedExpense>(4),
    });
    await expectLocked({
      configure: promise => encStore.getSubscriptions.and.returnValue(promise),
      call: () => service.getSubscriptions(),
      subject: subjects._subscriptions,
      sentinel: rows<Subscription>(9005),
      stale: rows<Subscription>(5),
    });
    await expectLocked({
      configure: promise => encStore.getLiabilities.and.returnValue(promise),
      call: () => service.getLiabilities(),
      subject: subjects._liabilities,
      sentinel: rows<Liability>(9006),
      stale: rows<Liability>(6),
    });
    await expectLocked({
      configure: promise => encStore.getHoldings.and.returnValue(promise),
      call: () => service.getHoldings(),
      subject: subjects._holdings,
      sentinel: rows<Holding>(9007),
      stale: rows<Holding>(7),
    });
  });

  it('does not publish a mutation write-back that resolves after a lock (B0F2 N2)', async () => {
    const subjects = service as unknown as { _transactions: BehaviorSubject<Transaction[]> };
    const sentinel = [{ id: 9001 } as unknown as Transaction];
    subjects._transactions.next(sentinel);
    encStore.addTransaction.and.resolveTo({ id: 1 } as unknown as Transaction);
    let release: (value: Transaction[]) => void = () => undefined;
    encStore.getTransactions.and.returnValue(new Promise<Transaction[]>(resolve => { release = resolve; }));
    const written = firstValueFrom(service.addTransaction({} as unknown as TransactionCreate));
    await new Promise(resolve => setTimeout(resolve, 0));
    wipeDek();
    release([{ id: 2 } as unknown as Transaction]);
    await written;
    expect(subjects._transactions.value).toEqual(sentinel);
  });

  it('does not deliver assets when the vault locks and unlocks again during a read (B0F2 GA4)', async () => {
    const secret = { id: 9, name: 'secret-asset', current_value: 1 } as Asset;
    let release: (rows: Asset[]) => void = () => undefined;
    encStore.getAssets.and.returnValue(new Promise<Asset[]>(resolve => { release = resolve; }));
    const seen: Asset[][] = [];
    let completed = false;
    service.getAssets().subscribe({ next: value => seen.push(value), complete: () => { completed = true; } });
    wipeDek();
    holdDek({} as CryptoKey);
    release([secret]);
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(seen).toEqual([]);
    expect(completed).toBeTrue();
    expect((service as unknown as { _assets: BehaviorSubject<Asset[]> })._assets.value).toEqual([]);
  });

  it('does not let a stale subscription read overwrite a fresher one (B0F2 GA5)', async () => {
    const subjects = service as unknown as { _subscriptions: BehaviorSubject<Subscription[]> };
    const stale = [{ id: 40 } as unknown as Subscription];
    const fresh = [{ id: 40 } as unknown as Subscription, { id: 60 } as unknown as Subscription];
    let release: (value: Subscription[]) => void = () => undefined;
    encStore.getSubscriptions.and.returnValue(new Promise<Subscription[]>(resolve => { release = resolve; }));
    const staleRead = firstValueFrom(service.getSubscriptions());
    encStore.getSubscriptions.and.resolveTo(fresh);
    storeChanges.next({ collection: 'subscriptions', source: 'local' });
    await firstValueFrom(service.getSubscriptions());
    expect(subjects._subscriptions.value).toEqual(fresh);
    release(stale);
    await staleRead;
    expect(subjects._subscriptions.value).toEqual(fresh);
  });

  it('joins one in-flight collection read and still loads an unrelated collection', async () => {
    let subscriptionReads = 0;
    let releaseSubscriptions!: (rows: Subscription[]) => void;
    const current = [{ id: 4, name: 'Stream' } as Subscription];
    encStore.getSubscriptions.and.callFake(() => {
      subscriptionReads += 1;
      return new Promise<Subscription[]>(resolve => { releaseSubscriptions = resolve; });
    });
    encStore.getJobIncomes.and.resolveTo([{ id: 7 } as JobIncome]);
    const first = firstValueFrom(service.getSubscriptions());
    const second = firstValueFrom(service.getSubscriptions());
    const jobs = firstValueFrom(service.getJobIncomes());
    expect(subscriptionReads).toBe(1);
    expect(await jobs).toEqual([{ id: 7 } as JobIncome]);
    expect((service as unknown as { _jobIncomes: BehaviorSubject<JobIncome[]> })._jobIncomes.value).toEqual([{ id: 7 } as JobIncome]);
    releaseSubscriptions(current);
    expect(await first).toEqual(current);
    expect(await second).toEqual(current);
    expect((service as unknown as { _subscriptions: BehaviorSubject<Subscription[]> })._subscriptions.value).toEqual(current);
    encStore.getSubscriptions.and.resolveTo([{ id: 5, name: 'Later' } as Subscription]);
    await firstValueFrom(service.getSubscriptions());
    expect(encStore.getSubscriptions).toHaveBeenCalledTimes(2);
    expect((service as unknown as { _subscriptions: BehaviorSubject<Subscription[]> })._subscriptions.value).toEqual([{ id: 5, name: 'Later' } as Subscription]);
  });

  it('does not publish a cashflow read after its session, revision, or lock moves', async () => {
    const subjects = service as unknown as {
      _jobIncomes: BehaviorSubject<JobIncome[]>;
      _fixedExpenses: BehaviorSubject<FixedExpense[]>;
      _subscriptions: BehaviorSubject<Subscription[]>;
    };
    const jobSentinel = [{ id: 1 } as JobIncome];
    subjects._jobIncomes.next(jobSentinel);
    let token = 4;
    Object.defineProperty(encStore, 'sessionToken', { configurable: true, get: () => token });
    let releaseJobs!: (rows: JobIncome[]) => void;
    encStore.getJobIncomes.and.returnValue(new Promise<JobIncome[]>(resolve => { releaseJobs = resolve; }));
    const seenJobs: JobIncome[][] = [];
    service.getJobIncomes().subscribe(rows => seenJobs.push(rows));
    token = 5;
    releaseJobs([{ id: 9 } as JobIncome]);
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(seenJobs).toEqual([[{ id: 9 } as JobIncome]]);
    expect(subjects._jobIncomes.value).toEqual(jobSentinel);

    const expenseSentinel = [{ id: 2 } as FixedExpense];
    subjects._fixedExpenses.next(expenseSentinel);
    let releaseExpenses!: (rows: FixedExpense[]) => void;
    encStore.getFixedExpenses.and.returnValue(new Promise<FixedExpense[]>(resolve => { releaseExpenses = resolve; }));
    const seenExpenses: FixedExpense[][] = [];
    let expensesCompleted = false;
    service.getFixedExpenses().subscribe({ next: rows => seenExpenses.push(rows), complete: () => { expensesCompleted = true; } });
    wipeDek();
    releaseExpenses([{ id: 8 } as FixedExpense]);
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(seenExpenses).toEqual([]);
    expect(expensesCompleted).toBeTrue();
    expect(subjects._fixedExpenses.value).toEqual(expenseSentinel);

    holdDek({} as CryptoKey);
    const subscriptionSentinel = [{ id: 3 } as Subscription];
    subjects._subscriptions.next(subscriptionSentinel);
    let releaseSubscriptions!: (rows: Subscription[]) => void;
    encStore.reloadCollections.and.resolveTo();
    encStore.getSubscriptions.and.returnValue(new Promise<Subscription[]>(resolve => { releaseSubscriptions = resolve; }));
    encStore.getCashflowSummary.and.resolveTo({} as never);
    const refresh = service.refreshCollectionsFromAnotherTab(['subscriptions']);
    await new Promise(resolve => setTimeout(resolve, 0));
    token += 1;
    releaseSubscriptions([{ id: 11, name: 'Stale' } as Subscription]);
    await refresh;
    expect(subjects._subscriptions.value).toEqual(subscriptionSentinel);
    expect(encStore.getCashflowSummary).not.toHaveBeenCalled();
  });

  it('publishes a later collection when an earlier cashflow refresh goes stale', async () => {
    let releaseJobs!: (rows: JobIncome[]) => void;
    encStore.reloadCollections.and.resolveTo();
    encStore.getJobIncomes.and.returnValue(new Promise<JobIncome[]>(resolve => { releaseJobs = resolve; }));
    encStore.getSubscriptions.and.resolveTo([{ id: 8, name: 'Stream' } as Subscription]);
    encStore.getCashflowSummary.and.resolveTo({} as never);
    const mixed = service.refreshCollectionsFromAnotherTab(['job_incomes', 'subscriptions']);
    await new Promise(resolve => setTimeout(resolve, 0));
    storeChanges.next({ collection: 'job_incomes', source: 'local' });
    releaseJobs([{ id: 1 } as JobIncome]);
    await mixed;
    expect((service as unknown as { _jobIncomes: BehaviorSubject<JobIncome[]> })._jobIncomes.value).toEqual([]);
    expect((service as unknown as { _subscriptions: BehaviorSubject<Subscription[]> })._subscriptions.value).toEqual([{ id: 8, name: 'Stream' } as Subscription]);
    expect(encStore.getJobIncomes).toHaveBeenCalledTimes(1);
    expect(encStore.getSubscriptions).toHaveBeenCalledTimes(1);
  });

  it('does not let a subscription write-back overwrite a newer revision', async () => {
    const subjects = service as unknown as { _subscriptions: BehaviorSubject<Subscription[]> };
    const fresh = [{ id: 4 } as Subscription, { id: 6 } as Subscription];
    let release!: (rows: Subscription[]) => void;
    encStore.getSubscriptions.and.returnValue(new Promise<Subscription[]>(resolve => { release = resolve; }));
    (encStore as unknown as { addSubscription: jasmine.Spy }).addSubscription = jasmine.createSpy().and.resolveTo({ id: 4 });
    const written = firstValueFrom(service.addSubscription({} as never));
    await new Promise(resolve => setTimeout(resolve, 0));
    storeChanges.next({ collection: 'subscriptions', source: 'local' });
    encStore.getSubscriptions.and.resolveTo(fresh);
    await firstValueFrom(service.getSubscriptions());
    expect(subjects._subscriptions.value).toEqual(fresh);
    release([{ id: 4 } as Subscription]);
    await written;
    expect(subjects._subscriptions.value).toEqual(fresh);
  });

  it('reads ready bill names from the public search facade without loadDashboard', async () => {
    const loadDashboard = spyOn(service, 'loadDashboard').and.callThrough();
    encStore.getFixedExpenses.and.resolveTo([{ id: 3, name: 'Rent', annual_amount: 1200 } as FixedExpense]);
    encStore.getSubscriptions.and.resolveTo([{ id: 4, name: 'Stream', annual_amount: 80 } as Subscription]);
    await firstValueFrom(service.getFixedExpenses());
    await firstValueFrom(service.getSubscriptions());
    const vault = TestBed.inject(VaultService) as { whenReady: () => Promise<void>; isUnlocked: boolean };
    vault.whenReady = () => Promise.resolve();
    vault.isUnlocked = true;
    localStorage.setItem(VAULT_PRESENCE, '1');
    try {
      const result = await searchFinanceNames(TestBed.inject(Injector), 'rent');
      expect(result).toEqual({
        status: 'ready',
        names: [{ app: 'finance', kind: 'bill', id: 3, title: 'Rent', href: '/finance/recurring?t=spend' }],
      });
      expect(JSON.stringify(result)).not.toContain('1200');
      expect(loadDashboard).not.toHaveBeenCalled();
      expect(encStore.getTransactions).not.toHaveBeenCalled();
      expect(encStore.getAssets).not.toHaveBeenCalled();
      expect(encStore.getHoldings).not.toHaveBeenCalled();
      expect(encStore.getJobIncomes).not.toHaveBeenCalled();
    } finally {
      localStorage.removeItem(VAULT_PRESENCE);
    }
  });

  it('continues refreshing valid collections when one member of a multi-collection snapshot goes stale', async () => {
    const freshHolding = { id: 2, symbol: 'VOO', shares: 3, current_price: 120 };
    const asset = { id: 3, name: 'Remote cash', current_value: 100 };
    let releaseFirstHoldings!: (rows: any[]) => void;
    const firstHoldingsRead = new Promise<any[]>(resolve => { releaseFirstHoldings = resolve; });
    let holdingReads = 0;
    encStore.reloadCollections.and.resolveTo();
    encStore.getHoldings.and.callFake(() => holdingReads++ === 0
      ? firstHoldingsRead as any
      : Promise.resolve([freshHolding]) as any);
    encStore.getAssets.and.resolveTo([asset] as any);
    encStore.getNetWorth.and.resolveTo({ total: 460 } as any);

    const mixedRefresh = service.refreshCollectionsFromAnotherTab(['holdings', 'assets']);
    await new Promise(resolve => setTimeout(resolve, 0));
    await service.refreshCollectionsFromAnotherTab(['holdings']);
    releaseFirstHoldings([{ id: 1, symbol: 'VOO', shares: 2, current_price: 100 }]);
    await mixedRefresh;

    expect((service as any)._holdings.value).toEqual([freshHolding]);
    expect((service as any)._assets.value).toEqual([asset]);
  });

  it('imports bank CSV through encrypted records', done => {
    encStore.getTransactions.and.resolveTo([]);
    encStore.addTransaction.and.resolveTo({ id: 1 } as any);
    const file = new File(
      [
        [
          'Transaction Date,Posted Date,Card No.,Description,Category,Debit,Credit',
          '2026-01-02,2026-01-03,1234,Coffee,Food,5.25,',
        ].join('\n'),
      ],
      'capital.csv',
      { type: 'text/csv' }
    );

    service.previewBankImport('capital_one', file).subscribe({
      next: preview => {
        expect(preview.summary.new).toBe(1);
        service.commitBankImport('capital_one', preview.filename, preview.rows).subscribe({
          next: result => {
            expect(result.inserted).toBe(1);
            expect(encStore.addTransaction).toHaveBeenCalledOnceWith(
              jasmine.objectContaining({
                type: 'expense',
                source: 'import',
                description: 'Coffee',
                dedupe_key: preview.rows[0].dedupe_key,
              })
            );
            http.expectNone(req => req.url.includes('/imports/'));
            done();
          },
          error: done.fail,
        });
      },
      error: done.fail,
    });
  });

  it('previews mixed-bank files and commits their combined selection without plaintext HTTP', done => {
    encStore.getTransactions.and.resolveTo([]);
    encStore.addTransaction.and.resolveTo({ id: 1 } as any);
    const files = [
      { id: 1, bank_slug: 'capital_one', file: new File(['Transaction Date,Card No.,Description,Category,Debit,Credit\n2026-01-02,1234,Coffee,Food,5.25,'], 'capital.csv') },
      { id: 2, bank_slug: 'amex', file: new File(['Date,Description,Account #,Amount,Category\n01/02/2026,Lunch,-1001,10.00,Food'], 'amex.csv') },
    ];
    service.previewBankImports(files).subscribe({
      next: previews => {
        expect(previews.map(entry => entry.preview!.bank)).toEqual(['Capital One', 'American Express']);
        const rows = previews.flatMap(entry => entry.preview!.rows);
        service.commitBankImports(rows).subscribe({
          next: result => {
            expect(result.inserted).toBe(2);
            expect(encStore.addTransaction.calls.allArgs().map(args => args[0].account_display)).toEqual(['Capital One ···1234', 'American Express ···1001']);
            http.expectNone(() => true);
            done();
          },
          error: done.fail,
        });
      },
      error: done.fail,
    });
  });

  it('refreshes unique ticker symbols with per-symbol failures and reports counts', done => {
    encStore.getHoldings.and.resolveTo([
      { id: 1, symbol: 'aapl', shares: 1, purchase_price: 10, current_price: 10 },
      { id: 2, symbol: 'AAPL', shares: 2, purchase_price: 10, current_price: 10 },
      { id: 3, symbol: '', shares: 1, purchase_price: 10, current_price: 10 },
      { id: 4, symbol: 'FAIL', shares: 1, purchase_price: 10, current_price: 10 },
    ] as any);
    encStore.updateHoldingPrice.and.resolveTo({} as any);
    encStore.getNetWorth.and.resolveTo({} as any);

    service.refreshAllHoldingPrices().subscribe({
      next: result => {
        expect(result.updated).toBe(2);
        expect(result.failed).toBe(1);
        expect(encStore.updateHoldingPrice.calls.count()).toBe(2);
        done();
      },
      error: done.fail,
    });
    setTimeout(() => {
      const aapl = http.expectOne(r => r.url.endsWith('/market/price/AAPL') && r.params.get('refresh') === 'true');
      const fail = http.expectOne(r => r.url.endsWith('/market/price/FAIL') && r.params.get('refresh') === 'true');
      expect(aapl.request.body).toBeNull();
      aapl.flush({ symbol: 'AAPL', price: 200, price_source: 'live', valid: true });
      fail.flush('unavailable', { status: 503, statusText: 'Unavailable' });
    });
  });

  it('renames categories locally', done => {
    encStore.bulkRenameTransactionCategories.and.resolveTo({ updated: 2, conflicts: 0 });
    service.renameCategory('Dining', 'Food').subscribe({
      next: result => {
        expect(result.updated).toBe(2);
        expect(encStore.bulkRenameTransactionCategories).toHaveBeenCalledWith([{ fromCategory: 'Dining', toCategory: 'Food' }]);
        http.expectNone(r => r.url.includes('/finance/transactions/categories'));
        done();
      },
      error: done.fail,
    });
  });

  it('imports Fidelity positions client-side', done => {
    encStore.getBrokerageAccounts.and.resolveTo([]);
    encStore.upsertBrokerageAccount.and.callFake(async (body: any) => ({ id: 1, ...body } as any));
    encStore.getHoldings.and.resolveTo([]);
    const stage = { id: 4, source: 'fidelity', filename: 'fidelity.csv', status: 'staged', account_masks: ['Z111'], expected_row_count: 1, account_replacements: [], created_at: '2026-10-11T00:00:00Z' };
    encStore.createHoldingImportStage.and.callFake(async (body: any, rows: any[]) => ({ id: 4, ...body, expected_row_count: rows.length } as any));
    encStore.getHoldingImportStages.and.resolveTo([stage] as any);
    encStore.getHoldingImportStageRows.and.resolveTo([]);
    encStore.verifyHoldingImportStage.and.callFake(async () => ({ id: 4, status: 'verified' } as any));
    encStore.activateHoldingImportStage.and.resolveTo({ accounts_replaced: 1, holdings_replaced: 0, inserted: 1, accounts: ['Fidelity ···Z111'], stage_id: 4, status: 'activated' });
    encStore.getNetWorth.and.resolveTo({
      other_assets: 0,
      portfolio: 0,
      liabilities: 0,
      total_assets: 0,
      total: 0,
    });

    const csv = [
      'Account Number,Account Name,Symbol,Quantity,Average Cost Basis',
      'Z111,Individual,VOO,2,500',
    ].join('\n');
    const file = new File([csv], 'fidelity.csv', { type: 'text/csv' });

    service.previewFidelityImport(file).subscribe({
      next: preview => {
        expect(preview.summary.positions).toBe(1);
        service.commitFidelityImport(preview.filename, preview.rows).subscribe({
          next: result => {
            expect(result.inserted).toBe(1);
            expect(encStore.createHoldingImportStage).toHaveBeenCalled();
            expect(encStore.verifyHoldingImportStage).toHaveBeenCalledWith(4);
            expect(encStore.activateHoldingImportStage).toHaveBeenCalledWith(4);
            http.expectNone(r => r.url.includes('/imports/fidelity') || r.url.includes('/imports/brokerages'));
            done();
          },
          error: done.fail,
        });
      },
      error: done.fail,
    });
  });

  it('does not replay a completed dashboard after the vault locks', async () => {
    const asset = { id: 1, name: 'Savings', current_value: 40 } as Asset;
    encStore.getTransactions.and.resolveTo([]);
    encStore.getHoldings.and.resolveTo([]);
    encStore.getAssets.and.resolveTo([asset]);
    encStore.getLiabilities.and.resolveTo([]);
    encStore.getJobIncomes.and.resolveTo([]);
    encStore.getFixedExpenses.and.resolveTo([]);
    encStore.getSubscriptions.and.resolveTo([]);
    encStore.getNetWorth.and.resolveTo({ total: 40 } as never);
    encStore.getCashflowSummary.and.resolveTo({} as never);
    (encStore as unknown as { clear(): void }).clear = () => undefined;
    (TestBed.inject(VaultService) as unknown as { lock(): void }).lock = () => undefined;
    expect((await firstValueFrom(service.loadDashboard()))[2]).toEqual([asset]);
    service.clearSessionState();
    const seen: Asset[][] = [];
    service.loadDashboard().subscribe(result => seen.push(result[2]));
    expect(seen).toEqual([]);
  });

  it('reads the trip-spend ledger for the unlocked session and drops it after lock or a session change', async () => {
    const rows = [{ id: 1, date: '2026-01-02', type: 'expense', category: 'Food', amount: 5, trip_id: 7 }];
    (encStore as unknown as { sessionToken: number }).sessionToken = 3;
    encStore.getTransactions.and.resolveTo(rows as never);
    await expectAsync(service.readTripSpendLedger()).toBeResolvedTo(rows as never);

    let release!: (value: typeof rows) => void;
    encStore.getTransactions.and.returnValue(new Promise(resolve => { release = resolve; }) as never);
    const pending = service.readTripSpendLedger();
    wipeDek();
    release(rows);
    expect(await pending).toBeNull();

    holdDek({} as CryptoKey);
    (encStore as unknown as { sessionToken: number }).sessionToken = 3;
    encStore.getTransactions.and.callFake((async () => {
      (encStore as unknown as { sessionToken: number }).sessionToken = 4;
      return rows;
    }) as never);
    expect(await service.readTripSpendLedger()).toBeNull();
  });
});

describe('FinanceService with EncryptedStoreService', () => {
  interface Row {
    collection: string;
    client_id: string;
    ciphertext_b64: string;
    schema_version: number;
    key_version: number;
    revision: number;
    updated_at: string;
  }
  interface AssetSeed { id: number; name: string; category: string; current_value: number; as_of_date: string }

  afterEach(() => {
    wipeDek();
    TestBed.inject(HttpTestingController).verify();
    TestBed.resetTestingModule();
  });

  function harness(seed: { schema_version: number; data: AssetSeed }[], holdFirst = false) {
    const rows: Row[] = [];
    const payloads = new Map<string, AssetSeed>();
    let cipher = 0;
    let reads = 0;
    let pending: ((next: Row[]) => void) | null = null;
    const listed = (collection?: string) => rows
      .filter(row => !collection || row.collection === collection)
      .map(row => ({ ...row }));
    const vault = {
      isUnlocked: true,
      whenReady: () => Promise.resolve(),
      lock: () => wipeDek(),
      reportFallbackFailure: () => undefined,
      blindIndex: async () => 'index',
      deleteRecords: () => of({ ok: true }),
      listRecords: (collection?: string) => {
        if (holdFirst && reads++ === 0) {
          return new Observable<Row[]>(subscriber => {
            pending = next => { subscriber.next(next); subscriber.complete(); };
          });
        }
        return of(listed(collection));
      },
      decryptPayload: async (value: string) => JSON.parse(JSON.stringify(payloads.get(value))) as AssetSeed,
      encryptPayload: async (payload: AssetSeed) => {
        const key = `c${cipher++}`;
        payloads.set(key, JSON.parse(JSON.stringify(payload)) as AssetSeed);
        return key;
      },
      upsertRecords: (incoming: Row[]) => {
        const saved = incoming.map(record => {
          const index = rows.findIndex(row => row.collection === record.collection && row.client_id === record.client_id);
          const next = { ...record, revision: (index < 0 ? 0 : rows[index].revision) + 1, updated_at: '' };
          if (index < 0) rows.push(next);
          else rows[index] = next;
          return next;
        });
        return of(saved);
      },
    };
    for (const item of seed) {
      const key = `c${cipher++}`;
      payloads.set(key, item.data);
      rows.push({
        collection: 'assets', client_id: `asset-${rows.length}`, ciphertext_b64: key,
        schema_version: item.schema_version, key_version: 1, revision: 1, updated_at: '',
      });
    }
    const typed = vault as unknown as VaultService;
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [FinanceService, EncryptedStoreService, { provide: VaultService, useValue: typed }],
    });
    holdDek({} as CryptoKey);
    return {
      service: TestBed.inject(FinanceService),
      other: new EncryptedStoreService(typed),
      release: () => {
        if (!pending) throw new Error('asset read is not in flight');
        const next = pending;
        pending = null;
        next(rows.map(row => ({ ...row })));
      },
    };
  }

  const cash = (name: string, current_value: number): AssetSeed => ({
    id: 1, name, category: 'cash', current_value, as_of_date: '2026-10-01',
  });

  it('keeps a schema-1 asset rewrite on the first dashboard and hub load', async () => {
    const { service } = harness([{ schema_version: 1, data: cash('Cash', 40) }]);
    const result = await firstValueFrom(service.loadDashboard());
    expect(result[2]).toEqual([jasmine.objectContaining({ name: 'Cash', current_value: 40 })]);
    expect(result[3].total).toBe(40);
    const hub = await loadFinanceHubSnapshot(TestBed.inject(Injector), new AbortController().signal);
    expect(hub.status).toBe('ready');
    if (hub.status === 'ready') expect(hub.snapshot.netWorth.total).toBe(40);
  });

  it('emits the dashboard when another tab writes an asset during the read', async () => {
    const { service, other, release } = harness([], true);
    const pending = firstValueFrom(service.loadDashboard());
    await new Promise(resolve => setTimeout(resolve, 0));
    await other.addAsset({ name: 'Other tab', category: 'cash', current_value: 25, as_of_date: '2026-10-02' });
    const refresh = service.refreshCollectionsFromAnotherTab(['assets']);
    release();
    const result = await pending;
    await refresh;
    expect(result[2]).toEqual([jasmine.objectContaining({ name: 'Other tab', current_value: 25 })]);
    expect(result[3].total).toBe(25);
  });
});
