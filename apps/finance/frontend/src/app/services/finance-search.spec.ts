import { Injector } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { firstValueFrom } from 'rxjs';
import { holdDek, wipeDek } from '../crypto/dek-holder';
import { VAULT_PRESENCE } from '../crypto/dek-store';
import { VaultService } from '../crypto/vault.service';
import { EncryptedStoreService } from '../crypto/encrypted-store.service';
import { FinanceLoadedNames, FinanceService } from './finance.service';
import {
  matchLoadedFinanceNames,
  resolveFinanceSearchRecents,
  resolveLoadedFinanceRecents,
  searchFinanceNames,
} from './finance-search';

function emptyNames(ready: Partial<FinanceLoadedNames['ready']> = {}): FinanceLoadedNames {
  return {
    assets: [],
    liabilities: [],
    holdings: [],
    fixedExpenses: [],
    subscriptions: [],
    ready: {
      assets: false,
      liabilities: false,
      holdings: false,
      fixedExpenses: false,
      subscriptions: false,
      ...ready,
    },
  };
}

function injectorFor(vault: unknown, finance: unknown): Injector {
  return {
    get(token: unknown) {
      if (token === VaultService) return vault;
      if (token === FinanceService) return finance;
      throw new Error('unexpected token');
    },
  } as Injector;
}

describe('finance name search', () => {
  afterEach(() => {
    wipeDek();
    localStorage.removeItem(VAULT_PRESENCE);
  });

  it('caps ready names at five and skips streams that were never published', () => {
    const loaded = emptyNames({ assets: true, holdings: true });
    loaded.assets = Array.from({ length: 6 }, (_, index) => ({ id: index + 1, name: `Cash ${index + 1}` }));
    loaded.liabilities = [{ id: 8, name: 'Cash card' }];
    loaded.holdings = [{ id: 3, symbol: 'VOO', name: 'Vanguard' }];
    const names = matchLoadedFinanceNames(loaded, 'cash');
    expect(names.map(row => row.title)).toEqual(['Cash 1', 'Cash 2', 'Cash 3', 'Cash 4', 'Cash 5']);
    expect(names.every(row => row.kind === 'account' && row.href === '/finance/have')).toBeTrue();
    expect(JSON.stringify(names)).not.toContain('Cash card');
    expect(JSON.stringify(names)).not.toContain('Vanguard');
    expect(matchLoadedFinanceNames(loaded, 'c')).toEqual([]);
    expect(matchLoadedFinanceNames(loaded, 'voo')).toEqual([{
      app: 'finance', kind: 'holding', id: 3, title: 'Vanguard', href: '/finance/have?t=holdings',
    }]);
  });

  it('matches bills after accounts and keeps holdings name-only', () => {
    const loaded = emptyNames({ assets: true, holdings: true, fixedExpenses: true, subscriptions: true });
    loaded.assets = [{ id: 1, name: 'Rent reserve' }];
    loaded.holdings = [{ id: 2, symbol: 'RENT', name: null }];
    loaded.fixedExpenses = [{ id: 3, name: 'Rent' }];
    loaded.subscriptions = [{ id: 4, name: 'Rental stream' }];
    expect(matchLoadedFinanceNames(loaded, 'rent').map(row => [row.kind, row.title, row.href])).toEqual([
      ['account', 'Rent reserve', '/finance/have'],
      ['holding', 'RENT', '/finance/have?t=holdings'],
      ['bill', 'Rent', '/finance/recurring?t=spend'],
      ['bill', 'Rental stream', '/finance/recurring?t=spend'],
    ]);
  });

  it('prunes a finance recent only when every stream for that kind is ready', () => {
    const partial = emptyNames({ assets: true });
    partial.assets = [{ id: 1, name: 'Checking' }];
    expect(resolveLoadedFinanceRecents(partial, [
      { kind: 'account', id: 1 },
      { kind: 'account', id: 9 },
    ])).toEqual({
      names: [{ app: 'finance', kind: 'account', id: 1, title: 'Checking', href: '/finance/have' }],
      missing: [],
    });
    const ready = emptyNames({ assets: true, liabilities: true, holdings: true });
    ready.assets = [{ id: 1, name: 'Checking' }];
    ready.holdings = [];
    expect(resolveLoadedFinanceRecents(ready, [
      { kind: 'account', id: 9 },
      { kind: 'holding', id: 3 },
    ]).missing).toEqual([
      { kind: 'account', id: 9 },
      { kind: 'holding', id: 3 },
    ]);
  });

  it('does not open the vault or the dashboard when no vault is present', async () => {
    const loadDashboard = jasmine.createSpy('loadDashboard');
    const result = await searchFinanceNames(injectorFor(
      { whenReady: () => Promise.reject(new Error('opened')), isUnlocked: true },
      { loadDashboard, peekLoadedNames: () => { throw new Error('peeked'); } },
    ), 'cash');
    expect(result).toEqual({ status: 'none' });
    expect(loadDashboard).not.toHaveBeenCalled();
  });

  it('returns locked without reading names when the vault is present but locked', async () => {
    localStorage.setItem(VAULT_PRESENCE, '1');
    const loadDashboard = jasmine.createSpy('loadDashboard');
    const peekLoadedNames = jasmine.createSpy('peekLoadedNames').and.returnValue(emptyNames({ assets: true }));
    const result = await searchFinanceNames(injectorFor(
      { whenReady: () => Promise.resolve(), isUnlocked: false },
      { loadDashboard, peekLoadedNames },
    ), 'cash');
    expect(result).toEqual({ status: 'locked' });
    expect(loadDashboard).not.toHaveBeenCalled();
    expect(peekLoadedNames).not.toHaveBeenCalled();
    const recents = await resolveFinanceSearchRecents(injectorFor(
      { whenReady: () => Promise.resolve(), isUnlocked: false },
      { loadDashboard, peekLoadedNames },
    ), [{ kind: 'account', id: 1 }]);
    expect(recents).toEqual({ status: 'locked', names: [], missing: [] });
  });

  it('reports unloaded when the vault is open and no name stream has been published', async () => {
    localStorage.setItem(VAULT_PRESENCE, '1');
    holdDek({} as CryptoKey);
    const loadDashboard = jasmine.createSpy('loadDashboard');
    const result = await searchFinanceNames(injectorFor(
      { whenReady: () => Promise.resolve(), isUnlocked: true },
      { loadDashboard, peekLoadedNames: () => emptyNames() },
    ), 'cash');
    expect(result).toEqual({ status: 'unloaded' });
    expect(loadDashboard).not.toHaveBeenCalled();
  });
});

describe('FinanceService name streams', () => {
  let service: FinanceService;
  let http: HttpTestingController;
  let encStore: jasmine.SpyObj<EncryptedStoreService>;

  beforeEach(() => {
    encStore = jasmine.createSpyObj<EncryptedStoreService>('EncryptedStoreService', [
      'getAssets', 'getHoldings', 'getLiabilities', 'getFixedExpenses', 'getSubscriptions',
    ]);
    (encStore as unknown as { changes$: unknown; clear(): void }).changes$ = { subscribe: () => ({ unsubscribe() { /* unused */ } }) };
    (encStore as unknown as { clear(): void }).clear = () => undefined;
    localStorage.setItem(VAULT_PRESENCE, '1');
    holdDek({} as CryptoKey);
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        FinanceService,
        { provide: VaultService, useValue: { whenReady: () => Promise.resolve(), isUnlocked: true, lock: () => wipeDek() } },
        { provide: EncryptedStoreService, useValue: encStore },
      ],
    });
    service = TestBed.inject(FinanceService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    wipeDek();
    localStorage.removeItem(VAULT_PRESENCE);
  });

  it('reads already-published names without loadDashboard or a provider request', async () => {
    expect(service.peekLoadedNames()?.ready.assets).toBeFalse();
    const loadDashboard = spyOn(service, 'loadDashboard').and.callThrough();
    encStore.getAssets.and.resolveTo([
      { id: 3, name: 'Checking', category: 'cash', current_value: 2500, as_of_date: '2026-10-01', notes: 'secret note', created_at: '', updated_at: '' },
    ] as never);
    await firstValueFrom(service.getAssets());
    const peeked = service.peekLoadedNames();
    expect(peeked?.assets).toEqual([{ id: 3, name: 'Checking' }]);
    expect(JSON.stringify(peeked)).not.toContain('2500');
    expect(JSON.stringify(peeked)).not.toContain('secret');
    const result = await searchFinanceNames(TestBed.inject(Injector), 'check');
    expect(result).toEqual({
      status: 'ready',
      names: [{ app: 'finance', kind: 'account', id: 3, title: 'Checking', href: '/finance/have' }],
    });
    expect(loadDashboard).not.toHaveBeenCalled();
    http.expectNone(() => true);
    service.clearSessionState();
    expect(service.peekLoadedNames()).toBeNull();
  });
});
