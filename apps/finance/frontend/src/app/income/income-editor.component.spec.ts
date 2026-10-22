import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { BehaviorSubject, of } from 'rxjs';
import { IncomeComponent } from './income.component';
import { MarketRefreshCoordinatorService } from '../services/market-refresh-coordinator.service';
import { FinanceService } from '../services/finance.service';
import { ConfirmService } from '@vivek/ui';
import { ToastService } from '@vivek/ui';
import { JobIncome } from '../models/transaction.model';
import { enrichJobIncome } from '../crypto/client-finance';

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

  const button = (text: string, fixture: ComponentFixture<IncomeComponent>): HTMLButtonElement =>
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

  const expandEditorDetails = (): void => {
    Array.from(fixture.nativeElement.querySelectorAll('form details')).forEach((node: any) => { node.open = true; });
    fixture.detectChanges();
  };

  const enter = (input: HTMLInputElement, value: string): void => {
    input.value = value;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  };

  it('edits dated pay history from Jobs & pay', async () => {
    button('Edit', fixture).click();
    fixture.detectChanges();
    expandEditorDetails();
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
    expect(finance.updateJobIncome.calls.mostRecent().args[1].compensation_payments).toEqual([jasmine.objectContaining({ date: '2026-01-31', amount: 1000 })]);
  });

  it('shows the next configured payday for active jobs and keeps inactive jobs out of the projection', async () => {
    const scheduledJob = enrichJobIncome({
      ...job,
      id: 9,
      end_date: null,
      payday_frequency: 'biweekly',
      first_pay_date: '2026-10-15',
      second_pay_day: null,
    } as JobIncome);
    incomes.next([scheduledJob]);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Next paycheck Oct 15');
    expect(fixture.componentInstance.paydaySummary({ ...scheduledJob, is_active: false })).toContain('Inactive job');
    button('Edit', fixture).click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('input[name="first_pay_date"]').value).toBe('2026-10-15');
  });

  it('records a stock bonus and sale through the rendered editor and updates annual compensation', async () => {
    button('Edit', fixture).click();
    fixture.detectChanges();
    expandEditorDetails();
    await fixture.whenStable();
    fixture.detectChanges();

    button('Add stock grant', fixture).click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
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
      stock_valuations: [],
    }));
    expect(fixture.nativeElement.textContent).toContain('100 shares converted to cash on Jan 20');
  });

  it('records an ESPP market value separately from employee contributions in the rendered editor', async () => {
    button('Edit', fixture).click();
    fixture.detectChanges();
    expandEditorDetails();
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
    const incomeText = fixture.nativeElement.textContent;
    expect(incomeText).toContain('employee contribution $800.00');
    expect(incomeText).toContain('purchase-date market price');
    expect(fixture.nativeElement.querySelector('ui-card').textContent).toContain('$800.00');
  });

  it('preserves a valid prior-trading-day quote when editing a future-start job', async () => {
    const quote = { date: '2026-10-08', price_per_share: 100, source: 'live_eod', symbol: 'AAPL', observed_date: '2026-10-09' };
    const futureJob = enrichJobIncome({
      ...job, id: 6, effective_date: '2026-10-15', end_date: null, promotions: [], compensation_payments: [], stock_symbol: 'AAPL', notes: '',
      stock_grants: [{ date: '2026-10-15', origin: 'equity', quantity: 10, price_at_grant: 80 }],
      stock_valuations: [quote],
    } as JobIncome);
    incomes.next([futureJob]);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const incomeComponent = fixture.componentInstance;
    const editButton = Array.from(fixture.nativeElement.querySelectorAll('button'))
      .find((node: any) => node.textContent.trim() === 'Edit') as HTMLButtonElement;
    editButton.click();
    fixture.detectChanges();
    expandEditorDetails();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).not.toContain('Add valuation');
    incomeComponent.form.notes = 'Future role';
    incomeComponent.saveIncome();
    fixture.detectChanges();
    await fixture.whenStable();
    for (let i = 0; i < 8; i += 1) await Promise.resolve();

    const editorWrite = finance.updateJobIncome.calls.mostRecent().args[1];
    expect(editorWrite.notes).toBe('Future role');
    expect(editorWrite.stock_valuations).toEqual([jasmine.objectContaining(quote)]);
  });

  it('allows unrelated job edits when a saved market quote has no optional observation date', async () => {
    const quote = { date: '2026-10-08', price_per_share: 100, source: 'live_eod', symbol: 'AAPL' };
    const legacyQuoteJob = enrichJobIncome({
      ...job, id: 7, effective_date: '2026-01-01', end_date: null, promotions: [], compensation_payments: [],
      stock_symbol: 'AAPL', stock_valuations: [quote], notes: '',
    } as JobIncome);
    incomes.next([legacyQuoteJob]);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    button('Edit', fixture).click();
    fixture.detectChanges();
    expandEditorDetails();
    await fixture.whenStable();
    fixture.detectChanges();
    const notes = fixture.nativeElement.querySelector('input[name="notes"]') as HTMLInputElement;
    notes.value = 'Updated role notes';
    notes.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    button('Save', fixture).click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(finance.updateJobIncome).toHaveBeenCalledWith(7, jasmine.objectContaining({
      notes: 'Updated role notes',
      stock_valuations: [jasmine.objectContaining(quote)],
    }));
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
    }));
  });

  it('saves one manual current price, replaces earlier manual history and preserves market quote rows', async () => {
    const tickerJob = enrichJobIncome({
      ...job, id: 3, stock_symbol: 'MSFT',
      stock_grants: [{ date: '2026-01-01', origin: 'equity', quantity: 10, price_at_grant: 80 }],
      stock_valuations: [
        { date: '2026-10-08', price_per_share: 90, source: 'manual' },
        { date: '2026-10-07', price_per_share: 100, source: 'manual' },
        { date: '2026-10-08', price_per_share: 110, source: 'live_eod', symbol: 'MSFT', observed_date: '2026-10-09' },
        { date: '2026-10-09', price_per_share: 115, source: 'live_eod', symbol: 'MSFT', observed_date: '2026-10-09' },
      ],
    } as JobIncome);
    incomes.next([tickerJob, priorJob]);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const dateInput = quickPriceInputByLabel('Manual price as of');
    const priceInput = quickPriceInputByLabel('Manual price per share');
    expect(dateInput.value).toBe('2026-10-09');
    priceInput.value = '120';
    priceInput.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    const savePrice = Array.from(fixture.nativeElement.querySelectorAll('button'))
      .find((node: any) => node.textContent.trim() === 'Save current manual price') as HTMLButtonElement;
    savePrice.click();
    fixture.detectChanges();
    await fixture.whenStable();
    for (let i = 0; i < 8; i += 1) await Promise.resolve();
    fixture.detectChanges();
    dateInput.value = '2026-10-10';
    dateInput.dispatchEvent(new Event('input'));
    priceInput.value = '125';
    priceInput.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    savePrice.click();
    fixture.detectChanges();
    await fixture.whenStable();
    for (let i = 0; i < 8; i += 1) await Promise.resolve();
    fixture.detectChanges();

    const saved = finance.updateJobIncome.calls.mostRecent().args[1].stock_valuations;
    expect(finance.updateJobIncome.calls.allArgs().filter(([id]) => id === 3)).toHaveSize(2);
    expect(saved).toHaveSize(2);
    expect(saved?.filter(item => item.source === 'manual')).toEqual([jasmine.objectContaining({
      date: '2026-10-10', price_per_share: 125, source: 'manual', price_as_of: null,
    })]);
    expect(saved?.find(item => item.date === '2026-10-08' && item.source === 'live_eod')).toEqual(jasmine.objectContaining({
      date: '2026-10-08', price_per_share: 110, source: 'live_eod', symbol: 'MSFT',
    }));
    expect(saved?.some(item => item.date === '2026-10-09' && item.source === 'live_eod')).toBeFalse();
    expect(saved?.find(item => item.date === '2026-10-10')).toEqual(jasmine.objectContaining({
      date: '2026-10-10', price_per_share: 125, source: 'manual', price_as_of: null,
    }));
    expect(fixture.nativeElement.querySelector('[role="status"]').textContent).toContain('Saved manual price $125.0000');
  });

  it('keeps a quote added after the editor opened when the job is saved later', async () => {
    const tickerJob = enrichJobIncome({
      ...job, id: 3, stock_symbol: 'MSFT', notes: '',
      stock_grants: [{ date: '2026-01-01', origin: 'equity', quantity: 10, price_at_grant: 80 }],
      stock_valuations: [
        { date: '2026-10-07', price_per_share: 80, source: 'manual' },
        { date: '2026-10-08', price_per_share: 90, source: 'live_eod', symbol: 'MSFT', observed_date: '2026-10-09' },
      ],
    } as JobIncome);
    incomes.next([tickerJob, priorJob]);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const editButton = Array.from(fixture.nativeElement.querySelectorAll('button'))
      .find((node: any) => node.textContent.trim() === 'Edit') as HTMLButtonElement;
    editButton.click();
    fixture.detectChanges();
    expandEditorDetails();
    await fixture.whenStable();
    fixture.detectChanges();
    const quoteAddedWhileEditing = {
      date: '2026-10-08', price_per_share: 100, source: 'live_eod', symbol: 'MSFT',
      price_as_of: '2026-10-09T12:00:00Z', observed_date: '2026-10-09',
    };
    incomes.next([enrichJobIncome({ ...tickerJob, stock_valuations: [
      { date: '2026-10-09', price_per_share: 120, source: 'manual' },
      ...tickerJob.stock_valuations!.filter(item => item.source !== 'manual' && item.date !== quoteAddedWhileEditing.date),
      quoteAddedWhileEditing,
    ] }), priorJob]);
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
    expect(saved?.stock_valuations).toHaveSize(2);
    expect(saved?.stock_valuations?.filter(item => item.source === 'manual')).toEqual([
      jasmine.objectContaining({ date: '2026-10-09', price_per_share: 120, source: 'manual' }),
    ]);
    expect(saved?.stock_valuations).toContain(jasmine.objectContaining(quoteAddedWhileEditing));
  });
});
