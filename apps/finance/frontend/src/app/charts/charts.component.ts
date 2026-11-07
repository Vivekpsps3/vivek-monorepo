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
import { formatDate, formatPercent } from '@vivek/browser';
import { Subject, debounceTime, takeUntil } from 'rxjs';
import type { Chart as ChartInstance, ChartItem } from 'chart.js';
import { UiCardComponent, UiEmptyStateComponent } from '@vivek/ui';
import {
  chartColorAt,
  chartCartesianScales,
  chartSuccessColor,
  chartDangerColor,
  chartAccentColor,
  chartSliceBorder,
} from '@vivek/ui';
import {
  NARROW_QUERY,
  chartCompactMoney,
  chartMoney,
  financeTooltip,
  isNarrow,
  monthTickLabel,
  prefersReducedMotion,
  readTablePref,
  shouldDrill,
  trimCashflowRange,
  withAlpha,
  writeTablePref,
} from '../utils/chart-options';
import { MoneyPipe } from '@vivek/ui';
type ChartConstructor = new (
  item: ChartItem,
  config: unknown
) => ChartInstance;

@Component({
  selector: 'app-charts',
  standalone: true,
  imports: [
    MoneyPipe, CommonModule, RouterLink, UiCardComponent, UiEmptyStateComponent],
  templateUrl: './charts.component.html',
  styleUrl: './charts.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChartsComponent implements OnInit, AfterViewInit, OnDestroy {
  formatShare(value: number | null | undefined): string {
    return formatPercent(value, 1);
  }
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

  tableOpen = { cashflow: readTablePref('cashflow', false), allocation: readTablePref('allocation', true) };
  hiddenSeries = [false, false, false];
  readonly cashflowSeries = [
    { key: 'income', label: 'Income' },
    { key: 'spending', label: 'Spending' },
    { key: 'net', label: 'Net' },
  ];
  readonly money = chartMoney;
  private lastTap: { key: string; at: number } | null = null;
  private narrowQuery: MediaQueryList | null = null;
  private onNarrowChange = () => this.render$.next();

  incomeTotal = 0;
  expenseTotal = 0;
  netCashflow = 0;
  monthlyRows: { month: string; label: string; tick: string; income: number; expense: number; net: number }[] = [];
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
    this.narrowQuery = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia(NARROW_QUERY)
      : null;
    this.narrowQuery?.addEventListener('change', this.onNarrowChange);

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
    this.narrowQuery?.removeEventListener('change', this.onNarrowChange);
    this.destroy$.next();
    this.destroy$.complete();
    this.incomeChart?.destroy();
    this.categoryChart?.destroy();
    this.portfolioChart?.destroy();
  }

  toggleTable(id: 'cashflow' | 'allocation'): void {
    this.tableOpen[id] = !this.tableOpen[id];
    writeTablePref(id, this.tableOpen[id]);
    this.cdr.markForCheck();
    this.render$.next();
    void this.schedulePaint();
  }

  toggleSeries(index: number): void {
    this.hiddenSeries[index] = !this.hiddenSeries[index];
    this.incomeChart?.setDatasetVisibility(index, !this.hiddenSeries[index]);
    this.incomeChart?.update();
    this.cdr.markForCheck();
  }

  onChartTap(chart: 'cashflow' | 'category', index: number, datasetIndex: number, event: { native?: Event | null }): void {
    const pointerType = (event.native as PointerEvent | null)?.pointerType ?? '';
    const key = `${chart}:${index}:${datasetIndex}`;
    const now = Date.now();
    if (!shouldDrill(this.lastTap, key, pointerType, now)) {
      this.lastTap = { key, at: now };
      return;
    }
    this.lastTap = null;
    if (chart === 'cashflow') {
      this.openMonthlyDrilldown(index, datasetIndex);
    } else {
      this.openCategoryDrilldown(index);
    }
  }

  get cashflowSummary(): string {
    const rows = this.monthlyRows;
    if (!rows.length) return '';
    const first = rows[0];
    const last = rows[rows.length - 1];
    const best = rows.reduce((top, row) => (row.net > top.net ? row : top), rows[0]);
    const sameYear = first.label.split(' ').pop() === last.label.split(' ').pop();
    const firstText = sameYear ? first.label.split(' ')[0] : monthTickLabel(first.month, true);
    const bestName = best.label.split(' ')[0];
    return `Monthly cashflow, ${firstText} to ${last.label}. Net highest in ${bestName}, ${chartMoney(best.net, 'always')}.`;
  }

  get categorySummary(): string {
    const top = this.categoryRows[0];
    if (!top) return '';
    return `Spending by category. Largest: ${top.label}, ${chartMoney(top.value)}. Select a category to open it in Activity.`;
  }

  get allocationSummary(): string {
    const top = this.allocationRows[0];
    if (!top) return '';
    return `Holdings mix. Largest: ${top.label}, ${this.formatShare(top.pct)}.`;
  }

  get singleCategory(): { label: string; value: number; pct: number | null } | null {
    return this.categoryRows.length === 1 ? this.categoryRows[0] : null;
  }

  get singleHolding(): { label: string; value: number; pct: number } | null {
    return this.allocationRows.length === 1 ? this.allocationRows[0] : null;
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
    void this.router.navigate(['/finance/spending'], {
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
    void this.router.navigate(['/finance/spending'], {
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
      ? trimCashflowRange(series).map((row, i) => ({
          month: row.month,
          label: formatDate(`${row.month}-01`, 'month'),
          tick: monthTickLabel(row.month, i === 0 || row.month.endsWith('-01')),
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
    if (!canvas || this.monthlyRows.length === 0 || this.tableOpen.cashflow) {
      this.incomeChart?.destroy();
      this.incomeChart = undefined;
      return;
    }
    const base = chartCartesianScales();
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
            order: 1,
            hidden: this.hiddenSeries[0],
          },
          {
            label: 'Spending',
            data: this.monthlyRows.map(r => r.expense),
            backgroundColor: withAlpha(chartDangerColor(), 0.8),
            borderRadius: 6,
            order: 1,
            hidden: this.hiddenSeries[1],
          },
          {
            type: 'line',
            label: 'Net',
            data: this.monthlyRows.map(r => r.net),
            borderColor: chartAccentColor(),
            backgroundColor: chartAccentColor(),
            tension: 0,
            pointRadius: 4,
            pointHoverRadius: 5,
            borderWidth: 2,
            order: 0,
            hidden: this.hiddenSeries[2],
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: prefersReducedMotion() ? false : undefined,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            ...financeTooltip(),
            callbacks: {
              title: (items: Array<{ dataIndex: number }>) =>
                items.length ? this.monthlyRows[items[0].dataIndex]?.label ?? '' : '',
              label: (item: { dataIndex: number; datasetIndex: number }) => {
                const row = this.monthlyRows[item.dataIndex];
                if (!row) return '';
                if (row.income === 0 && row.expense === 0) return 'No activity';
                if (item.datasetIndex === 0) return `Income ${chartMoney(row.income)}`;
                if (item.datasetIndex === 1) return `Spending ${chartMoney(row.expense)}`;
                return `Net ${chartMoney(row.net, 'always')}`;
              },
            },
            filter: (item: { dataIndex: number; datasetIndex: number }) => {
              const row = this.monthlyRows[item.dataIndex];
              if (row && row.income === 0 && row.expense === 0) return item.datasetIndex === 0;
              return true;
            },
          },
        },
        onClick: (event: { native?: Event | null }, active: Array<{ datasetIndex: number; index: number }>) => {
          const point = active[0];
          if (point) this.onChartTap('cashflow', point.index, point.datasetIndex, event);
        },
        scales: {
          x: {
            ...base.x,
            ticks: {
              ...base.x.ticks,
              maxTicksLimit: isNarrow() ? 4 : 12,
              autoSkip: true,
              callback: (_value: unknown, index: number) => this.monthlyRows[index]?.tick ?? '',
            },
          },
          y: {
            ...base.y,
            beginAtZero: this.monthlyRows.every(r => r.net >= 0),
            ticks: {
              ...base.y.ticks,
              callback: (value: unknown) => chartCompactMoney(Number(value)),
            },
          },
        },
      },
    });
  }

  private updateCategorySpending(Chart: ChartConstructor) {
    const canvas = this.categoryCanvas?.nativeElement;
    if (!canvas || this.categoryRows.length === 0 || this.singleCategory) {
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
          ...chartSliceBorder(),
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: prefersReducedMotion() ? false : undefined,
        interaction: { mode: 'nearest', intersect: true },
        ...(hasRefundEffects ? { indexAxis: 'y' } : {}),
        ...(hasRefundEffects ? { scales: chartCartesianScales() } : {}),
        plugins: {
          legend: { display: false },
          tooltip: {
            ...financeTooltip(),
            callbacks: {
              label: (item: { dataIndex: number }) => {
                const row = this.categoryRows[item.dataIndex];
                if (!row) return '';
                // Interim derivation until F8 lands categorySpend.totalPurchases:
                // gross purchases are the positive category totals.
                const totalPurchases = this.allCategoryRows.reduce((sum, r) => sum + Math.max(0, r.value), 0);
                const share = totalPurchases > 0 ? (row.value / totalPurchases) * 100 : null;
                return share == null
                  ? `${row.label} · ${chartMoney(row.value)}`
                  : `${row.label} · ${chartMoney(row.value)} · ${this.formatShare(share)} of purchases`;
              },
            },
          },
        },
        onClick: (event: { native?: Event | null }, active: Array<{ index: number }>) => {
          const point = active[0];
          if (point) this.onChartTap('category', point.index, 0, event);
        },
      },
    });
  }

  private updatePortfolio(Chart: ChartConstructor) {
    const canvas = this.portfolioCanvas?.nativeElement;
    if (!canvas || this.allocationRows.length === 0 || this.tableOpen.allocation || this.singleHolding) {
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
          ...chartSliceBorder(),
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: prefersReducedMotion() ? false : undefined,
        interaction: { mode: 'nearest', intersect: true },
        plugins: {
          legend: { display: false },
          tooltip: {
            ...financeTooltip(),
            callbacks: {
              label: (item: { dataIndex: number }) => {
                const row = this.allocationRows[item.dataIndex];
                return row ? `${row.label} · ${chartMoney(row.value)} · ${this.formatShare(row.pct)}` : '';
              },
            },
          },
        },
      },
    });
  }

}
