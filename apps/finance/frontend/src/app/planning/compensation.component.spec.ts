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
  const priorJob = enrichJobIncome({
    id: 2, employer: 'Acme', base_pay: 0, pay_frequency: 'annual',
    effective_date: '2025-01-01', end_date: '2025-12-31', is_active: false,
  } as JobIncome);

  beforeEach(async () => {
    jasmine.clock().install();
    jasmine.clock().mockDate(new Date('2026-10-09T12:00:00Z'));
    incomes = new BehaviorSubject([job, priorJob]);
    finance = jasmine.createSpyObj('FinanceService', ['getJobIncomes', 'updateJobIncome'], { jobIncomes$: incomes.asObservable() });
    finance.getJobIncomes.and.returnValue(of([job, priorJob]));
    finance.updateJobIncome.and.callFake((id, body) => {
      const updated = enrichJobIncome({ ...job, ...body, id });
      incomes.next([updated, priorJob]);
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

  afterEach(() => jasmine.clock().uninstall());

  const button = (text: string, fixture: ComponentFixture<CompensationComponent>): HTMLButtonElement =>
    Array.from(fixture.nativeElement.querySelectorAll('button')).find((node: any) => node.textContent.trim() === text) as HTMLButtonElement;

  const inputByLabel = (text: string): HTMLInputElement =>
    (Array.from(fixture.nativeElement.querySelectorAll('label')).find((node: any) => node.querySelector('span')?.textContent.trim() === text) as HTMLLabelElement).querySelector('input')!;

  const stockInputByLabel = (text: string): HTMLInputElement => {
    const section = fixture.nativeElement.querySelector('section[aria-labelledby="stock-title"]') as HTMLElement;
    return (Array.from(section.querySelectorAll('label')).find((node: any) => node.querySelector('span')?.textContent.trim() === text) as HTMLLabelElement).querySelector('input')!;
  };

  const stockSelectByLabel = (text: string): HTMLSelectElement => {
    const section = fixture.nativeElement.querySelector('section[aria-labelledby="stock-title"]') as HTMLElement;
    return (Array.from(section.querySelectorAll('label')).find((node: any) => node.querySelector('span')?.textContent.trim() === text) as HTMLLabelElement).querySelector('select')!;
  };

  const enter = (input: HTMLInputElement, value: string): void => {
    input.value = value;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  };

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

  it('records a stock bonus, valuation, and sale through the rendered editor and updates annual compensation', async () => {
    button('Edit', fixture).click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    button('Add valuation', fixture).click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    button('Add stock grant', fixture).click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    enter(stockInputByLabel('Valuation date'), '2026-01-31');
    enter(stockInputByLabel('Private share value'), '200');
    enter(stockInputByLabel('Grant date'), '2026-01-01');
    const origin = stockSelectByLabel('Award type');
    origin.value = 'bonus';
    origin.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    enter(stockInputByLabel('Label (optional)'), 'Annual bonus');
    enter(stockInputByLabel('Shares granted'), '200');
    enter(stockInputByLabel('Price per share at grant'), '100');

    button('Add sale', fixture).click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    enter(stockInputByLabel('Sale date'), '2026-01-20');
    enter(stockInputByLabel('Shares sold'), '100');
    enter(stockInputByLabel('Total cash proceeds'), '15000');
    await fixture.whenStable();
    button('Save', fixture).click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(finance.updateJobIncome).toHaveBeenCalledWith(1, jasmine.objectContaining({
      stock_grants: [jasmine.objectContaining({
        date: '2026-01-01', origin: 'bonus', quantity: 200, price_at_grant: 100,
        sales: [{ date: '2026-01-20', shares: 100, cash_proceeds: 15000 }],
      })],
      stock_valuations: [{ date: '2026-01-31', price_per_share: 200 }],
    }));
    expect(fixture.componentInstance.total).toBe(38500);
    expect(fixture.nativeElement.querySelector('app-income').textContent).toContain('100 shares converted to cash on 2026-01-20');

    const year = fixture.nativeElement.querySelector('select[name="compensation_year"]') as HTMLSelectElement;
    year.value = '2025';
    year.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(fixture.componentInstance.start).toBe('2025-01-01');
    expect(fixture.componentInstance.end).toBe('2025-12-31');
    expect(fixture.componentInstance.total).toBe(0);

    year.value = '2026';
    year.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(fixture.componentInstance.start).toBe('2026-01-01');
    expect(fixture.componentInstance.end).toBe('2026-10-09');
    expect(fixture.componentInstance.total).toBe(38500);
    expect(fixture.nativeElement.querySelector('ui-card').textContent).toContain('$38,500.00');
  });
});
