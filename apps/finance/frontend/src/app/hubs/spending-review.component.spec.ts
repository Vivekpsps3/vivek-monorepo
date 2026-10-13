import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { fakeAsync, tick } from '@angular/core/testing';
import { BehaviorSubject, of, Subject } from 'rxjs';
import { SpendingReviewComponent } from './spending-review.component';

describe('SpendingReviewComponent handoff', () => {
  it('refreshes mounted coverage and account labels after bank and receipt data changes', fakeAsync(() => {
    let accounts: any[] = [{ account_key: 'account-a', display_name: 'Old card label', confirmed: true }];
    let receipts: any[] = [{
      id: 1, status: 'complete', unresolved: [], filenames: ['august.csv'], account_displays: ['Old card label'],
      coverage: [{ account_key: 'account-a', start_date: '2026-08-01', end_date: '2026-08-31', confirmed: true }],
    }];
    const dataChanges$ = new Subject<any>();
    const finance = {
      dataChanges$,
      getAllTransactions: () => of([]),
      getBankAccounts: () => of(accounts),
      getImportReceipts: () => of(receipts),
    } as any;
    const routeQuery = new BehaviorSubject(convertToParamMap({ t: 'review', month: '2026-08' }));
    const route = { queryParamMap: routeQuery.asObservable() } as unknown as ActivatedRoute;
    const router = jasmine.createSpyObj<Router>('Router', ['navigate']);
    const component = new SpendingReviewComponent(finance, { markForCheck: () => {} } as any, route, router);
    component.ngOnInit();
    expect(component.coverageReports[0].periods[0].gaps).toEqual([]);

    accounts = [{ account_key: 'account-a', display_name: 'Renamed card', confirmed: true }];
    receipts = [{ ...receipts[0], status: 'withdrawn' }];
    dataChanges$.next({ collections: ['bank_accounts', 'import_batches'], source: 'remote' });
    tick(80);

    expect(component.confirmedAccounts[0].display_name).toBe('Renamed card');
    expect(component.coverageReports[0].periods[0].gaps).toEqual([{ start: '2026-08-01', end: '2026-08-31' }]);
    component.ngOnDestroy();
  }));

  it('opens the selected transaction with exact group, account, and both matched periods while clearing stale Activity filters', () => {
    const transaction = {
      id: 22, date: '2026-08-15', type: 'expense', category: 'Groceries', amount: 42,
      merchant: 'Green Market', bank_account_key: 'account-a', account_display: 'Main card',
      kind: 'purchase', reviewed: true,
    } as any;
    const prior = {
      id: 21, date: '2026-07-15', type: 'expense', category: 'Groceries', amount: 30,
      merchant: 'Green Market', bank_account_key: 'account-a', kind: 'purchase', reviewed: true,
    } as any;
    const finance = {
      getAllTransactions: () => of([transaction, prior]),
      getBankAccounts: () => of([{ account_key: 'account-a', display_name: 'Main card', confirmed: true }]),
      getImportReceipts: () => of([]),
    } as any;
    const routeQuery = new BehaviorSubject(convertToParamMap({
      t: 'review', month: '2026-08', q: 'stale search', receipt: '8', category: 'old category',
    }));
    const route = { queryParamMap: routeQuery.asObservable() } as unknown as ActivatedRoute;
    const router = jasmine.createSpyObj<Router>('Router', ['navigate']);
    const component = new SpendingReviewComponent(finance, { markForCheck: () => {} } as any, route, router);
    component.ngOnInit();

    const row = component.comparisonRows.find(candidate => candidate.label === 'Groceries')!;
    component.openDrilldown(row);
    component.openActivity(transaction);

    const navigation = router.navigate.calls.mostRecent().args[1] as any;
    expect(navigation.queryParams).toEqual(jasmine.objectContaining({
      t: 'activity', v: 'spending', account: 'account-a', category: 'Groceries', merchant: null,
      periodStart: '2026-08-01', periodEnd: '2026-08-31',
      priorStart: '2026-07-01', priorEnd: '2026-07-31', edit: 22,
      q: null, receipt: null, month: null,
    }));
    expect(navigation.queryParamsHandling).toBe('merge');
    component.ngOnDestroy();
  });
});
