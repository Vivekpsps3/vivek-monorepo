import { ComponentFixture,TestBed } from '@angular/core/testing';
import { ConfirmService,ToastService } from '@vivek/ui';
import { BehaviorSubject,of } from 'rxjs';
import { enrichJobIncome } from '../crypto/client-finance';
import { JobIncome } from '../models/transaction.model';
import { FinanceService } from '../services/finance.service';
import { MarketRefreshCoordinatorService } from '../services/market-refresh-coordinator.service';
import { IncomeComponent } from './income.component';

describe('Jobs and pay editor regressions', () => {
  let fixture: ComponentFixture<IncomeComponent>;
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
    finance = jasmine.createSpyObj('FinanceService', ['getJobIncomes', 'updateJobIncome', 'lookupSharePrice'], { jobIncomes$: incomes.asObservable() });
    finance.getJobIncomes.and.returnValue(of([job, priorJob]));
    finance.lookupSharePrice.and.returnValue(of({
      symbol: 'MSFT', price: 100, price_source: 'live_eod',
      quote_date: '2026-10-08', price_as_of: '2026-10-09T12:00:00Z', valid: true,
    }));
    finance.updateJobIncome.and.callFake((id, body) => {
      const current = incomes.value.find(row => row.id === id) || job;
      const updated = enrichJobIncome({ ...current, ...body, id });
      incomes.next(incomes.value.map(row => row.id === id ? updated : row));
      return of(updated);
    });
    await TestBed.configureTestingModule({
      imports: [IncomeComponent],
      providers: [
        { provide: FinanceService, useValue: finance },
        { provide: ConfirmService, useValue: { ask: () => Promise.resolve(true) } },
        { provide: ToastService, useValue: jasmine.createSpyObj('ToastService', ['success', 'error']) },
        { provide: MarketRefreshCoordinatorService, useValue: { refreshSymbol: jasmine.createSpy('refreshSymbol').and.resolveTo({ symbol: 'MSFT', holdingsUpdated: 0, employerValuationsUpdated: 0, failedRecords: [] }) } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(IncomeComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  });

  afterEach(() => jasmine.clock().uninstall());


  const quickPriceInputByLabel = (text: string): HTMLInputElement => {
    const section = fixture.nativeElement.querySelector('.stock-quote-controls') as HTMLElement;
    return (Array.from(section.querySelectorAll('label')).find((node: any) => node.querySelector('span')?.textContent.trim() === text) as HTMLLabelElement).querySelector('input')!;
  };



  it('allows a private employer stock lot to save a dated manual price without a ticker', async () => {
    const privateStockJob = enrichJobIncome({
      ...job, id: 5, stock_symbol: undefined,
      stock_purchases: [{ date: '2026-01-01', quantity: 10, price_paid_per_share: 8 }],
    } as JobIncome);
    incomes.next([privateStockJob]);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const controls = fixture.nativeElement.querySelector('.stock-quote-controls') as HTMLElement;
    expect(controls.getAttribute('aria-label')).toBe('Private share price controls');
    expect(controls.querySelector('[role="status"]')?.textContent).toContain('No market ticker configured');
    expect(Array.from(controls.querySelectorAll('button')).some(button => (button.textContent || '').includes('Refresh market price'))).toBeFalse();
    expect((TestBed.inject(MarketRefreshCoordinatorService) as any).refreshSymbol).not.toHaveBeenCalled();

    quickPriceInputByLabel('Manual price as of').value = '2026-10-09';
    quickPriceInputByLabel('Manual price as of').dispatchEvent(new Event('input'));
    const priceInput = quickPriceInputByLabel('Manual price per share');
    priceInput.value = '12.5';
    priceInput.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    Array.from(controls.querySelectorAll('button'))
      .find(button => (button.textContent || '').trim() === 'Save current manual price')!.click();
    fixture.detectChanges();
    await fixture.whenStable();
    for (let i = 0; i < 8; i += 1) await Promise.resolve();

    expect(finance.updateJobIncome).toHaveBeenCalledWith(5, jasmine.objectContaining({
      stock_valuations: [jasmine.objectContaining({ date: '2026-10-09', price_per_share: 12.5, source: 'manual' })],
    }), true);
  });

});
