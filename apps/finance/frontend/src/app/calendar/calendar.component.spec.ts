import { CalendarComponent } from './calendar.component';

describe('CalendarComponent Activity handoff', () => {
  it('opens the selected transaction with its month, date, account, category, merchant, and edit id', () => {
    const component = new CalendarComponent({} as any, { markForCheck: () => {} } as any);
    component.currentDate = new Date(2026, 5, 1);
    component.transactions = [{
      id: 5, date: '2026-06-03', type: 'expense', category: ' Groceries ', amount: 18,
      merchant: ' Green Market ', bank_account_key: 'account-1', kind: 'purchase',
    } as any];

    expect(component.transactionActivityQuery(5)).toEqual({
      t: 'activity', v: 'all', month: '2026-06', date: '2026-06-03', account: 'account-1',
      category: 'groceries', merchant: 'green market', edit: 5,
    });
    component.ngOnDestroy();
  });

  it('keeps unassigned accounts explicit for exact calendar transaction edits', () => {
    const component = new CalendarComponent({} as any, { markForCheck: () => {} } as any);
    component.currentDate = new Date(2026, 5, 1);
    component.transactions = [{
      id: 6, date: '2026-06-04', type: 'expense', category: 'Food', amount: 9,
      merchant: '', bank_account_key: null, kind: 'purchase',
    } as any];
    expect(component.transactionActivityQuery(6)).toEqual(jasmine.objectContaining({
      account: '__unassigned_account__', category: 'food', merchant: 'unassigned merchant', edit: 6,
    }));
    component.ngOnDestroy();
  });
});
