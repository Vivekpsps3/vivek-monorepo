import { of } from 'rxjs';
import { ChartsComponent } from './charts.component';

describe('ChartsComponent', () => {
  it('uses the full ledger for category totals and applies transaction kinds', () => {
    const fullLedger = [
      { id: 1, date: '2026-08-02', type: 'expense', category: 'Food', amount: 100, kind: 'purchase' },
      { id: 2, date: '2026-08-03', type: 'expense', category: 'Food', amount: 10, kind: 'refund' },
      { id: 3, date: '2026-08-04', type: 'expense', category: 'Transfer', amount: 50, kind: 'transfer' },
    ] as any;
    const financeService = {
      transactions$: of([{ id: 99, date: '2026-08-01', type: 'expense', category: 'Paged only', amount: 1 }]),
      holdings$: of([]),
      jobIncomes$: of([]),
      fixedExpenses$: of([]),
      subscriptions$: of([]),
      getAllTransactions: jasmine.createSpy().and.returnValue(of(fullLedger)),
    };
    const cdr = { markForCheck: jasmine.createSpy() };
    const router = jasmine.createSpyObj('Router', ['navigate']);
    const component = new ChartsComponent(financeService as any, cdr as any, router as any);
    component.embedded = true;

    component.ngOnInit();

    expect(financeService.getAllTransactions).toHaveBeenCalled();
    expect(component.allCategoryRows).toEqual([{ label: 'Food', value: 90, pct: 100 }]);
    expect(component.allCategoryRows.some(row => row.label === 'Paged only')).toBeFalse();
    component.ngOnDestroy();
  });

  it('keeps refund-only category effects signed and uses net total percentages', () => {
    const component = new ChartsComponent({} as any, { markForCheck: () => {} } as any, { navigate: () => Promise.resolve(true) } as any);
    (component as any).txOverride = [
      { id: 1, date: '2026-08-02', type: 'expense', category: 'Dining', amount: 25, kind: 'purchase' },
      { id: 2, date: '2026-08-03', type: 'expense', category: 'Returned item', amount: 10, kind: 'refund' },
    ];
    (component as any).computeDerived();

    expect(component.allCategoryRows.length).toBe(2);
    const byCategory = new Map(component.allCategoryRows.map(row => [row.label, row]));
    expect(byCategory.get('Returned item')?.value).toBe(-10);
    expect(byCategory.get('Dining')?.value).toBe(25);
    expect(component.allCategoryRows.reduce((sum, row) => sum + (row.pct || 0), 0)).toBeCloseTo(100);
    expect(byCategory.get('Returned item')?.pct).toBeCloseTo(-66.6667, 3);
    expect(byCategory.get('Dining')?.pct).toBeCloseTo(166.6667, 3);
  });

  it('marks percentages unavailable when recorded category totals are non-positive', () => {
    const component = new ChartsComponent({} as any, { markForCheck: () => {} } as any, { navigate: () => Promise.resolve(true) } as any);
    (component as any).txOverride = [
      { id: 1, date: '2026-08-02', type: 'expense', category: 'Returned item', amount: 10, kind: 'refund' },
    ];
    (component as any).computeDerived();
    expect(component.allCategoryRows).toEqual([{ label: 'Returned item', value: -10, pct: null }]);
  });

  it('drills chart points into Activity', () => {
    const router = jasmine.createSpyObj('Router', ['navigate']);
    const component = new ChartsComponent({} as any, { markForCheck: () => {} } as any, router as any);
    component.monthlyRows = [{ month: '2026-09', label: 'Sep 26', income: 20, expense: 12, net: 8 }];

    component.openMonthlyDrilldown(0, 1);
    expect(router.navigate.calls.mostRecent().args).toEqual([
      ['/finance/spending'], { queryParams: { t: 'activity', v: 'spending', month: '2026-09' } },
    ]);
    expect(component.monthlyRowQuery(component.monthlyRows[0], 0)).toEqual({
      t: 'activity', v: 'income', month: '2026-09',
    });
    expect(component.monthlyRowQuery(component.monthlyRows[0], 1)).toEqual({
      t: 'activity', v: 'spending', month: '2026-09',
    });
  });

  it('keeps a real Other category drillable while the synthetic Other tail only expands', () => {
    const router = jasmine.createSpyObj('Router', ['navigate']);
    const component = new ChartsComponent({} as any, { markForCheck: () => {} } as any, router as any);
    component.allCategoryRows = [
      { label: 'Other', value: 100, pct: 40 },
      ...['A', 'B', 'C', 'D', 'E', 'F'].map((label, index) => ({ label, value: 50 - index, pct: 10 })),
    ];
    const rows = component.categoryRows;
    expect(rows[0].label).toBe('Other');
    expect(rows[6]).toEqual(jasmine.objectContaining({ label: 'Other', synthetic: true }));
    component.openCategoryDrilldown(0);
    expect(router.navigate.calls.mostRecent().args).toEqual([
      ['/finance/spending'], { queryParams: { t: 'activity', v: 'spending', month: 'all', category: 'Other' } },
    ]);
    router.navigate.calls.reset();
    component.openCategoryDrilldown(6);
    expect(component.collapsedCategories).toBeFalse();
    expect(router.navigate).not.toHaveBeenCalled();
  });
});
