import {
  AfterViewInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  Input,
  OnDestroy,
  OnInit,
  ViewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Subject, combineLatest, takeUntil } from 'rxjs';
import type { Chart as ChartInstance, ChartItem } from 'chart.js';
import { FinanceService } from '../services/finance.service';
import {
  CashflowOccurrence,
  CashflowSummary,
  FixedExpense,
  IncomeCashflowOccurrence,
  JobIncome,
  Subscription,
  Transaction,
} from '../models/transaction.model';
import { computeCashflowSummary, monthEnd, transactionEffects } from '../crypto/client-finance';
import { WEEK_STARTS_ON, formatDate, formatMoney, formatPercent, fromDollars, plural, todayIsoDate, weekStartIndex } from '@vivek/browser';
import { spendingGroupKey, UNASSIGNED_ACCOUNT_FILTER } from '../utils/spending-filter.util';
import { monthKeyFromDate, MonthSpendSummary, summarizeMonthSpend } from '../utils/spend-summary.util';
import {
  chartColorAt,
  chartLegendBottom,
  chartSliceBorder,
} from '@vivek/ui';
import {
  UiBadgeComponent,
  UiButtonComponent,
  UiCardComponent,
  UiEmptyStateComponent,
  UiPageHeaderComponent,
  UiIconComponent,
} from '@vivek/ui';
import { MoneyPipe } from '@vivek/ui';
import { AppDatePipe } from '@vivek/ui';

interface CalendarDay {
  date: string;
  hasTransactions: boolean;
  /** Posted spend only (F8); scheduled amounts never enter the cell. */
  expense: number;
  income: number;
  /** Count of scheduled occurrences falling on this day. */
  scheduled?: number;
  isToday?: boolean;
}

type ChartConstructor = new (item: ChartItem, config: unknown) => ChartInstance;

@Component({
  selector: 'app-calendar',
  standalone: true,
  imports: [
    AppDatePipe,
    MoneyPipe,
    CommonModule,
    RouterLink,
    UiPageHeaderComponent,
    UiButtonComponent,
    UiCardComponent,
    UiBadgeComponent,
    UiEmptyStateComponent,
    UiIconComponent,
  ],
  templateUrl: './calendar.component.html',
  styleUrl: './calendar.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CalendarComponent implements OnInit, AfterViewInit, OnDestroy {
  formatShare(value: number | null | undefined): string {
    return formatPercent(value, 0);
  }
  @Input() embedded = false;
  readonly transactionEffects = transactionEffects;
  @ViewChild('categoryChart') categoryCanvas?: ElementRef<HTMLCanvasElement>;
  currentDate = new Date();
  transactions: Transaction[] = [];
  jobIncomes: JobIncome[] = [];
  fixedExpenses: FixedExpense[] = [];
  subscriptions: Subscription[] = [];
  countedOccurrences: CashflowOccurrence[] = [];
  cashflowSummary: CashflowSummary | null = null;
  selectedDate: string | null = null;
  selectedTransactions: Transaction[] = [];
  selectedPlans: CashflowOccurrence[] = [];
  selectedIncomeOccurrences: IncomeCashflowOccurrence[] = [];
  daysInMonth: CalendarDay[] = [];
  weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].slice(WEEK_STARTS_ON).concat(['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].slice(0, WEEK_STARTS_ON));
  weekdayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].slice(WEEK_STARTS_ON).concat(['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].slice(0, WEEK_STARTS_ON));
  private focusedDate: string | null = null;
  @ViewChild('dayHeading') dayHeading?: ElementRef<HTMLElement>;
  @ViewChild('dayDetail') dayDetail?: ElementRef<HTMLElement>;

  /** Weeks of seven cells; the last week is padded with blank days. */
  get weeks(): CalendarDay[][] {
    const weeks: CalendarDay[][] = [];
    for (let i = 0; i < this.daysInMonth.length; i += 7) {
      const week = this.daysInMonth.slice(i, i + 7);
      while (week.length < 7) week.push({ date: '', hasTransactions: false, expense: 0, income: 0 });
      weeks.push(week);
    }
    return weeks;
  }

  /** The grid's one tab stop: the focused day, else the selected day, else today, else the 1st. */
  get rovingDate(): string {
    if (this.focusedDate?.startsWith(this.monthKey)) return this.focusedDate;
    if (this.selectedDate) return this.selectedDate;
    const today = todayIsoDate();
    return today.startsWith(this.monthKey) ? today : `${this.monthKey}-01`;
  }

  get selectedHeading(): string {
    return this.selectedDate ? formatDate(this.selectedDate, 'heading') : '';
  }

  get selectedShortDate(): string {
    return this.selectedDate ? formatDate(this.selectedDate, 'table') : '';
  }

  get monthOnlyName(): string {
    return this.currentDate.toLocaleString('en-US', { month: 'long' });
  }

  get hasDayItems(): boolean {
    return this.selectedTransactions.length + this.selectedPlans.length + this.selectedIncomeOccurrences.length > 0;
  }
  monthSummary: MonthSpendSummary = summarizeMonthSpend([], monthKeyFromDate(new Date()));

  private destroy$ = new Subject<void>();
  private categoryChart?: ChartInstance;
  private chartCtor: ChartConstructor | null = null;
  private viewReady = false;

  constructor(
    private financeService: FinanceService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    combineLatest([
      this.financeService.transactions$,
      this.financeService.jobIncomes$,
      this.financeService.fixedExpenses$,
      this.financeService.subscriptions$,
    ]).pipe(takeUntil(this.destroy$)).subscribe(([transactions, jobIncomes, fixedExpenses, subscriptions]) => {
      this.transactions = transactions;
      this.jobIncomes = jobIncomes;
      this.fixedExpenses = fixedExpenses;
      this.subscriptions = subscriptions;
      this.generateCalendar();
      this.cdr.markForCheck();
    });
    this.financeService.getTransactions().pipe(takeUntil(this.destroy$)).subscribe({
      next: () => this.cdr.markForCheck(),
    });
  }

  ngAfterViewInit() {
    this.viewReady = true;
    void this.paintCategoryChart();
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
    this.categoryChart?.destroy();
  }

  get monthKey(): string {
    return monthKeyFromDate(this.currentDate);
  }

  get topPurchaseMax(): number {
    return this.monthSummary.topPurchases[0]?.amount || 1;
  }

  get undatedEstimateTotal(): number {
    return this.cashflowSummary?.income_occurrences
      .filter(row => row.date == null && row.kind === 'estimate')
      .reduce((sum, row) => sum + row.amount, 0) || 0;
  }

  transactionActivityQuery(transactionId: number): Record<string, string | number | null> {
    const tx = this.transactions.find(row => row.id === transactionId);
    if (!tx) return { t: null, v: 'spending', month: this.monthKey };
    return {
      t: null,
      v: 'all',
      month: this.monthKey,
      date: tx.date,
      account: tx.bank_account_key || UNASSIGNED_ACCOUNT_FILTER,
      category: spendingGroupKey(tx, 'category'),
      merchant: spendingGroupKey(tx, 'merchant'),
      edit: tx.id,
    };
  }

  generateCalendar() {
    const year = this.currentDate.getFullYear();
    const month = this.currentDate.getMonth();
    const firstDay = weekStartIndex(new Date(year, month, 1));
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const today = todayIsoDate();
    const monthKey = this.monthKey;
    const summary = computeCashflowSummary(
      `${monthKey}-01`,
      monthEnd(monthKey),
      this.transactions,
      this.jobIncomes,
      this.fixedExpenses,
      this.subscriptions,
    );
    this.cashflowSummary = summary;
    this.countedOccurrences = summary.counted_occurrences;
    const spendByDay = new Map<string, number>();
    const incomeByDay = new Map<string, number>();
    const datedIncome = summary.income_occurrences.filter(row => row.date && row.kind !== 'overlap');
    for (const row of datedIncome) {
      incomeByDay.set(row.date!, (incomeByDay.get(row.date!) || 0) + row.amount);
    }
    for (const tx of this.transactions) {
      const spending = transactionEffects(tx).spending;
      if (!spending) continue;
      spendByDay.set(tx.date, (spendByDay.get(tx.date) || 0) + spending);
    }
    // Scheduled occurrences are counted per day, never added to cell spend.
    const scheduledByDay = new Map<string, number>();
    for (const row of this.countedOccurrences) {
      scheduledByDay.set(row.date, (scheduledByDay.get(row.date) || 0) + 1);
    }

    this.daysInMonth = [];
    for (let i = 0; i < firstDay; i++) {
      this.daysInMonth.push({ date: '', hasTransactions: false, expense: 0, income: 0 });
    }
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      this.daysInMonth.push({
        date: dateStr,
        hasTransactions: this.transactions.some(t => t.date === dateStr)
          || this.countedOccurrences.some(row => row.date === dateStr)
          || incomeByDay.has(dateStr),
        expense: spendByDay.get(dateStr) || 0,
        income: incomeByDay.get(dateStr) || 0,
        scheduled: scheduledByDay.get(dateStr) || 0,
        isToday: dateStr === today,
      });
    }
    // Posted-only month summary (F8): Spent / Scheduled / Income / Net all
    // come from the posted ledger; scheduledTotal rides along separately.
    this.monthSummary = summarizeMonthSpend(this.transactions, monthKey, 5, this.countedOccurrences);
    if (this.selectedDate) this.applySelectedDay(this.selectedDate);
    this.cdr.markForCheck();
    setTimeout(() => void this.paintCategoryChart());
  }

  private chartCategoryRows() {
    return this.monthSummary.categories.slice(0, 8);
  }

  private async paintCategoryChart(): Promise<void> {
    if (!this.viewReady) return;
    const canvas = this.categoryCanvas?.nativeElement;
    const rows = this.chartCategoryRows();
    if (!canvas || !rows.length) {
      this.categoryChart?.destroy();
      this.categoryChart = undefined;
      return;
    }
    if (!this.chartCtor) {
      const mod = await import('chart.js/auto');
      this.chartCtor = mod.default as ChartConstructor;
    }
    const data = {
      labels: rows.map(row => row.label),
      datasets: [{
        data: rows.map(row => row.value),
        backgroundColor: rows.map((_, i) => chartColorAt(i)),
        ...chartSliceBorder(),
      }],
    };
    if (this.categoryChart) {
      this.categoryChart.data = data;
      this.categoryChart.update('none');
      return;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    this.categoryChart = new this.chartCtor(ctx, {
      type: 'doughnut',
      data,
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: chartLegendBottom(),
          tooltip: { enabled: false },
        },
      },
    });
  }

  selectDay(day: CalendarDay) {
    if (!day.date) return;
    this.applySelectedDay(day.date);
    this.focusedDate = day.date;
    this.cdr.detectChanges();
    if (window.matchMedia('(max-width: 1023px)').matches) {
      this.dayDetail?.nativeElement.scrollIntoView({ block: 'start' });
      this.dayHeading?.nativeElement.focus({ preventScroll: true });
    }
  }

  /** Scheduled occurrences are counted separately from F8's posted-only expense. */
  dayScheduled(day: CalendarDay): number {
    return day.scheduled ?? (day.date ? this.countedOccurrences.filter(row => row.date === day.date).length : 0);
  }

  private postedExpense(day: CalendarDay): number {
    return day.expense;
  }

  dayNet(day: CalendarDay): number {
    return day.income - this.postedExpense(day);
  }

  dayAriaLabel(day: CalendarDay): string {
    const parts: string[] = [];
    const expense = this.postedExpense(day);
    if (expense > 0) parts.push(`spent ${formatMoney(fromDollars(expense))}`);
    else if (expense < 0) parts.push(`refunded ${formatMoney(fromDollars(-expense))}`);
    if (day.income !== 0) parts.push(`income ${formatMoney(fromDollars(day.income))}`);
    const scheduled = this.dayScheduled(day);
    if (scheduled > 0) parts.push(plural(scheduled, 'scheduled bill'));
    if (!parts.length) parts.push('no activity');
    return `${formatDate(day.date, 'heading')}: ${parts.join(', ')}`;
  }

  private applySelectedDay(date: string) {
    this.selectedDate = date;
    this.selectedTransactions = this.transactions.filter(t => t.date === date);
    this.selectedPlans = this.countedOccurrences.filter(row => row.date === date);
    this.selectedIncomeOccurrences = this.cashflowSummary?.income_occurrences
      .filter(row => row.date === date && row.kind !== 'posted' && row.kind !== 'overlap') || [];
  }

  onDayKeydown(event: KeyboardEvent, day: CalendarDay) {
    if (!day.date) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      this.selectDay(day);
      return;
    }
    const move = (iso: string | null) => {
      if (iso) {
        event.preventDefault();
        this.focusDate(iso);
      }
    };
    switch (event.key) {
      case 'ArrowRight': move(this.shiftDate(day.date, 1)); break;
      case 'ArrowLeft': move(this.shiftDate(day.date, -1)); break;
      case 'ArrowDown': move(this.shiftDate(day.date, 7)); break;
      case 'ArrowUp': move(this.shiftDate(day.date, -7)); break;
      case 'Home': {
        const row = this.weeks.find(week => week.some(d => d.date === day.date)) ?? [];
        move(row.find(d => d.date)?.date ?? null);
        break;
      }
      case 'End': {
        const row = this.weeks.find(week => week.some(d => d.date === day.date)) ?? [];
        const real = row.filter(d => d.date);
        move(real[real.length - 1]?.date ?? null);
        break;
      }
    }
  }

  /** Arrow-key movement is by ISO date and clamps to the visible month. */
  private shiftDate(iso: string, days: number): string | null {
    const [year, month, date] = iso.split('-').map(Number);
    const next = new Date(year, month - 1, date + days);
    const out = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`;
    return out.startsWith(this.monthKey) ? out : null;
  }

  focusDate(iso: string) {
    this.focusedDate = iso;
    this.cdr.detectChanges();
    document.querySelector<HTMLElement>(`.calendar-grid [data-date="${iso}"]`)?.focus();
  }

  goToday() {
    this.focusedDate = null;
    this.currentDate = new Date();
    this.generateCalendar();
    const today = todayIsoDate();
    const day = this.daysInMonth.find(d => d.date === today);
    if (day) this.selectDay(day);
    else this.cdr.markForCheck();
  }

  prevMonth() {
    this.focusedDate = null;
    this.currentDate = new Date(this.currentDate.getFullYear(), this.currentDate.getMonth() - 1, 1);
    this.generateCalendar();
    this.selectedDate = null;
    this.selectedTransactions = [];
    this.selectedPlans = [];
    this.selectedIncomeOccurrences = [];
    this.cdr.markForCheck();
  }

  nextMonth() {
    this.focusedDate = null;
    this.currentDate = new Date(this.currentDate.getFullYear(), this.currentDate.getMonth() + 1, 1);
    this.generateCalendar();
    this.selectedDate = null;
    this.selectedTransactions = [];
    this.selectedPlans = [];
    this.selectedIncomeOccurrences = [];
    this.cdr.markForCheck();
  }

  getMonthName(): string {
    return formatDate(`${this.monthKey}-01`, 'month');
  }
}
