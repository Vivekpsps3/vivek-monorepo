import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ConfirmService, ToastService } from '@vivek/ui';
import { BehaviorSubject, of, throwError } from 'rxjs';
import { FinanceService } from '../services/finance.service';
import { SubscriptionsComponent } from './subscriptions.component';

describe('SubscriptionsComponent field errors', () => {
  let fixture: ComponentFixture<SubscriptionsComponent>;
  let finance: jasmine.SpyObj<FinanceService>;

  beforeEach(async () => {
    finance = jasmine.createSpyObj('FinanceService', [
      'getSubscriptions', 'addSubscription', 'updateSubscription', 'deleteSubscription',
    ], { subscriptions$: new BehaviorSubject([]) });
    finance.getSubscriptions.and.returnValue(of([]));
    finance.addSubscription.and.returnValue(of({ id: 1 }) as ReturnType<FinanceService['addSubscription']>);
    await TestBed.configureTestingModule({
      imports: [SubscriptionsComponent],
      providers: [
        { provide: FinanceService, useValue: finance },
        { provide: ConfirmService, useValue: { ask: () => Promise.resolve(false) } },
        { provide: ToastService, useValue: jasmine.createSpyObj('ToastService', ['success', 'error']) },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(SubscriptionsComponent);
    fixture.componentInstance.editorOnly = true;
    fixture.detectChanges();
    await fixture.whenStable();
  });

  afterEach(() => fixture.destroy());

  it('keeps subscription rules on the shared field, then preserves a failed draft for retry', async () => {
    const component = fixture.componentInstance;
    component.openAddModal();
    component.form.name = 'Stream';
    component.form.amount = -40;
    component.form.category = '';
    fixture.detectChanges();
    await flushTurn();

    component.saveSubscription();
    fixture.detectChanges();
    await flushTurn();

    const form = document.getElementById('subscription-form')!;
    const summary = form.querySelector<HTMLElement>('[data-error-summary]')!;
    const amount = control(form, 'amount');
    const name = control(form, 'name');
    expect(document.activeElement).toBe(summary);
    expect(component.fieldErrors.map(error => error.field)).toEqual(['amount']);
    expect(amount.getAttribute('aria-invalid')).toBe('true');
    expect(amount.getAttribute('data-field-invalid')).toBe('true');
    expect(linkedError(amount).textContent).toContain('Enter an amount above $0.');
    expect(linkedError(amount).textContent).toContain('⚠');
    expect(linkedError(amount).closest('ui-field')).not.toBeNull();
    expect(name.hasAttribute('aria-invalid')).toBeFalse();
    expect(form.querySelector('[name="category"]')!.hasAttribute('aria-invalid')).toBeFalse();
    expect(finance.addSubscription).not.toHaveBeenCalled();

    summary.querySelector('button')!.click();
    expect(document.activeElement).toBe(amount);

    component.form.amount = 8;
    amount.dispatchEvent(new FocusEvent('blur'));
    fixture.detectChanges();
    await flushTurn();
    expect(amount.hasAttribute('aria-invalid')).toBeFalse();
    expect(component.form.name).toBe('Stream');
    expect(component.form.category).toBe('');

    finance.addSubscription.and.returnValue(throwError(() => new Error('offline')));
    component.saveSubscription();
    fixture.detectChanges();
    await flushTurn();
    expect(component.showModal).toBeTrue();
    expect(component.saving).toBeFalse();
    expect(component.form.amount).toBe(8);
    const alert = dialogAlert(form);
    expect(alert.textContent).toContain("Couldn't save. Something went wrong. Try again.");
    expect(document.activeElement).toBe(alert);

    finance.addSubscription.and.returnValue(of({ id: 9 }) as ReturnType<FinanceService['addSubscription']>);
    component.saveSubscription();
    fixture.detectChanges();
    await flushTurn();
    expect(finance.addSubscription).toHaveBeenCalledTimes(2);
    const payload = finance.addSubscription.calls.mostRecent().args[0] as { category: string; name: string };
    expect(payload.name).toBe('Stream');
    expect(payload.category).toBe('Subscriptions');
    expect(component.showModal).toBeFalse();
  });

  it('Escape closes the dialog and drops the unsaved validation session', async () => {
    const component = fixture.componentInstance;
    component.openAddModal();
    fixture.detectChanges();
    await flushTurn();
    component.saveSubscription();
    fixture.detectChanges();
    await flushTurn();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();
    await flushTurn();
    expect(component.showModal).toBeFalse();
    expect(component.formSubmitted).toBeFalse();
    expect(finance.addSubscription).not.toHaveBeenCalled();
  });

  it('REC3 keeps the renew date, hides bill-only fields, and preserves More options', async () => {
    const component = fixture.componentInstance;
    const row = {
      id: 4, name: 'Stream', category: 'Video', amount: 15.99, frequency: 'monthly',
      next_bill_date: '2026-10-20', end_date: null, payment_account: 'Visa', is_active: true, notes: 'Family plan',
    };
    component.openEditModal(row as never);
    fixture.detectChanges();
    await flushTurn();
    const form = document.getElementById('subscription-form')!;
    expect((form.querySelector('[name="next_bill_date"]') as HTMLInputElement).value).toBe('2026-10-20');
    expect(form.textContent).not.toContain('Autopay');
    expect(form.textContent).not.toContain('Due day');
    expect(form.querySelector('[name="autopay"]')).toBeNull();
    expect(form.querySelector('[name="due_day"]')).toBeNull();
    const more = form.querySelector('details.more-options') as HTMLDetailsElement;
    expect(more.open).toBeTrue();
    expect(more.querySelector('summary')?.textContent).toContain('More options');
    expect((form.querySelector('[name="notes"]') as HTMLTextAreaElement).value).toBe('Family plan');
    expect((form.querySelector('[name="category"]') as HTMLInputElement).value).toBe('Video');
    const cancel = [...form.querySelectorAll('button')].find(node => node.textContent?.trim() === 'Cancel') as HTMLButtonElement;
    cancel.click();
    fixture.detectChanges();
    await flushTurn();
    expect(component.showModal).toBeFalse();
    expect(finance.updateSubscription).not.toHaveBeenCalled();
    expect(row.amount).toBe(15.99);
    expect(row.notes).toBe('Family plan');
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
  if (!node) throw new Error('missing linked error');
  return node;
}
