import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  Input,
  OnDestroy,
  OnInit,
  ElementRef,
  ViewChild,
  AfterViewInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { FinanceService } from '../services/finance.service';
import { FixedExpense, Holding, JobIncome, Subscription, Transaction } from '../models/transaction.model';
import { lastCalendarMonths, monthlyCashflowSeries, transactionEffects } from '../crypto/client-finance';
import { Subject, debounceTime, takeUntil } from 'rxjs';
import type { Chart as ChartInstance, ChartItem } from 'chart.js';
import { UiCardComponent, UiEmptyStateComponent } from '../shared/ui';
import {
  chartColorAt,
  chartCartesianScales,
  chartLegendBottom,
  chartSuccessColor,
  chartDangerColor,
  chartAccentColor,
} from '../../theme/chart-colors';
type ChartConstructor = new (
  item: ChartItem,
  config: unknown
) => ChartInstance;

@Component({
  selector: 'app-charts',
  standalone: true,
  imports: [CommonModule, RouterLink, UiCardComponent, UiEmptyStateComponent],
  templateUrl: './charts.component.html',
  styleUrl: './charts.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChartsComponent implements OnInit, AfterViewInit, OnDestroy {
  @Input() embedded = false;

  @ViewChild('incomeExpenseChart') incomeExpenseCanvas!: ElementRef<HTMLCanvasElement>;
  @ViewChild('categoryChart') categoryCanvas!: ElementRef<HTMLCanvasElement>;
  @ViewChild('portfolioChart') portfolioCanvas!: ElementRef<HTMLCanvasElement>;

  transactions: Transaction[] = [];
  holdings: Holding[] = [];
  jobIncomes: JobIncome[] = [];
  fixedExpenses: FixedExpense[] = [];
  subscriptions: Subscription[] = [];
  loading = true;
  collapsedCategories = true;

  sectionOpen = { cashflow: true, category: true, allocation: true };

  incomeTotal = 0;
  expenseTotal = 0;
  netCashflow = 0;
  monthlyRows: { month: string; label: string; income: number; expense: number; net: number }[] = [];
  allCategoryRows: { label: string; value: number; pct: number | null }[] = [];
  allocationRows: { label: string; value: number; pct: number; companyName?: string | null }[] = [];

  private incomeChart?: ChartInstance;
  private categoryChart?: ChartInstance;
  private portfolioChart?: ChartInstance;
  private render$ = new Subject<void>();
  private destroy$ = new Subject<void>();
  private viewReady = false;
  private chartCtor: ChartConstructor | null = null;
  chartDimmed = false;

  private txOverride: Transaction[] | null = null;

  get hasTxData(): boolean {
    const txs = this.txOverride ?? this.transactions;
    return txs.length > 0;
  }

  @Input() set overrideTransactions(value: Transaction[] | undefined | null) {
    this.txOverride = value ?? null;
    this.computeDerived();
    this.render$.next();
  }

  @Input() set dataReady(value: boolean) {
    if (!this.embedded) {
      return;
    }
    this.loading = !value;
    if (value) {
      this.render$.next();
    }
    this.cdr.markForCheck();
  }

  constructor(
    private financeService: FinanceService,
    private cdr: ChangeDetectorRef,
    private router: Router,
  ) {}

  ngOnInit() {
    this.render$
      .pipe(debounceTime(120), takeUntil(this.destroy$))
      .subscribe(() => void this.schedulePaint());

    this.financeService.holdings$.pipe(takeUntil(this.destroy$)).subscribe(data => {
      this.holdings = data;
      this.computeDerived();
      this.render$.next();
      this.cdr.markForCheck();
    });
    this.financeService.jobIncomes$.pipe(takeUntil(this.destroy$)).subscribe(data => {
      this.jobIncomes = data;
      this.computeDerived();
      this.render$.next();
      this.cdr.markForCheck();
    });
    this.financeService.fixedExpenses$.pipe(takeUntil(this.destroy$)).subscribe(data => {
      this.fixedExpenses = data;
      this.computeDerived();
      this.render$.next();
      this.cdr.markForCheck();
    });
    this.financeService.subscriptions$.pipe(takeUntil(this.destroy$)).subscribe(data => {
      this.subscriptions = data;
      this.computeDerived();
      this.render$.next();
      this.cdr.markForCheck();
    });

    // Chart totals are ledger-wide, independent of the currently visible table page.
    this.financeService.getAllTransactions().pipe(takeUntil(this.destroy$)).subscribe(data => {
      if (this.txOverride == null) {
        this.transactions = data;
        this.computeDerived();
        this.render$.next();
        this.cdr.markForCheck();
      }
    });

    if (!this.embedded) {
      this.financeService.getHoldings().pipe(takeUntil(this.destroy$)).subscribe();
      this.financeService.getJobIncomes().pipe(takeUntil(this.destroy$)).subscribe();
      this.financeService.getFixedExpenses().pipe(takeUntil(this.destroy$)).subscribe();
      this.financeService.getSubscriptions().pipe(takeUntil(this.destroy$)).subscribe();
      this.loading = false;
      this.cdr.markForCheck();
    }
  }

  ngAfterViewInit() {
    this.viewReady = true;
    void this.schedulePaint();
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
    this.incomeChart?.destroy();
    this.categoryChart?.destroy();
    this.portfolioChart?.destroy();
  }

  private async ensureChartCtor(): Promise<ChartConstructor> {
    if (!this.chartCtor) {
      const mod = await import('chart.js/auto');
      this.chartCtor = mod.default as ChartConstructor;
    }
    return this.chartCtor;
  }

  private schedulePaint(): void {
    if (this.embedded && this.loading) {
      return;
    }
    void this.paintCharts();
  }

  get categoryRows(): { label: string; value: number; pct: number | null; synthetic?: boolean }[] {
    if (!this.collapsedCategories || this.allCategoryRows.length <= 6) {
      return this.allCategoryRows;
    }
    const head = this.allCategoryRows.slice(0, 6);
    const tail = this.allCategoryRows.slice(6);
    const otherValue = tail.reduce((sum, row) => sum + row.value, 0);
    const total = this.allCategoryRows.reduce((sum, row) => sum + row.value, 0);
    return [
      ...head,
      {
        label: 'Other',
        value: otherValue,
        pct: total > 0 ? (otherValue / total) * 100 : null,
        synthetic: true,
      },
    ];
  }

  get canCollapseCategories(): boolean {
    return this.allCategoryRows.length > 6;
  }

  toggleCategories(): void {
    this.collapsedCategories = !this.collapsedCategories;
    this.render$.next();
    this.cdr.markForCheck();
  }

  toggleSection(name: keyof ChartsComponent['sectionOpen']): void {
    this.sectionOpen[name] = !this.sectionOpen[name];
    this.cdr.markForCheck();
    if (this.sectionOpen[name]) {
      this.render$.next();
    }
  }

  openMonthlyDrilldown(index: number, datasetIndex = 0): void {
    const row = this.monthlyRows[index];
    if (!row) return;
    const view = datasetIndex === 0 ? 'income' : datasetIndex === 1 ? 'spending' : 'all';
    void this.router.navigate(['/spending'], {
      queryParams: { t: 'activity', v: view, month: row.month },
    });
  }

  openCategoryDrilldown(index: number): void {
    const row = this.categoryRows[index];
    if (!row) return;
    if (row.synthetic) {
      this.collapsedCategories = false;
      this.render$.next();
      this.cdr.markForCheck();
      return;
    }
    void this.router.navigate(['/spending'], {
      queryParams: { t: 'activity', v: 'spending', month: 'all', category: row.label },
    });
  }

  monthlyRowQuery(row: { month: string }, datasetIndex = 0): { [key: string]: string } {
    return { t: 'activity', v: datasetIndex === 0 ? 'income' : datasetIndex === 1 ? 'spending' : 'all', month: row.month };
  }

  categoryRowQuery(row: { label: string; synthetic?: boolean }): { [key: string]: string } | null {
    return row.synthetic ? null : { t: 'activity', v: 'spending', month: 'all', category: row.label };
  }

  private computeDerived() {
    const txs = this.txOverride ?? this.transactions;
    const series = monthlyCashflowSeries(
      lastCalendarMonths(12),
      txs,
      this.jobIncomes,
      this.fixedExpenses,
      this.subscriptions
    );
    this.incomeTotal = series.reduce((sum, row) => sum + row.income, 0);
    this.expenseTotal = series.reduce((sum, row) => sum + row.expense, 0);
    this.netCashflow = this.incomeTotal - this.expenseTotal;
    this.monthlyRows = series.some(row => row.income || row.expense)
      ? series.map(row => ({
          month: row.month,
          label: this.formatMonth(row.month),
          income: row.income,
          expense: row.expense,
          net: row.net,
        }))
      : [];

    const byCategory = new Map<string, number>();
    for (const tx of txs) {
      const effect = transactionEffects(tx).spending;
      if (!effect) continue;
      byCategory.set(tx.category, (byCategory.get(tx.category) || 0) + effect);
    }
    const categoryTotal = [...byCategory.values()].reduce((s, v) => s + v, 0);
    this.allCategoryRows = [...byCategory.entries()]
      .filter(([, value]) => value !== 0)
      .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
      .map(([label, value]) => ({
        label,
        value,
        pct: categoryTotal > 0 ? (value / categoryTotal) * 100 : null,
      }));

    const totalVal = this.holdings.reduce((s, h) => s + (h.value || 0), 0);
    this.allocationRows = [...this.holdings]
      .sort((a, b) => (b.value || 0) - (a.value || 0))
      .map(h => ({
        label: h.symbol,
        value: h.value || 0,
        pct: totalVal ? ((h.value || 0) / totalVal) * 100 : 0,
        companyName: h.company_name || null,
      }));
  }

  private async paintCharts() {
    if (!this.viewReady) {
      return;
    }
    this.chartDimmed = true;
    this.cdr.markForCheck();
    const Chart = await this.ensureChartCtor();
    this.updateIncomeExpense(Chart);
    this.updateCategorySpending(Chart);
    this.updatePortfolio(Chart);
    this.chartDimmed = false;
    this.cdr.markForCheck();
  }

  private chartColors(n: number): string[] {
    return Array.from({ length: n }, (_, i) => chartColorAt(i));
  }

  private upsertChart(
    Chart: ChartConstructor,
    existing: ChartInstance | undefined,
    canvas: HTMLCanvasElement | undefined,
    config: { type: string; data: object; options?: object }
  ): ChartInstance | undefined {
    if (!canvas) return existing;
    const ctx = canvas.getContext('2d');
    if (!ctx) return existing;
    if (existing && (existing.config as { type?: string }).type !== config.type) {
      existing.destroy();
      existing = undefined;
    }
    if (existing) {
      existing.data = config.data as typeof existing.data;
      if (config.options) {
        existing.options = config.options as typeof existing.options;
      }
      existing.update('none');
      return existing;
    }
    return new Chart(ctx, config as never);
  }

  private updateIncomeExpense(Chart: ChartConstructor) {
    const canvas = this.incomeExpenseCanvas?.nativeElement;
    if (!canvas || this.monthlyRows.length === 0) {
      this.incomeChart?.destroy();
      this.incomeChart = undefined;
      return;
    }
    this.incomeChart = this.upsertChart(Chart, this.incomeChart, canvas, {
      type: 'bar',
      data: {
        labels: this.monthlyRows.map(r => r.label),
        datasets: [
          {
            label: 'Income',
            data: this.monthlyRows.map(r => r.income),
            backgroundColor: chartSuccessColor(),
            borderRadius: 6,
          },
          {
            label: 'Spending',
            data: this.monthlyRows.map(r => r.expense),
            backgroundColor: chartDangerColor(),
            borderRadius: 6,
          },
          {
            type: 'line',
            label: 'Net cashflow',
            data: this.monthlyRows.map(r => r.net),
            borderColor: chartAccentColor(),
            backgroundColor: chartAccentColor(),
            tension: 0.25,
            pointRadius: 3,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: chartLegendBottom(),
          tooltip: { enabled: false },
        },
        onClick: (_event: unknown, active: Array<{ datasetIndex: number; index: number }>) => {
          const point = active[0];
          if (point) this.openMonthlyDrilldown(point.index, point.datasetIndex);
        },
        scales: chartCartesianScales(),
      },
    });
  }

  private updateCategorySpending(Chart: ChartConstructor) {
    const canvas = this.categoryCanvas?.nativeElement;
    if (!canvas || this.categoryRows.length === 0) {
      this.categoryChart?.destroy();
      this.categoryChart = undefined;
      return;
    }
    const hasRefundEffects = this.categoryRows.some(row => row.value < 0);
    this.categoryChart = this.upsertChart(Chart, this.categoryChart, canvas, {
      type: hasRefundEffects ? 'bar' : 'doughnut',
      data: {
        labels: this.categoryRows.map(r => r.label),
        datasets: [{
          data: this.categoryRows.map(r => r.value),
          backgroundColor: hasRefundEffects
            ? this.categoryRows.map(row => row.value < 0 ? chartDangerColor() : chartAccentColor())
            : this.chartColors(this.categoryRows.length),
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        ...(hasRefundEffects ? { indexAxis: 'y' } : {}),
        ...(hasRefundEffects ? { scales: chartCartesianScales() } : {}),
        plugins: {
          legend: chartLegendBottom(),
          tooltip: { enabled: false },
        },
        onClick: (_event: unknown, active: Array<{ index: number }>) => {
          const point = active[0];
          if (point) this.openCategoryDrilldown(point.index);
        },
      },
    });
  }

  private formatMonth(value: string): string {
    const [year, month] = value.split('-').map(Number);
    return new Date(year, month - 1, 1).toLocaleString(undefined, {
      month: 'short',
      year: '2-digit',
    });
  }

  private updatePortfolio(Chart: ChartConstructor) {
    const canvas = this.portfolioCanvas?.nativeElement;
    if (!canvas || this.allocationRows.length === 0) {
      this.portfolioChart?.destroy();
      this.portfolioChart = undefined;
      return;
    }
    this.portfolioChart = this.upsertChart(Chart, this.portfolioChart, canvas, {
      type: 'doughnut',
      data: {
        labels: this.allocationRows.map(r => r.label),
        datasets: [{
          data: this.allocationRows.map(r => r.value),
          backgroundColor: this.chartColors(this.allocationRows.length),
        }],
      },
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

}
