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
    const component = new ChartsComponent(financeService as any, cdr as any);
    component.embedded = true;

    component.ngOnInit();

    expect(financeService.getAllTransactions).toHaveBeenCalled();
    expect(component.allCategoryRows).toEqual([{ label: 'Food', value: 90, pct: 100 }]);
    expect(component.allCategoryRows.some(row => row.label === 'Paged only')).toBeFalse();
    component.ngOnDestroy();
  });

  it('keeps refund-only category effects signed and uses net total percentages', () => {
    const component = new ChartsComponent({} as any, { markForCheck: () => {} } as any);
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
    const component = new ChartsComponent({} as any, { markForCheck: () => {} } as any);
    (component as any).txOverride = [
      { id: 1, date: '2026-08-02', type: 'expense', category: 'Returned item', amount: 10, kind: 'refund' },
    ];
    (component as any).computeDerived();
    expect(component.allCategoryRows).toEqual([{ label: 'Returned item', value: -10, pct: null }]);
  });
});
