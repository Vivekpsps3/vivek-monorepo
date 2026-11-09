import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ConfirmService, ToastService } from '@vivek/ui';
import { BehaviorSubject, of, throwError } from 'rxjs';
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

  it('links bill errors through ui-field, focuses the first invalid control, and keeps a failed draft', async () => {
    const component = fixture.componentInstance;
    component.openAddModal();
    fixture.detectChanges();
    await flushTurn();

    component.saveExpense();
    fixture.detectChanges();
    await flushTurn();

    const form = document.getElementById('bill-form')!;
    const summary = form.querySelector<HTMLElement>('[data-error-summary]')!;
    expect(document.activeElement).toBe(summary);
    expect(summary.textContent).toContain('Name');
    expect(summary.textContent).toContain('Amount');
    expect(finance.addFixedExpense).not.toHaveBeenCalled();

    const name = control(form, 'name');
    const amount = control(form, 'amount');
    expect(name.getAttribute('aria-invalid')).toBe('true');
    expect(name.getAttribute('data-field-invalid')).toBe('true');
    expect(name.closest('label')).toBeNull();
    expect(linkedError(name).textContent).toContain('Enter a name.');
    expect(linkedError(name).textContent).toContain('⚠');
    expect(linkedError(name).closest('ui-field')).not.toBeNull();
    expect(amount.getAttribute('aria-describedby')).toBe('bill-amount-error');
    expect(control(form, 'category').hasAttribute('aria-invalid')).toBeFalse();
    expect(control(form, 'dueDay').hasAttribute('aria-invalid')).toBeFalse();

    summary.querySelector('button')!.click();
    expect(document.activeElement).toBe(name);

    component.form.name = 'Rent';
    name.dispatchEvent(new FocusEvent('blur'));
    fixture.detectChanges();
    await flushTurn();
    expect(name.hasAttribute('aria-invalid')).toBeFalse();
    expect(amount.getAttribute('aria-invalid')).toBe('true');
    expect(component.form.name).toBe('Rent');

    component.form.category = '';
    component.form.due_day = 99;
    component.form.amount = 12.5;
    component.saveExpense();
    fixture.detectChanges();
    await flushTurn();
    expect(linkedError(control(form, 'category')).textContent).toContain('Enter a category.');
    expect(linkedError(control(form, 'dueDay')).textContent).toContain('Enter a day from 1 to 31.');
    expect(control(form, 'name').hasAttribute('aria-invalid')).toBeFalse();
    expect(finance.addFixedExpense).not.toHaveBeenCalled();

    component.form.category = 'Utilities';
    component.form.due_day = null;
    finance.addFixedExpense.and.returnValue(throwError(() => new Error('offline')));
    component.saveExpense();
    fixture.detectChanges();
    await flushTurn();
    expect(component.showModal).toBeTrue();
    expect(component.form.name).toBe('Rent');
    expect(component.form.amount).toBe(12.5);
    expect(component.saving).toBeFalse();
    const alert = dialogAlert(form);
    expect(alert.textContent).toContain("Couldn't save. Something went wrong. Try again.");
    expect(document.activeElement).toBe(alert);

    finance.addFixedExpense.and.returnValue(of({ id: 4 }) as ReturnType<FinanceService['addFixedExpense']>);
    component.saveExpense();
    fixture.detectChanges();
    await flushTurn();
    expect(finance.addFixedExpense).toHaveBeenCalledTimes(2);
    expect(component.showModal).toBeFalse();
  });

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
});

function flushTurn(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0));
}

function dialogAlert(form: HTMLElement): HTMLElement {
  const alert = form.closest('ui-dialog')?.querySelector<HTMLElement>('[data-dialog-alert]');
  if (!alert) throw new Error('missing save alert');
  return alert;
}

function control(form: ParentNode, field: string): HTMLInputElement {
  const input = form.querySelector<HTMLInputElement>(`[data-field="${field}"]`);
  if (!input) throw new Error(`missing ${field}`);
  return input;
}

function linkedError(input: HTMLElement): HTMLElement {
  const id = input.getAttribute('aria-describedby')?.split(' ').at(-1);
  const node = id ? document.getElementById(id) : null;
  if (!node) throw new Error(`missing error for ${input.id}`);
  return node;
}
