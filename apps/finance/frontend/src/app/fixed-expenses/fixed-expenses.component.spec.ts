import { ComponentFixture,TestBed } from '@angular/core/testing';
import { ConfirmService,ToastService } from '@vivek/ui';
import { BehaviorSubject,of } from 'rxjs';
import { FinanceService } from '../services/finance.service';
import { FixedExpensesComponent } from './fixed-expenses.component';

describe('FixedExpensesComponent field errors', () => {
  let fixture: ComponentFixture<FixedExpensesComponent>;
  let finance: jasmine.SpyObj<FinanceService>;

  beforeEach(async () => {
    finance = jasmine.createSpyObj('FinanceService', [
      'getFixedExpenses', 'addFixedExpense', 'updateFixedExpense', 'deleteFixedExpense',
    ], { fixedExpenses$: new BehaviorSubject([]) });
    finance.getFixedExpenses.and.returnValue(of([]));
    finance.addFixedExpense.and.returnValue(of({ id: 1 }) as ReturnType<FinanceService['addFixedExpense']>);
    await TestBed.configureTestingModule({
      imports: [FixedExpensesComponent],
      providers: [
        { provide: FinanceService, useValue: finance },
        { provide: ConfirmService, useValue: { ask: () => Promise.resolve(false) } },
        { provide: ToastService, useValue: jasmine.createSpyObj('ToastService', ['success', 'error']) },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(FixedExpensesComponent);
    fixture.componentInstance.editorOnly = true;
    fixture.detectChanges();
    await fixture.whenStable();
  });

  afterEach(() => fixture.destroy());

  it('clears the validation session on Escape without writing the bill', async () => {
    const component = fixture.componentInstance;
    component.openAddModal();
    component.form.name = 'Draft rent';
    fixture.detectChanges();
    await flushTurn();
    component.saveExpense();
    fixture.detectChanges();
    await flushTurn();
    expect(component.fieldErrors.length).toBeGreaterThan(0);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();
    await flushTurn();
    expect(component.showModal).toBeFalse();
    expect(component.formSubmitted).toBeFalse();
    expect(finance.addFixedExpense).not.toHaveBeenCalled();

    component.openAddModal();
    fixture.detectChanges();
    await flushTurn();
    expect(document.getElementById('bill-form')!.querySelector('[data-error-summary]')).toBeNull();
    expect(component.form.name).toBe('');
  });

  it('REC3 opens More options for an existing bill and cancel keeps the record', async () => {
    const component = fixture.componentInstance;
    const bill = {
      id: 8, name: 'Rent', category: 'Rent', amount: 1500.5, frequency: 'monthly',
      start_date: '2026-01-01', end_date: '2026-12-31', due_day: 3, autopay: true,
      payment_account: 'Checking', is_active: true, notes: 'Lease',
    };
    component.openEditModal(bill as never);
    fixture.detectChanges();
    await flushTurn();
    const form = document.getElementById('bill-form')!;
    const more = form.querySelector('details.more-options') as HTMLDetailsElement;
    expect(more.open).toBeTrue();
    expect(form.querySelectorAll('[data-field="dueDay"]').length).toBe(1);
    expect((form.querySelector('[name="payment_account"]') as HTMLInputElement).value).toBe('Checking');
    expect((form.querySelector('[name="notes"]') as HTMLInputElement).value).toBe('Lease');
    expect((form.querySelector('[name="autopay"]') as HTMLInputElement).checked).toBeTrue();
    (form.querySelector('[name="notes"]') as HTMLInputElement).value = 'Changed';
    (form.querySelector('[name="notes"]') as HTMLInputElement).dispatchEvent(new Event('input'));
    fixture.detectChanges();
    const cancel = [...form.querySelectorAll('button')].find(node => node.textContent?.trim() === 'Cancel') as HTMLButtonElement;
    cancel.click();
    fixture.detectChanges();
    await flushTurn();
    expect(component.showModal).toBeFalse();
    expect(finance.updateFixedExpense).not.toHaveBeenCalled();
    expect(bill.notes).toBe('Lease');
    expect(bill.amount).toBe(1500.5);
  });
});

function flushTurn(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0));
}
