import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { BehaviorSubject, of, throwError } from 'rxjs';
import { CompensationComponent } from './compensation.component';
import { FinanceService } from '../services/finance.service';
import { ConfirmService } from '../services/confirm.service';
import { ToastService } from '../services/toast.service';
import { JobIncome } from '../models/transaction.model';
import { enrichJobIncome } from '../crypto/client-finance';
import { IncomeComponent } from '../income/income.component';

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
    const section = (fixture.nativeElement.querySelector('section[aria-labelledby="stock-title"]')
      || document.body.querySelector('section[aria-labelledby="stock-title"]')) as HTMLElement;
    return (Array.from(section.querySelectorAll('label')).find((node: any) => node.querySelector('span')?.textContent.trim() === text) as HTMLLabelElement).querySelector('input')!;
  };

  const stockSelectByLabel = (text: string): HTMLSelectElement => {
    const section = (fixture.nativeElement.querySelector('section[aria-labelledby="stock-title"]')
      || document.body.querySelector('section[aria-labelledby="stock-title"]')) as HTMLElement;
    return (Array.from(section.querySelectorAll('label')).find((node: any) => node.querySelector('span')?.textContent.trim() === text) as HTMLLabelElement).querySelector('select')!;
  };

  const quickPriceInputByLabel = (text: string): HTMLInputElement => {
    const section = fixture.nativeElement.querySelector('.stock-quote-controls') as HTMLElement;
    return (Array.from(section.querySelectorAll('label')).find((node: any) => node.querySelector('span')?.textContent.trim() === text) as HTMLLabelElement).querySelector('input')!;
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
    enter(stockInputByLabel('Share price'), '200');
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
      stock_valuations: [jasmine.objectContaining({ date: '2026-01-31', price_per_share: 200, source: 'manual', price_as_of: null })],
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

  it('records an ESPP market value separately from employee contributions in the rendered editor', async () => {
    button('Edit', fixture).click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    button('Add ESPP purchase', fixture).click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    enter(stockInputByLabel('Purchase date'), '2026-01-01');
    enter(stockInputByLabel('Label (optional)'), 'ESPP first offering');
    enter(stockInputByLabel('Shares purchased'), '10');
    enter(stockInputByLabel('Your purchase price per share'), '80');
    enter(stockInputByLabel('Market price at purchase (optional)'), '100');

    button('Save', fixture).click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(finance.updateJobIncome).toHaveBeenCalledWith(1, jasmine.objectContaining({
      stock_purchases: [jasmine.objectContaining({
        date: '2026-01-01', label: 'ESPP first offering', quantity: 10,
        price_paid_per_share: 80, market_price_at_purchase: 100, sales: [],
      })],
    }));
    expect(fixture.componentInstance.total).toBe(3700);
    const incomeText = fixture.nativeElement.querySelector('app-income').textContent;
    expect(incomeText).toContain('employee contribution $800.00');
    expect(incomeText).toContain('purchase-date market price');
    expect(fixture.nativeElement.querySelector('ui-card').textContent).toContain('$800.00');
  });

  it('loads a unique employer ticker once and saves its dated quote for each matching encrypted job', async () => {
    const tickerJob = enrichJobIncome({
      ...job, id: 3, stock_symbol: ' msft ',
      stock_grants: [{ date: '2026-01-01', origin: 'equity', quantity: 10, price_at_grant: 80 }],
    } as JobIncome);
    const duplicateTickerJob = enrichJobIncome({
      ...tickerJob, id: 4, employer: 'Other Employer', stock_symbol: 'MSFT',
    } as JobIncome);
    incomes.next([tickerJob, duplicateTickerJob]);
    fixture.detectChanges();
    await fixture.whenStable();
    for (let i = 0; i < 12; i += 1) await Promise.resolve();
    fixture.detectChanges();

    expect(finance.lookupSharePrice).toHaveBeenCalledOnceWith('MSFT', true);
    const quoteWrites = finance.updateJobIncome.calls.allArgs()
      .filter(([id]) => id === 3 || id === 4);
    expect(quoteWrites.length).toBe(2);
    expect(quoteWrites.map(([, body]) => body.stock_valuations![0])).toEqual([
      jasmine.objectContaining({
        date: '2026-10-08', price_per_share: 100, source: 'live_eod', symbol: 'MSFT',
        price_as_of: '2026-10-09T12:00:00Z', observed_date: '2026-10-09',
      }),
      jasmine.objectContaining({
        date: '2026-10-08', price_per_share: 100, source: 'live_eod', symbol: 'MSFT',
        price_as_of: '2026-10-09T12:00:00Z', observed_date: '2026-10-09',
      }),
    ]);

    const refreshButton = Array.from(document.body.querySelectorAll('app-income button'))
      .find((node: any) => node.textContent.includes('Refresh market price')) as HTMLButtonElement;
    refreshButton.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(finance.lookupSharePrice).toHaveBeenCalledTimes(2);
    expect(incomes.value.find(row => row.id === 3)!.stock_valuations!.filter(item => item.date === '2026-10-08')).toHaveSize(1);
  });

  it('can edit and save a future-start job after recording a prior-trading-day quote', async () => {
    const futureJob = enrichJobIncome({
      ...job, id: 6, effective_date: '2026-10-15', end_date: null, promotions: [], compensation_payments: [], stock_symbol: 'AAPL', notes: '',
      stock_grants: [{ date: '2026-10-15', origin: 'equity', quantity: 10, price_at_grant: 80 }],
    } as JobIncome);
    finance.lookupSharePrice.and.returnValue(of({
      symbol: 'AAPL', price: 100, price_source: 'live_eod', quote_date: '2026-10-08',
      price_as_of: '2026-10-09T12:00:00Z', valid: true,
    }));
    incomes.next([futureJob]);
    fixture.detectChanges();
    await fixture.whenStable();
    for (let i = 0; i < 12; i += 1) await Promise.resolve();
    fixture.detectChanges();

    const quoteWrite = finance.updateJobIncome.calls.allArgs().find(([id]) => id === 6)?.[1];
    expect(quoteWrite?.stock_valuations).toEqual([jasmine.objectContaining({
      date: '2026-10-08', price_per_share: 100, source: 'live_eod', symbol: 'AAPL', observed_date: '2026-10-09',
    })]);

    const incomeComponent = fixture.debugElement.query(By.directive(IncomeComponent)).componentInstance as IncomeComponent;
    const editButton = fixture.debugElement.queryAll(By.css('app-income ui-button'))
      .find(button => button.nativeElement.textContent.trim() === 'Edit');
    editButton!.triggerEventHandler('clicked', null);
    (incomeComponent as any).cdr.markForCheck();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const quoteInForm = incomeComponent.form.stock_valuations![0];
    expect(quoteInForm.date).toBe('2026-10-08');
    expect(incomeComponent.isMarketStockValuation(quoteInForm)).toBeTrue();
    const quoteDateInput = stockInputByLabel('Valuation date');
    expect(quoteDateInput.getAttribute('min')).toBeNull();
    incomeComponent.form.notes = 'Future role';
    incomeComponent.saveIncome();
    fixture.detectChanges();
    await fixture.whenStable();
    for (let i = 0; i < 8; i += 1) await Promise.resolve();

    const writes = finance.updateJobIncome.calls.allArgs().filter(([id]) => id === 6);
    const editorWrite = writes.find(([, body]) => body.notes === 'Future role')?.[1];
    expect(editorWrite).toBeDefined();
    expect(editorWrite?.stock_valuations).toEqual([jasmine.objectContaining({
      date: '2026-10-08', price_per_share: 100, source: 'live_eod', symbol: 'AAPL', observed_date: '2026-10-09',
    })]);
    expect(editorWrite?.notes).toBe('Future role');
  });

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
    expect(finance.lookupSharePrice).not.toHaveBeenCalled();

    quickPriceInputByLabel('Manual price date').value = '2026-10-09';
    quickPriceInputByLabel('Manual price date').dispatchEvent(new Event('input'));
    const priceInput = quickPriceInputByLabel('Manual price per share');
    priceInput.value = '12.5';
    priceInput.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    Array.from(controls.querySelectorAll('button'))
      .find(button => (button.textContent || '').trim() === 'Save dated manual price')!.click();
    fixture.detectChanges();
    await fixture.whenStable();
    for (let i = 0; i < 8; i += 1) await Promise.resolve();

    expect(finance.updateJobIncome).toHaveBeenCalledWith(5, jasmine.objectContaining({
      stock_valuations: [jasmine.objectContaining({ date: '2026-10-09', price_per_share: 12.5, source: 'manual' })],
    }));
  });

  it('saves a manual price from a rendered number input and replaces only the same date', async () => {
    const tickerJob = enrichJobIncome({
      ...job, id: 3, stock_symbol: 'MSFT',
      stock_grants: [{ date: '2026-01-01', origin: 'equity', quantity: 10, price_at_grant: 80 }],
      stock_valuations: [
        { date: '2026-10-08', price_per_share: 90, source: 'manual' },
        { date: '2026-10-09', price_per_share: 100, source: 'manual' },
      ],
    } as JobIncome);
    finance.lookupSharePrice.and.returnValue(throwError(() => new Error('offline')));
    incomes.next([tickerJob, priorJob]);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const dateInput = quickPriceInputByLabel('Manual price date');
    const priceInput = quickPriceInputByLabel('Manual price per share');
    expect(dateInput.value).toBe('2026-10-09');
    priceInput.value = '120';
    priceInput.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    const savePrice = Array.from(fixture.nativeElement.querySelectorAll('app-income button'))
      .find((node: any) => node.textContent.trim() === 'Save dated manual price') as HTMLButtonElement;
    savePrice.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const saved = finance.updateJobIncome.calls.allArgs().find(([id]) => id === 3)?.[1].stock_valuations;
    expect(saved).toHaveSize(2);
    expect(saved?.find(item => item.date === '2026-10-08')).toEqual(jasmine.objectContaining({
      date: '2026-10-08', price_per_share: 90, source: 'manual',
    }));
    expect(saved?.find(item => item.date === '2026-10-09')).toEqual(jasmine.objectContaining({
      date: '2026-10-09', price_per_share: 120, source: 'manual', price_as_of: null,
    }));
    expect(fixture.nativeElement.querySelector('app-income [role="status"]').textContent).toContain('Saved manual price $120.0000');
  });

  it('keeps a quote added after the editor opened when the job is saved later', async () => {
    const tickerJob = enrichJobIncome({
      ...job, id: 3, stock_symbol: 'MSFT', notes: '',
      stock_grants: [{ date: '2026-01-01', origin: 'equity', quantity: 10, price_at_grant: 80 }],
      stock_valuations: [{ date: '2026-10-08', price_per_share: 90 }],
    } as JobIncome);
    finance.lookupSharePrice.and.returnValue(throwError(() => new Error('offline')));
    incomes.next([tickerJob, priorJob]);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const editButton = Array.from(fixture.nativeElement.querySelectorAll('app-income button'))
      .find((node: any) => node.textContent.trim() === 'Edit') as HTMLButtonElement;
    editButton.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const quoteAddedWhileEditing = {
      date: '2026-10-08', price_per_share: 100, source: 'live_eod', symbol: 'MSFT',
      price_as_of: '2026-10-09T12:00:00Z', observed_date: '2026-10-09',
    };
    incomes.next([enrichJobIncome({ ...tickerJob, stock_valuations: [...tickerJob.stock_valuations!, quoteAddedWhileEditing] }), priorJob]);
    fixture.detectChanges();
    const notes = fixture.nativeElement.querySelector('input[name="notes"]') as HTMLInputElement;
    notes.value = 'Keep current quote';
    notes.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    button('Save', fixture).click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const saved = finance.updateJobIncome.calls.allArgs().find(([id]) => id === 3)?.[1];
    expect(saved?.notes).toBe('Keep current quote');
    expect(saved?.stock_valuations).toHaveSize(1);
    expect(saved?.stock_valuations?.[0]).toEqual(jasmine.objectContaining(quoteAddedWhileEditing));
  });
});
