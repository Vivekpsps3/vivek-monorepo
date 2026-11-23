import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { BehaviorSubject, Subject, of, throwError } from 'rxjs';
import { VaultService } from '../crypto/vault.service';
import type { Holding, Transaction } from '../models/transaction.model';
import { FinanceService } from '../services/finance.service';
import { TreasuryGalleryComponent } from './treasury-gallery.component';

describe('TreasuryGalleryComponent', () => {
  const harbor = {
    id: 2, symbol: 'HARBOR', shares: 2, purchase_price: 100, purchase_date: '2026-01-02',
    current_price: 124.56, value: 249.12, price_source: 'live_eod', quote_date: '2026-10-14',
    position_as_of: '2026-10-14', account_display: 'Checking',
  } as Holding;
  const tide = {
    id: 3, symbol: 'TIDE', shares: 2, purchase_price: 10, purchase_date: '2026-03-02',
    current_price: 40, value: 80, price_source: 'live_eod', quote_date: '2020-01-01',
    position_as_of: '2026-10-01', account_display: 'Checking',
  } as Holding;
  const cafe = {
    id: 41, date: '2026-08-15', type: 'expense', category: 'Groceries', amount: 18.4,
    description: 'Boardwalk Cafe', bank_account_key: 'checking', account_display: 'Checking',
  } as Transaction;
  const books = {
    id: 42, date: '2026-08-16', type: 'expense', category: 'Books', amount: 9,
    description: 'Lighthouse Books',
  } as Transaction;

  function setup(options?: { fail?: boolean }) {
    const holdings$ = new BehaviorSubject<Holding[]>([harbor, tide]);
    const transactions$ = new BehaviorSubject<Transaction[]>([cafe, books]);
    const unlocked$ = new BehaviorSubject(true);
    let unlocked = true;
    let session = 1;
    let fail = options?.fail ?? false;
    const pending = new Subject<Holding[]>();
    const finance = {
      holdings$,
      transactions$,
      get sessionToken() { return session; },
      getHoldings: () => fail ? throwError(() => new Error('down')) : pending.asObservable(),
      getTransactions: () => of([cafe, books]),
    };
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: FinanceService, useValue: finance },
        { provide: VaultService, useValue: { unlocked$, get isUnlocked() { return unlocked; } } },
      ],
    });
    const fixture = TestBed.createComponent(TreasuryGalleryComponent);
    fixture.detectChanges();
    pending.next([harbor, tide]);
    fixture.detectChanges();
    return {
      fixture,
      holdings$,
      pending,
      host: fixture.nativeElement as HTMLElement,
      lock: () => { unlocked = false; unlocked$.next(false); fixture.detectChanges(); },
      failNext: () => { fail = true; },
      changeOwner: () => { session = 2; },
    };
  }

  it('opens the selected position and keeps a stale quote from becoming a gain', () => {
    const { host, fixture } = setup();
    expect(host.textContent).toContain('HARBOR');
    expect(host.textContent).toContain('Hidden');
    expect(host.textContent).not.toContain('$');
    expect(host.querySelector('[data-inspector-position]')?.getAttribute('data-position')).toBe('2');
    expect(host.querySelector('[data-inspector-ledger]')?.getAttribute('data-ledger')).toBe('42');

    (host.querySelector('[data-plaque="3"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    const inspector = host.querySelector('[data-inspector-position]');
    expect(inspector?.getAttribute('data-position')).toBe('3');
    expect(inspector?.textContent).toContain('TIDE');
    expect(inspector?.textContent).toContain('Shares 2');
    expect(inspector?.textContent).toContain('Mar 2');
    expect(inspector?.textContent).not.toContain('249.12');
    expect(host.querySelector('[data-gallery-gain]')?.textContent?.trim()).toBe('Unavailable');
    expect(host.querySelector('[data-plaque="2"]')?.textContent).toContain('Hidden');
    expect(host.querySelector('[data-plaque="2"]')?.textContent).not.toContain('$');
    expect(host.textContent).toContain('does not keep another ledger');
    expect(host.textContent).toContain('not counted as a gain');
  });

  it('opens the dated ledger line inside the active filter and keeps a failed reload draft', () => {
    const { host, fixture, failNext } = setup();
    const from = host.querySelector('input[type="date"]') as HTMLInputElement;
    const dates = host.querySelectorAll('input[type="date"]');
    (dates[1] as HTMLInputElement).value = '2026-08-15';
    dates[1].dispatchEvent(new Event('input'));
    (dates[2] as HTMLInputElement).value = '2026-08-15';
    dates[2].dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(host.querySelectorAll('[data-ledger-line]').length).toBe(1);
    expect(host.querySelector('[data-ledger-line="41"]')).not.toBeNull();
    expect(host.textContent).not.toContain('Lighthouse Books');

    (host.querySelector('[data-ledger-line="41"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    const ledger = host.querySelector('[data-inspector-ledger]');
    expect(ledger?.getAttribute('data-ledger')).toBe('41');
    expect(ledger?.textContent).toContain('Boardwalk Cafe');
    expect(ledger?.textContent).toContain('Groceries');
    expect(host.querySelector('[data-ledger-amount]')?.textContent).toContain('18.40');

    const search = host.querySelector('input[type="search"]') as HTMLInputElement;
    search.value = 'boardwalk';
    search.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    failNext();
    fixture.componentInstance.loadRecords();
    fixture.detectChanges();
    expect(host.querySelector('input[type="search"]')?.getAttribute('value') ?? (host.querySelector('input[type="search"]') as HTMLInputElement).value).toContain('boardwalk');
    expect(host.textContent).toContain("Couldn't load holdings and activity.");
    expect(from).toBeTruthy();
  });

  it('clears tickers when the vault locks and ignores a late holdings response', () => {
    const { host, fixture, holdings$, pending, lock } = setup();
    expect(host.textContent).toContain('TIDE');
    lock();
    holdings$.next([{ ...tide, symbol: 'SECRET' }]);
    pending.next([{ ...harbor, symbol: 'LATE' }]);
    fixture.detectChanges();
    expect(host.textContent).not.toContain('TIDE');
    expect(host.textContent).not.toContain('HARBOR');
    expect(host.textContent).not.toContain('SECRET');
    expect(host.textContent).not.toContain('LATE');
    expect(host.textContent).not.toContain('Boardwalk');
    expect(host.textContent).toContain('Tickers stay hidden');
    expect(host.textContent).not.toContain('$');
  });

  it('drops a publication after the owner session changes', () => {
    const { host, fixture, holdings$, changeOwner } = setup();
    changeOwner();
    holdings$.next([{ ...harbor, symbol: 'OTHER' }]);
    fixture.detectChanges();
    expect(host.textContent).not.toContain('OTHER');
    expect(host.textContent).not.toContain('HARBOR');
    expect(host.textContent).toContain('Tickers stay hidden');
  });
});
