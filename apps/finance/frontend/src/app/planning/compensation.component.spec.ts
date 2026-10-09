import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BehaviorSubject, of } from 'rxjs';
import { CompensationComponent } from './compensation.component';
import { FinanceService } from '../services/finance.service';
import { ConfirmService } from '../services/confirm.service';
import { ToastService } from '../services/toast.service';
import { JobIncome } from '../models/transaction.model';
import { enrichJobIncome } from '../crypto/client-finance';

describe('Planning employer compensation', () => {
  let fixture: ComponentFixture<CompensationComponent>;
  let incomes: BehaviorSubject<JobIncome[]>;
  let finance: jasmine.SpyObj<FinanceService>;
  const job = enrichJobIncome({
    id: 1, employer: 'Acme', base_pay: 36525, pay_frequency: 'annual',
    effective_date: '2026-01-01', end_date: '2026-01-20', is_active: true,
    promotions: [{ date: '2026-01-11', annual_base_pay: 73050 }],
    compensation_payments: [{ date: '2026-01-31', kind: 'bonus', amount: 500 }],
  } as JobIncome);

  beforeEach(async () => {
    incomes = new BehaviorSubject([job]);
    finance = jasmine.createSpyObj('FinanceService', ['getJobIncomes', 'updateJobIncome'], { jobIncomes$: incomes.asObservable() });
    finance.getJobIncomes.and.returnValue(of([job]));
    finance.updateJobIncome.and.callFake((id, body) => {
      const updated = enrichJobIncome({ ...job, ...body, id });
      incomes.next([updated]);
      return of(updated);
    });
    await TestBed.configureTestingModule({
      imports: [CompensationComponent],
      providers: [
        { provide: FinanceService, useValue: finance },
        { provide: ConfirmService, useValue: { ask: () => Promise.resolve(true) } },
        { provide: ToastService, useValue: jasmine.createSpyObj('ToastService', ['success', 'error']) },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(CompensationComponent);
    fixture.componentInstance.end = '2026-01-31';
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  });

  const button = (text: string, fixture: ComponentFixture<CompensationComponent>): HTMLButtonElement =>
    Array.from(fixture.nativeElement.querySelectorAll('button')).find((node: any) => node.textContent.trim() === text) as HTMLButtonElement;

  const inputByLabel = (text: string): HTMLInputElement =>
    (Array.from(fixture.nativeElement.querySelectorAll('label')).find((node: any) => node.querySelector('span')?.textContent.trim() === text) as HTMLLabelElement).querySelector('input')!;

  it('renders the employer breakdown and changes the selected period', () => {
    const metric = fixture.nativeElement.querySelector('ui-card');
    expect(metric.textContent).toContain('Total compensation by employer');
    expect(metric.textContent).toContain('$3,500.00');
    fixture.componentInstance.start = '2026-01-31';
    fixture.componentInstance.refresh();
    fixture.detectChanges();
    expect(fixture.componentInstance.total).toBe(500);
    expect(metric.textContent).toContain('$500.00');
    fixture.componentInstance.start = '2026-02-01';
    fixture.componentInstance.refresh();
    fixture.detectChanges();
    expect(metric.querySelector('[role="alert"]').textContent).toContain('Through date');
  });

  it('edits dated history from Planning and updates the metric after saving', async () => {
    button('Edit', fixture).click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('input[name="end_date"]').value).toBe('2026-01-20');
    expect(inputByLabel('Promotion date').value).toBe('2026-01-11');
    const amount: HTMLInputElement = inputByLabel('Gross amount');
    amount.value = '1000';
    amount.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    await fixture.whenStable();
    button('Save', fixture).click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(finance.updateJobIncome).toHaveBeenCalled();
    expect(fixture.componentInstance.total).toBe(4000);
    expect(fixture.nativeElement.querySelector('ui-card').textContent).toContain('$4,000.00');
  });
});
