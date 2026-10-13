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
import { Subject, takeUntil } from 'rxjs';
import type { Chart as ChartInstance, ChartItem } from 'chart.js';
import { FinanceService } from '../services/finance.service';
import { Transaction } from '../models/transaction.model';
import { transactionEffects } from '../crypto/client-finance';
import { todayIsoDate } from '../utils/date.util';
import { spendingComparisonGroupKey, UNASSIGNED_ACCOUNT_FILTER } from '../utils/spending-review.util';
import { monthKeyFromDate, MonthSpendSummary, summarizeMonthSpend } from '../utils/spend-summary.util';
import {
  chartColorAt,
  chartLegendBottom,
  chartTooltipTheme,
} from '../../theme/chart-colors';
import {
  UiBadgeComponent,
  UiButtonComponent,
  UiCardComponent,
  UiEmptyStateComponent,
  UiPageHeaderComponent,
  UiIconComponent,
} from '../shared/ui';

interface CalendarDay {
  date: string;
  hasTransactions: boolean;
  expense: number;
  isToday?: boolean;
}

type ChartConstructor = new (item: ChartItem, config: unknown) => ChartInstance;

@Component({
  selector: 'app-calendar',
  standalone: true,
  imports: [
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
  @Input() embedded = false;
  readonly transactionEffects = transactionEffects;
  @ViewChild('categoryChart') categoryCanvas?: ElementRef<HTMLCanvasElement>;
  currentDate = new Date();
  transactions: Transaction[] = [];
  selectedDate: string | null = null;
  selectedTransactions: Transaction[] = [];
  daysInMonth: CalendarDay[] = [];
  weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
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
    this.financeService.transactions$.pipe(takeUntil(this.destroy$)).subscribe(data => {
      this.transactions = data;
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

  transactionActivityQuery(transactionId: number): Record<string, string | number> {
    const tx = this.transactions.find(row => row.id === transactionId);
    if (!tx) return { t: 'activity', v: 'spending', month: this.monthKey };
    return {
      t: 'activity',
      v: 'all',
      month: this.monthKey,
      date: tx.date,
      account: tx.bank_account_key || UNASSIGNED_ACCOUNT_FILTER,
      category: spendingComparisonGroupKey(tx, 'category'),
      merchant: spendingComparisonGroupKey(tx, 'merchant'),
      edit: tx.id,
    };
  }

  generateCalendar() {
    const year = this.currentDate.getFullYear();
    const month = this.currentDate.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const today = todayIsoDate();
    const spendByDay = new Map<string, number>();
    for (const tx of this.transactions) {
      const spending = transactionEffects(tx).spending;
      if (!spending) continue;
      spendByDay.set(tx.date, (spendByDay.get(tx.date) || 0) + spending);
    }

    this.daysInMonth = [];
    for (let i = 0; i < firstDay; i++) {
      this.daysInMonth.push({ date: '', hasTransactions: false, expense: 0 });
    }
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      this.daysInMonth.push({
        date: dateStr,
        hasTransactions: this.transactions.some(t => t.date === dateStr),
        expense: spendByDay.get(dateStr) || 0,
        isToday: dateStr === today,
      });
    }
    this.monthSummary = summarizeMonthSpend(this.transactions, this.monthKey);
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
          tooltip: {
            ...chartTooltipTheme(),
            callbacks: {
              label: (ctx: { raw: number; dataIndex: number }) => {
                const row = this.chartCategoryRows()[ctx.dataIndex];
                if (!row) return '';
                return `${row.label}: $${Number(ctx.raw).toLocaleString()} (${row.pct.toFixed(1)}%)`;
              },
            },
          },
        },
      },
    });
  }

  selectDay(day: CalendarDay) {
    if (!day.date) return;
    this.selectedDate = day.date;
    this.selectedTransactions = this.transactions.filter(t => t.date === day.date);
    this.cdr.markForCheck();
  }

  onDayKeydown(event: KeyboardEvent, day: CalendarDay, index: number) {
    if (!day.date) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      this.selectDay(day);
    }
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      this.focusDay(index + 1);
    }
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      this.focusDay(index - 1);
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.focusDay(index + 7);
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.focusDay(index - 7);
    }
  }

  private focusDay(index: number) {
    const buttons = document.querySelectorAll<HTMLButtonElement>('.calendar-grid .day-btn');
    const el = buttons[index];
    if (el) el.focus();
  }

  goToday() {
    this.currentDate = new Date();
    this.generateCalendar();
    const today = todayIsoDate();
    const day = this.daysInMonth.find(d => d.date === today);
    if (day) this.selectDay(day);
    else this.cdr.markForCheck();
  }

  prevMonth() {
    this.currentDate = new Date(this.currentDate.getFullYear(), this.currentDate.getMonth() - 1, 1);
    this.generateCalendar();
    this.selectedDate = null;
    this.selectedTransactions = [];
    this.cdr.markForCheck();
  }

  nextMonth() {
    this.currentDate = new Date(this.currentDate.getFullYear(), this.currentDate.getMonth() + 1, 1);
    this.generateCalendar();
    this.selectedDate = null;
    this.selectedTransactions = [];
    this.cdr.markForCheck();
  }

  getMonthName(): string {
    return this.currentDate.toLocaleString('default', { month: 'long', year: 'numeric' });
  }

  dayTotal(): number {
    return this.selectedTransactions.reduce(
      (sum, t) => sum + transactionEffects(t).income - transactionEffects(t).spending,
      0
    );
  }
}
