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
import { FormsModule } from '@angular/forms';
import { formatCompactMoney as formatCompactCents, formatMoney, fromDollars } from '@vivek/browser';
import { Subject, takeUntil } from 'rxjs';
import { FinanceService } from '../services/finance.service';
import { Holding, NetWorth } from '../models/transaction.model';
import {
  UiButtonComponent,
  UiCardComponent,
  UiDataTableComponent,
  UiEmptyStateComponent,
  UiIconComponent,
  UiPageHeaderComponent,
} from '@vivek/ui';
import { totalPortfolioValue } from '../utils/portfolio.util';
import type { Chart as ChartInstance, ChartItem } from 'chart.js';
import {
  chartAccentColor,
  chartCartesianScales,
  chartSuccessColor,
  chartTextMuted,
  chartTooltipTheme,
} from '@vivek/ui';
import { MoneyPipe } from '@vivek/ui';

interface PeriodRow {
  label: string;
  amount: number;
}

interface ProjectionPoint {
  year: number;
  value: number;
  realValue: number;
}

interface ProjectionMilestone extends ProjectionPoint {
  nominalPercent: number;
  realPercent: number;
}

interface ScenarioRow {
  label: string;
  rate: number;
  value: number;
  monthlyIncome: number;
}

type ChartConstructor = new (
  item: ChartItem,
  config: unknown
) => ChartInstance;

@Component({
  selector: 'app-investment-insights',
  standalone: true,
  imports: [
    MoneyPipe,
    CommonModule,
    FormsModule,
    UiPageHeaderComponent,
    UiButtonComponent,
    UiCardComponent,
    UiDataTableComponent,
    UiEmptyStateComponent,
    UiIconComponent,
  ],
  templateUrl: './investment-insights.component.html',
  styleUrl: './investment-insights.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InvestmentInsightsComponent implements OnInit, AfterViewInit, OnDestroy {
  @Input() embedded = false;
  private _projectionChartCanvas?: ElementRef<HTMLCanvasElement>;

  @ViewChild('growthInput') growthInput?: ElementRef<HTMLInputElement>;

  @ViewChild('projectionChart')
  set projectionChartCanvas(canvas: ElementRef<HTMLCanvasElement> | undefined) {
    this._projectionChartCanvas = canvas;
    if (canvas) void this.renderProjectionChart();
  }

  get projectionChartCanvas(): ElementRef<HTMLCanvasElement> | undefined {
    return this._projectionChartCanvas;
  }

  netWorth: NetWorth | null = null;
  holdings: Holding[] = [];
  annualGrowthRate = 7;
  withdrawalRate = 4;
  inflationRate = 3;
  monthlyContribution = 0;
  monthlyContributionIncrease = 0;
  projectionYears = 30;
  loading = true;

  private destroy$ = new Subject<void>();
  private chartCtor: ChartConstructor | null = null;
  private projectionChart?: ChartInstance;
  private viewReady = false;

  constructor(
    private financeService: FinanceService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.tableOpen = readTablePref();
    this.financeService.netWorth$.pipe(takeUntil(this.destroy$)).subscribe(data => {
      this.netWorth = data;
      void this.renderProjectionChart();
      this.cdr.markForCheck();
    });
    this.financeService.holdings$.pipe(takeUntil(this.destroy$)).subscribe(data => {
      this.holdings = data;
      void this.renderProjectionChart();
      this.cdr.markForCheck();
    });

    this.financeService.getNetWorth().pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.loading = false;
        void this.renderProjectionChart();
        this.cdr.markForCheck();
      },
      error: () => {
        this.loading = false;
        this.cdr.markForCheck();
      },
    });
    this.financeService.getHoldings(false).pipe(takeUntil(this.destroy$)).subscribe();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.projectionChart?.destroy();
  }

  ngAfterViewInit(): void {
    this.viewReady = true;
    void this.renderProjectionChart();
  }

  get portfolioValue(): number {
    return this.netWorth?.portfolio ?? totalPortfolioValue(this.holdings);
  }

  get dailyGrowth(): number {
    return this.portfolioValue * (this.annualGrowthRate / 100) / 365.25;
  }

  get growthRows(): PeriodRow[] {
    return [
      { label: 'Daily', amount: this.dailyGrowth },
      { label: 'Weekly', amount: this.portfolioValue * (this.annualGrowthRate / 100) / 52 },
      { label: 'Monthly', amount: this.portfolioValue * (this.annualGrowthRate / 100) / 12 },
      { label: 'Yearly', amount: this.portfolioValue * (this.annualGrowthRate / 100) },
    ];
  }

  get ruleOfFourRows(): PeriodRow[] {
    const annual = this.portfolioValue * (this.withdrawalRate / 100);
    return [
      { label: 'Daily', amount: annual / 365.25 },
      { label: 'Weekly', amount: annual / 52 },
      { label: 'Monthly', amount: annual / 12 },
      { label: 'Yearly', amount: annual },
    ];
  }

  get projectedValue(): number {
    return this.projection.at(-1)?.value ?? this.portfolioValue;
  }

  get projectedRealValue(): number {
    return this.projection.at(-1)?.realValue ?? this.portfolioValue;
  }

  // ---- F20: answer copy, presets, legend, yearly table ----

  readonly growthOptions: readonly number[] = [5, 7, 10, 12];

  tableOpen = false;
  readonly hiddenSeries = new Set<string>();

  get answerTitle(): string {
    const approx = formatMoney(fromDollars(this.projectedValue), { style: 'whole', approx: true });
    return `${approx.charAt(0).toUpperCase()}${approx.slice(1)} in ${this.projectionYears} years`;
  }

  get answerDetail(): string {
    const rate = Number(this.annualGrowthRate.toFixed(2));
    return `Starting from ${formatMoney(fromDollars(this.portfolioValue))} · ${rate}% a year · ${formatMoney(fromDollars(this.monthlyContribution))} a month`;
  }

  get isCustomGrowth(): boolean {
    return !this.growthOptions.includes(this.annualGrowthRate);
  }

  onGrowthOption(value: string): void {
    if (value === 'custom') {
      this.selectCustomGrowth();
      return;
    }
    this.setGrowthPreset(Number(value));
  }

  selectCustomGrowth(): void {
    this.growthInput?.nativeElement.focus();
    this.growthInput?.nativeElement.select();
  }

  get yearRows(): { year: number; value: number; realValue: number; contributions: number }[] {
    return this.projection
      .filter(point => point.year > 0)
      .map(point => ({
        year: point.year,
        value: point.value,
        realValue: point.realValue,
        contributions: this.portfolioValue + this.monthlyContribution * 12 * point.year,
      }));
  }

  get projectionSummary(): string {
    const whole = (value: number): string => formatMoney(fromDollars(value), { style: 'whole' });
    return `In ${this.projectionYears} years: projected ${whole(this.projectedValue)} · ${whole(this.projectedRealValue)} in today's dollars · ${whole(this.projectedMonthlyWithdrawalIncome)} a month future income`;
  }

  toggleTable(): void {
    this.tableOpen = !this.tableOpen;
    writeTablePref(this.tableOpen);
    this.cdr.markForCheck();
  }

  /** Legend mirrors the chart datasets (the chart.js legend is off). */
  get legendItems(): { label: string; color: string; dash: number[]; hidden: boolean }[] {
    const items = [
      { label: 'Projected value', color: chartAccentColor(), dash: [] as number[] },
      { label: "In today's dollars", color: chartTextMuted(), dash: [6, 4] },
    ];
    if (this.monthlyContribution > 0) {
      items.push({ label: 'Contributions only', color: warningColor(), dash: [6, 6] });
    }
    if (this.monthlyContributionIncrease > 0) {
      items.push({ label: 'With higher contribution', color: chartSuccessColor(), dash: [3, 4] });
    }
    return items.map(item => ({ ...item, hidden: this.hiddenSeries.has(item.label) }));
  }

  toggleSeries(label: string): void {
    if (this.hiddenSeries.has(label)) this.hiddenSeries.delete(label);
    else this.hiddenSeries.add(label);
    void this.renderProjectionChart();
    this.cdr.markForCheck();
  }

  get scenarioMonthlyContribution(): number {
    return this.monthlyContribution + this.monthlyContributionIncrease;
  }

  get scenarioProjectedValue(): number {
    return this.projectValueAtContribution(this.scenarioMonthlyContribution, this.annualGrowthRate);
  }

  get contributionScenarioDifference(): number {
    return this.scenarioProjectedValue - this.projectedValue;
  }

  get totalContributions(): number {
    return this.monthlyContribution * 12 * this.projectionYears;
  }

  get projectedGrowthOnly(): number {
    return Math.max(this.projectedValue - this.portfolioValue - this.totalContributions, 0);
  }

  get yearsToDouble(): number | null {
    if (this.annualGrowthRate <= 0) return null;
    return 72 / this.annualGrowthRate;
  }

  get nominalAnnualIncome(): number {
    return this.portfolioValue * (this.withdrawalRate / 100);
  }

  get annualExpectedGrowth(): number {
    return this.portfolioValue * (this.annualGrowthRate / 100);
  }

  get monthlyExpectedGrowth(): number {
    return this.annualExpectedGrowth / 12;
  }

  get monthlyWithdrawalIncome(): number {
    return this.nominalAnnualIncome / 12;
  }

  get projectedMonthlyWithdrawalIncome(): number {
    return (this.projectedValue * (this.withdrawalRate / 100)) / 12;
  }

  get projectedRealMonthlyWithdrawalIncome(): number {
    return (this.projectedRealValue * (this.withdrawalRate / 100)) / 12;
  }

  get contributionShareOfFinal(): number {
    if (this.projectedValue <= 0) return 0;
    return (this.totalContributions / this.projectedValue) * 100;
  }

  get growthShareOfFinal(): number {
    if (this.projectedValue <= 0) return 0;
    return (this.projectedGrowthOnly / this.projectedValue) * 100;
  }

  get nextMillionGap(): number {
    const nextMillion = Math.ceil(this.portfolioValue / 1_000_000) * 1_000_000;
    return Math.max(nextMillion - this.portfolioValue, 0);
  }

  get projection(): ProjectionPoint[] {
    const points: ProjectionPoint[] = [];
    const annualRate = this.annualGrowthRate / 100;
    const monthlyRate = annualRate / 12;
    const inflation = this.inflationRate / 100;
    let value = this.portfolioValue;

    for (let year = 0; year <= this.projectionYears; year += 1) {
      if (year > 0) {
        for (let month = 0; month < 12; month += 1) {
          value = value * (1 + monthlyRate) + this.monthlyContribution;
        }
      }
      points.push({
        year,
        value,
        realValue: value / Math.pow(1 + inflation, year),
      });
    }
    return points;
  }

  get projectionMilestones(): ProjectionMilestone[] {
    const wanted = new Set(
      [0, 5, 10, 15, 20, 25, this.projectionYears].filter(year => year <= this.projectionYears)
    );
    const max = Math.max(...this.projection.map(point => point.value), 1);
    return this.projection
      .filter(point => wanted.has(point.year))
      .map(point => ({
        ...point,
        nominalPercent: Math.max((point.value / max) * 100, 2),
        realPercent: Math.max((point.realValue / max) * 100, 2),
      }));
  }

  get milestoneRows(): ProjectionPoint[] {
    return this.projectionMilestones.map(({ year, value, realValue }) => ({ year, value, realValue }));
  }

  get scenarioRows(): ScenarioRow[] {
    return [6, 8, 10, 12].map(rate => {
      const value = this.projectValueAtRate(rate);
      return {
        label: `${rate}% growth`,
        rate,
        value,
        monthlyIncome: (value * (this.withdrawalRate / 100)) / 12,
      };
    });
  }

  setGrowthPreset(rate: number): void {
    this.annualGrowthRate = rate;
    this.onAssumptionChange();
  }

  resetAssumptions(): void {
    this.annualGrowthRate = 7;
    this.withdrawalRate = 4;
    this.inflationRate = 3;
    this.monthlyContribution = 0;
    this.monthlyContributionIncrease = 0;
    this.projectionYears = 30;
    this.onAssumptionChange();
  }

  onAssumptionChange(): void {
    this.normalizeAssumptions();
    void this.renderProjectionChart();
    this.cdr.markForCheck();
  }

  private projectValueAtRate(rate: number): number {
    return this.projectValueAtContribution(this.monthlyContribution, rate);
  }

  private projectValueAtContribution(monthlyContribution: number, rate: number): number {
    let value = this.portfolioValue;
    const monthlyRate = rate / 100 / 12;
    for (let month = 0; month < this.projectionYears * 12; month += 1) {
      value = value * (1 + monthlyRate) + monthlyContribution;
    }
    return value;
  }

  private get scenarioProjection(): ProjectionPoint[] {
    const points: ProjectionPoint[] = [];
    const monthlyRate = (this.annualGrowthRate / 100) / 12;
    let value = this.portfolioValue;
    for (let year = 0; year <= this.projectionYears; year += 1) {
      if (year > 0) {
        for (let month = 0; month < 12; month += 1) {
          value = value * (1 + monthlyRate) + this.scenarioMonthlyContribution;
        }
      }
      points.push({
        year,
        value,
        realValue: value / Math.pow(1 + this.inflationRate / 100, year),
      });
    }
    return points;
  }

  private normalizeAssumptions(): void {
    this.annualGrowthRate = this.clampNumber(this.annualGrowthRate, -20, 30, 7);
    this.withdrawalRate = this.clampNumber(this.withdrawalRate, 0, 12, 4);
    this.inflationRate = this.clampNumber(this.inflationRate, 0, 15, 3);
    this.monthlyContribution = this.clampNumber(this.monthlyContribution, 0, 1_000_000, 0);
    this.monthlyContributionIncrease = this.clampNumber(this.monthlyContributionIncrease, 0, 1_000_000, 0);
    this.projectionYears = Math.round(this.clampNumber(this.projectionYears, 1, 60, 30));
  }

  private clampNumber(value: number, min: number, max: number, fallback: number): number {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, n));
  }

  private async ensureChartCtor(): Promise<ChartConstructor> {
    if (!this.chartCtor) {
      const mod = await import('chart.js/auto');
      this.chartCtor = mod.default as ChartConstructor;
    }
    return this.chartCtor;
  }

  private async renderProjectionChart(): Promise<void> {
    if (!this.viewReady || !this.projectionChartCanvas?.nativeElement || this.portfolioValue <= 0) {
      return;
    }
    const Chart = await this.ensureChartCtor();
    const canvas = this.projectionChartCanvas.nativeElement;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const contributionOnly = this.projection.map(point => ({
      year: point.year,
      value: this.portfolioValue + this.monthlyContribution * 12 * point.year,
    }));
    const labels = this.projection.map(point => `${point.year}`);
    const compact = (value: number) => this.formatCompactMoney(value);
    const hidden = (label: string): boolean => this.hiddenSeries.has(label);

    const datasets = [
      {
        label: 'Projected value',
        data: this.projection.map(point => point.value),
        borderColor: chartAccentColor(),
        backgroundColor: chartAccentColor(),
        pointRadius: 0,
        pointHoverRadius: 4,
        borderWidth: 2,
        tension: 0.28,
        hidden: hidden('Projected value'),
      },
      {
        label: "In today's dollars",
        data: this.projection.map(point => point.realValue),
        borderColor: chartTextMuted(),
        backgroundColor: chartTextMuted(),
        pointRadius: 0,
        pointHoverRadius: 4,
        borderDash: [6, 4],
        borderWidth: 2,
        tension: 0.28,
        hidden: hidden("In today's dollars"),
      },
      ...(this.monthlyContribution > 0
        ? [
            {
              label: 'Contributions only',
              data: contributionOnly.map(point => point.value),
              borderColor: warningColor(),
              backgroundColor: warningColor(),
              pointRadius: 0,
              pointHoverRadius: 4,
              borderDash: [6, 6],
              borderWidth: 2,
              tension: 0,
              hidden: hidden('Contributions only'),
            },
          ]
        : []),
      ...(this.monthlyContributionIncrease > 0
        ? [{
            label: 'With higher contribution',
            data: this.scenarioProjection.map(point => point.value),
            borderColor: chartSuccessColor(),
            backgroundColor: chartSuccessColor(),
            pointRadius: 0,
            pointHoverRadius: 4,
            borderDash: [3, 4],
            borderWidth: 2,
            tension: 0.28,
            hidden: hidden('With higher contribution'),
          }]
        : []),
    ];

    const config = {
      type: 'line',
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: prefersReducedMotion() ? (false as const) : undefined,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          // F20: the HTML legend beside the chart replaces the chart.js one.
          legend: { display: false },
          // F11 seam: F11's `financeTooltip` spread lands with
          // utils/chart-options.ts; until then the same theme + callbacks
          // are inlined here.
          tooltip: {
            ...chartTooltipTheme(),
            callbacks: {
              title: (items: { label?: string }[]) => `Year ${items[0]?.label ?? ''}`,
              label: (item: { dataset: { label?: string }; parsed: { y: number | null } }) =>
                `${item.dataset.label ?? ''} ${formatMoney(fromDollars(Number(item.parsed.y ?? 0)), { style: 'whole', approx: true })}`,
            },
          },
        },
        scales: {
          ...chartCartesianScales(),
          y: {
            ...chartCartesianScales().y,
            ticks: {
              ...chartCartesianScales().y.ticks,
              callback: (value: string | number) => compact(Number(value)),
              maxTicksLimit: isNarrowViewport() ? 4 : 8,
            },
          },
          x: {
            ...chartCartesianScales().x,
            ticks: {
              ...chartCartesianScales().x.ticks,
              maxTicksLimit: 8,
              maxRotation: 0,
            },
          },
        },
      },
    };

    if (this.projectionChart) {
      this.projectionChart.data = config.data as typeof this.projectionChart.data;
      this.projectionChart.options = config.options as typeof this.projectionChart.options;
      this.projectionChart.update('none');
      return;
    }
    this.projectionChart = new Chart(ctx, config as never);
  }

  private formatCompactMoney(value: number): string {
    return formatCompactCents(fromDollars(value));
  }
}

// F11 seam: these mirror F11's utils/chart-options.ts helpers (same
// localStorage contract) until that file lands on main.
/** F11's chart-table preference key/format: '1' = table open, '0' = closed. */
const TABLE_PREF_KEY = 'finance.chartTable.projection';
const NARROW_QUERY = '(max-width: 640px)';

function readTablePref(): boolean {
  try {
    return localStorage.getItem(TABLE_PREF_KEY) === '1';
  } catch {
    return false;
  }
}

function writeTablePref(open: boolean): void {
  try {
    localStorage.setItem(TABLE_PREF_KEY, open ? '1' : '0');
  } catch {
    // Preference persistence is best-effort.
  }
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;
}

function isNarrowViewport(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia(NARROW_QUERY).matches
    : false;
}

/** --warning has no chart-theme export yet; read the token like chart-theme does. */
function warningColor(): string {
  if (typeof document === 'undefined') return '#f59e0b';
  const value = getComputedStyle(document.documentElement).getPropertyValue('--warning').trim();
  return value || '#f59e0b';
}
