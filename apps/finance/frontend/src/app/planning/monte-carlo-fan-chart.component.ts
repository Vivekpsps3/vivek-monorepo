import {
  AfterViewInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  inject,
  Input,
  OnChanges,
  OnDestroy,
  SimpleChanges,
  ViewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import type { Chart as ChartInstance, ChartItem } from 'chart.js';
import {
  chartAccentColor,
  chartCartesianScales,
  chartColorAt,
  chartLegendBottom,
  chartSuccessColor,
} from '@vivek/ui';
import { PlanningCheckpointResult } from '../models/planning.model';

export interface McChartData {
  years: number[];
  percentiles: Record<string, number[]>;
  fanPaths?: number[][];
}

type ChartCtor = new (item: ChartItem, config: unknown) => ChartInstance;

const HOVER_PERCENTILES: { key: string; label: string }[] = [
  { key: 'p10', label: '10th percentile' },
  { key: 'p25', label: '25th percentile' },
  { key: 'p50', label: 'Median' },
  { key: 'p75', label: '75th percentile' },
  { key: 'p90', label: '90th percentile' },
];

type McHoverSnapshot = {
  year: number;
  yearLabel: string;
  dataIndex: number;
  percentiles: { label: string; formatted: string }[];
  samplePath: {
    label: string;
    value: number;
    formatted: string;
    datasetIndex: number;
  } | null;
  goal?: { label: string; formatted: string };
};

type McDisplayRow = {
  label: string;
  formatted: string;
  variant: 'sample' | 'median' | 'default' | 'goal';
};

@Component({
  selector: 'app-monte-carlo-fan-chart',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="mc-chart-panel">
      <div class="mc-chart-hover" [class.mc-chart-hover--empty]="!hoverSnapshot" aria-live="polite">
        @if (hoverSnapshot) {
          <div class="mc-chart-hover__head">{{ hoverSnapshot.yearLabel }}</div>
          <dl class="mc-chart-hover__grid">
            @for (row of displayRows; track row.label) {
              <div
                class="mc-chart-hover__row"
                [class.mc-chart-hover__row--sample]="row.variant === 'sample'"
                [class.mc-chart-hover__row--median]="row.variant === 'median'"
                [class.mc-chart-hover__row--goal]="row.variant === 'goal'">
                <dt>{{ row.label }}</dt>
                <dd>{{ row.formatted }}</dd>
              </div>
            }
          </dl>
        } @else {
          <span class="mc-chart-hover__hint">Tap the chart or use Previous year and Next year. The numbers for that year stay in this list.</span>
        }
      </div>
      <div class="mc-year-controls" role="group" aria-label="Inspect simulation year">
        <button type="button" class="mc-year-btn" (click)="selectAdjacentYear(-1)" [disabled]="!canStepYear(-1)">Previous year</button>
        <button type="button" class="mc-year-btn" (click)="selectAdjacentYear(1)" [disabled]="!canStepYear(1)">Next year</button>
      </div>
      <div class="mc-chart-wrap">
        <canvas
          #canvas
          role="img"
          tabindex="0"
          aria-label="Monte Carlo net worth fan chart. Use Previous year and Next year controls, or arrow keys, to inspect values."
          (keydown)="onCanvasKeydown($event)"
          (click)="onCanvasClick($event)"></canvas>
      </div>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        min-width: 0;
        max-width: 100%;
      }
      .mc-chart-panel {
        display: flex;
        flex-direction: column;
        gap: var(--space-2, 0.5rem);
        min-width: 0;
        max-width: 100%;
      }
      .mc-year-controls {
        display: flex;
        gap: var(--space-2, 0.5rem);
        flex-wrap: wrap;
        min-width: 0;
      }
      .mc-year-btn {
        appearance: none;
        border: 1px solid var(--border);
        background: var(--surface-2);
        color: var(--text);
        border-radius: var(--radius-sm, 0.5rem);
        min-height: 44px;
        padding: 0.4rem 0.75rem;
        cursor: pointer;
        font: inherit;
        white-space: normal;
      }
      .mc-year-btn:disabled {
        opacity: 0.45;
        cursor: not-allowed;
      }
      .mc-chart-hover {
        min-width: 0;
        font-size: var(--text-sm, 0.875rem);
        color: var(--text-secondary);
        min-height: 1.25rem;
      }
      .mc-chart-hover__head {
        font-weight: 700;
        color: var(--text);
        margin-bottom: 0.35rem;
        overflow-wrap: anywhere;
      }
      .mc-chart-hover__grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(min(100%, 10rem), 1fr));
        gap: 0.2rem 1rem;
        margin: 0;
        min-width: 0;
      }
      .mc-chart-hover__row {
        display: flex;
        justify-content: space-between;
        align-items: baseline;
        gap: 0.75rem;
        min-width: 0;
        margin: 0;
      }
      .mc-chart-hover__row dt {
        min-width: 0;
        margin: 0;
        overflow-wrap: anywhere;
        font-weight: 500;
      }
      .mc-chart-hover__row dd {
        flex: 0 0 auto;
        margin: 0;
        font-weight: 600;
        color: var(--text);
        font-variant-numeric: tabular-nums;
        text-align: right;
      }
      .mc-chart-hover__row--sample dt,
      .mc-chart-hover__row--sample dd {
        color: var(--accent);
      }
      .mc-chart-hover__row--median dt,
      .mc-chart-hover__row--median dd {
        font-weight: 700;
        color: var(--text);
      }
      .mc-chart-hover__row--goal dt,
      .mc-chart-hover__row--goal dd {
        color: var(--success);
      }
      .mc-chart-hover--empty .mc-chart-hover__hint {
        color: var(--text-tertiary);
      }
      .mc-chart-wrap {
        position: relative;
        width: 100%;
        min-width: 0;
        max-width: 100%;
        min-height: 280px;
        height: min(42vh, 420px);
        overflow: hidden;
      }
      @media (max-width: 768px) {
        .mc-chart-wrap {
          min-height: 220px;
          height: 240px;
        }
        .mc-chart-hover__grid {
          grid-template-columns: 1fr;
        }
        .mc-year-controls {
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
        }
        .mc-year-btn {
          width: 100%;
        }
      }
      /* Chart.js writes an inline pixel size; keep the canvas inside the wrapper. */
      canvas {
        display: block;
        width: 100% !important;
        max-width: 100% !important;
        height: 100% !important;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MonteCarloFanChartComponent implements AfterViewInit, OnChanges, OnDestroy {
  @ViewChild('canvas') canvasRef!: ElementRef<HTMLCanvasElement>;
  @Input() data: McChartData | null = null;
  @Input() checkpoints: PlanningCheckpointResult[] = [];
  @Input() currency = 'USD';

  hoverSnapshot: McHoverSnapshot | null = null;
  displayRows: McDisplayRow[] = [];
  /** Updated each buildConfig for dimming non-hovered sample paths. */
  private samplePathDatasetIndices: number[] = [];

  private readonly cdr = inject(ChangeDetectorRef);
  private chart?: ChartInstance;
  private chartCtor: ChartCtor | null = null;
  private viewReady = false;
  private canvasHoverBound = false;
  private readonly onCanvasMove = (e: MouseEvent) => this.syncHoverFromPointer(e);
  private readonly onCanvasLeave = () => this.clearHoverDetail();

  ngAfterViewInit(): void {
    this.viewReady = true;
    void this.ensureChart();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if ((changes['data'] || changes['checkpoints']) && this.viewReady) {
      void this.ensureChart();
    }
  }

  ngOnDestroy(): void {
    this.unbindCanvasHover();
    this.chart?.destroy();
  }

  canStepYear(delta: number): boolean {
    const years = this.data?.years;
    if (!years?.length) return false;
    const current = this.hoverSnapshot?.dataIndex ?? 0;
    const next = current + delta;
    return next >= 0 && next < years.length;
  }

  selectAdjacentYear(delta: number): void {
    const years = this.data?.years;
    if (!years?.length) return;
    const current = this.hoverSnapshot?.dataIndex ?? 0;
    const next = Math.min(years.length - 1, Math.max(0, current + delta));
    this.selectYearIndex(next);
  }

  onCanvasKeydown(event: KeyboardEvent): void {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
      event.preventDefault();
      this.selectAdjacentYear(-1);
    } else if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
      event.preventDefault();
      this.selectAdjacentYear(1);
    } else if (event.key === 'Home') {
      event.preventDefault();
      this.selectYearIndex(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      const last = (this.data?.years?.length ?? 1) - 1;
      this.selectYearIndex(last);
    }
  }

  onCanvasClick(event: MouseEvent): void {
    this.syncHoverFromPointer(event);
  }

  private selectYearIndex(dataIndex: number): void {
    const snapshot = this.snapshotAtIndex(dataIndex);
    if (!snapshot) return;
    this.hoverSnapshot = snapshot;
    this.displayRows = this.buildDisplayRows(snapshot);
    this.cdr.markForCheck();
  }

  private snapshotAtIndex(dataIndex: number): McHoverSnapshot | null {
    const d = this.data;
    if (!d?.years?.length || dataIndex < 0 || dataIndex >= d.years.length) return null;
    const percentiles = this.percentileRowsAt(d.percentiles, dataIndex);
    if (!percentiles.length) return null;
    return {
      year: d.years[dataIndex] ?? 0,
      yearLabel: this.yearLabelAt(dataIndex, d.years),
      dataIndex,
      percentiles,
      samplePath: null,
    };
  }

  private async ensureChart(): Promise<void> {
    if (!this.data?.years?.length || !this.canvasRef?.nativeElement) {
      return;
    }
    if (!this.chartCtor) {
      const mod = await import('chart.js/auto');
      this.chartCtor = mod.Chart as ChartCtor;
    }
    const cfg = this.buildConfig(this.data);
    const el = this.canvasRef.nativeElement;
    if (this.chart) {
      this.chart.data = cfg.data as never;
      this.chart.options = cfg.options as never;
      this.chart.update();
      this.bindCanvasHover();
      this.cdr.markForCheck();
      return;
    }
    this.chart = new this.chartCtor(el, cfg);
    this.bindCanvasHover();
    this.cdr.markForCheck();
  }

  private bindCanvasHover(): void {
    if (this.canvasHoverBound || !this.canvasRef?.nativeElement) return;
    const canvas = this.canvasRef.nativeElement;
    canvas.addEventListener('mousemove', this.onCanvasMove);
    canvas.addEventListener('mouseleave', this.onCanvasLeave);
    this.canvasHoverBound = true;
  }

  private unbindCanvasHover(): void {
    if (!this.canvasHoverBound || !this.canvasRef?.nativeElement) return;
    const canvas = this.canvasRef.nativeElement;
    canvas.removeEventListener('mousemove', this.onCanvasMove);
    canvas.removeEventListener('mouseleave', this.onCanvasLeave);
    this.canvasHoverBound = false;
  }

  private formatMoney(v: number): string {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: this.currency,
      maximumFractionDigits: 0,
    }).format(v);
  }

  private yearLabelAt(index: number, years: number[]): string {
    const y = years[index] ?? 0;
    return y === 0 ? 'Now (year 0)' : `Year ${y}`;
  }

  /** Sample path on top, then percentiles (10→90); median row emphasized. Goal first when no sample. */
  private buildDisplayRows(snapshot: McHoverSnapshot): McDisplayRow[] {
    const rows: McDisplayRow[] = [];
    if (snapshot.goal && !snapshot.samplePath) {
      rows.push({
        label: snapshot.goal.label,
        formatted: snapshot.goal.formatted,
        variant: 'goal',
      });
    }
    if (snapshot.samplePath) {
      rows.push({
        label: snapshot.samplePath.label,
        formatted: snapshot.samplePath.formatted,
        variant: 'sample',
      });
    }
    for (const p of snapshot.percentiles) {
      rows.push({
        label: p.label,
        formatted: p.formatted,
        variant: p.label === 'Median' ? 'median' : 'default',
      });
    }
    return rows;
  }

  private percentileRowsAt(
    percentiles: Record<string, number[]>,
    dataIndex: number
  ): { label: string; formatted: string }[] {
    const fmt = (v: number) => this.formatMoney(v);
    const rows: { label: string; formatted: string }[] = [];
    for (const { key, label } of HOVER_PERCENTILES) {
      const series = percentiles[key];
      const value = series?.[dataIndex];
      if (value == null || Number.isNaN(value)) continue;
      rows.push({ label, formatted: fmt(value) });
    }
    return rows;
  }

  private findClosestSamplePath(
    chart: ChartInstance,
    dataIndex: number,
    mouseY: number
  ): McHoverSnapshot['samplePath'] {
    let best: { datasetIndex: number; distY: number; value: number; label: string } | null = null;

    for (const datasetIndex of this.samplePathDatasetIndices) {
      const ds = chart.data.datasets[datasetIndex] as { label?: string; data?: unknown[] };
      const raw = ds.data?.[dataIndex];
      const value = typeof raw === 'number' ? raw : null;
      if (value == null || Number.isNaN(value)) continue;

      const meta = chart.getDatasetMeta(datasetIndex);
      const element = meta.data[dataIndex] as { y?: number; skip?: boolean } | undefined;
      if (!element || element.skip || element.y == null) continue;

      const distY = Math.abs(element.y - mouseY);
      const label = ds.label ?? `Sample path ${datasetIndex + 1}`;
      if (!best || distY < best.distY) {
        best = { datasetIndex, distY, value, label };
      }
    }

    if (!best) return null;
    return {
      label: best.label,
      value: best.value,
      formatted: this.formatMoney(best.value),
      datasetIndex: best.datasetIndex,
    };
  }

  private applySamplePathHighlight(activeDatasetIndex: number | null): void {
    const chart = this.chart;
    if (!chart) return;
    for (const i of this.samplePathDatasetIndices) {
      const ds = chart.data.datasets[i] as {
        borderColor?: string;
        borderWidth?: number;
      };
      const isActive = activeDatasetIndex === i;
      ds.borderColor = isActive ? 'rgba(248, 250, 252, 0.85)' : 'rgba(148, 163, 184, 0.14)';
      ds.borderWidth = isActive ? 2 : 1;
    }
  }

  private clearHoverDetail(): void {
    this.applySamplePathHighlight(null);
    if (this.hoverSnapshot === null) return;
    this.hoverSnapshot = null;
    this.displayRows = [];
    this.cdr.markForCheck();
  }

  private resolveHoverSnapshot(event: MouseEvent): McHoverSnapshot | null {
    const chart = this.chart;
    const d = this.data;
    if (!chart || !d?.years?.length) return null;

    const rect = chart.canvas.getBoundingClientRect();
    const mouseY = event.clientY - rect.top;
    const fmt = (v: number) => this.formatMoney(v);

    const nearest = chart.getElementsAtEventForMode(
      event,
      'nearest',
      { intersect: true },
      false
    );
    for (const hit of nearest) {
      const ds = chart.data.datasets[hit.datasetIndex] as { type?: string; label?: string; data?: unknown[] };
      if (ds.type !== 'scatter' || ds.label !== 'Goal') continue;
      const raw = ds.data?.[hit.index] as { y?: number; label?: string } | undefined;
      const value = raw?.y;
      if (value == null || Number.isNaN(value)) continue;
      const xLabel = (raw as { x?: string })?.x;
      const dataIndex =
        typeof xLabel === 'string'
          ? (chart.data.labels as string[] | undefined)?.indexOf(xLabel) ?? hit.index
          : hit.index;
      const percentiles = this.percentileRowsAt(d.percentiles, dataIndex);
      if (!percentiles.length) return null;
      return {
        year: d.years[dataIndex] ?? 0,
        yearLabel: this.yearLabelAt(dataIndex, d.years),
        dataIndex,
        percentiles,
        samplePath: null,
        goal: {
          label: raw?.label ? `Goal · ${raw.label}` : 'Goal',
          formatted: fmt(value),
        },
      };
    }

    const alongX = chart.getElementsAtEventForMode(
      event,
      'index',
      { intersect: false, axis: 'x' },
      false
    );
    if (!alongX.length) return null;

    const dataIndex = alongX[0].index;
    if (dataIndex < 0 || dataIndex >= d.years.length) return null;

    const percentiles = this.percentileRowsAt(d.percentiles, dataIndex);
    if (!percentiles.length) return null;

    const samplePath = this.findClosestSamplePath(chart, dataIndex, mouseY);

    return {
      year: d.years[dataIndex] ?? 0,
      yearLabel: this.yearLabelAt(dataIndex, d.years),
      dataIndex,
      percentiles,
      samplePath,
    };
  }

  private syncHoverFromPointer(event: MouseEvent): void {
    const snapshot = this.resolveHoverSnapshot(event);
    const chart = this.chart;

    if (!snapshot || !chart) {
      this.clearHoverDetail();
      return;
    }

    this.hoverSnapshot = snapshot;
    this.displayRows = this.buildDisplayRows(snapshot);
    this.applySamplePathHighlight(snapshot.samplePath?.datasetIndex ?? null);
    this.cdr.markForCheck();
  }

  private buildConfig(d: McChartData) {
    const labels = d.years.map(y => (y === 0 ? 'Now' : `Y${y}`));
    const p = d.percentiles;
    const fmt = (v: number) => this.formatMoney(v);
    const years = d.years;

    const noInteract = { tooltip: { enabled: false }, hover: { enabled: false } };
    const samplePoint = {
      pointRadius: 0,
      pointHitRadius: 10,
      pointHoverRadius: 6,
      tension: 0.2,
    };
    const bandPoint = {
      pointRadius: 0,
      pointHitRadius: 0,
      tension: 0.2,
      ...noInteract,
    };

    const datasets: Record<string, unknown>[] = [];
    this.samplePathDatasetIndices = [];

    if (d.fanPaths?.length) {
      d.fanPaths.forEach((path, i) => {
        this.samplePathDatasetIndices.push(datasets.length);
        datasets.push({
          label: `Sample path ${i + 1}`,
          data: path,
          borderColor: 'rgba(148, 163, 184, 0.14)',
          borderWidth: 1,
          fill: false,
          ...samplePoint,
        });
      });
    }

    const bandHigh = p['p90'] ?? p['p75'];
    const bandLow = p['p10'] ?? p['p25'];
    if (bandHigh && bandLow) {
      datasets.push({
        label: '90th percentile band',
        data: bandHigh,
        borderColor: 'rgba(96, 165, 250, 0.55)',
        borderWidth: 1,
        fill: false,
        ...bandPoint,
      });
      datasets.push({
        label: '10th–90th range',
        data: bandLow,
        borderColor: 'rgba(96, 165, 250, 0.55)',
        backgroundColor: 'rgba(59, 130, 246, 0.22)',
        fill: '-1',
        ...bandPoint,
      });
    }

    const innerHigh = p['p75'];
    const innerLow = p['p25'];
    if (innerHigh && innerLow) {
      datasets.push({
        label: '75th percentile',
        data: innerHigh,
        borderColor: 'rgba(74, 222, 128, 0.55)',
        borderWidth: 1,
        fill: false,
        ...bandPoint,
      });
      datasets.push({
        label: '25th–75th range',
        data: innerLow,
        borderColor: 'rgba(74, 222, 128, 0.55)',
        backgroundColor: 'rgba(34, 197, 94, 0.18)',
        fill: '-1',
        ...bandPoint,
      });
    }

    if (p['p50']) {
      datasets.push({
        label: 'Median path',
        data: p['p50'],
        borderColor: chartAccentColor(),
        borderWidth: 2.5,
        ...bandPoint,
      });
    }

    const goalPoints = this.checkpoints
      .filter(cp => cp.target_net_worth != null)
      .map(cp => ({
        x: cp.year === 0 ? 'Now' : `Y${cp.year}`,
        y: cp.target_net_worth as number,
        label: cp.label,
      }));
    if (goalPoints.length) {
      datasets.push({
        type: 'scatter',
        label: 'Goal',
        data: goalPoints,
        parsing: { xAxisKey: 'x', yAxisKey: 'y' },
        pointRadius: 5,
        pointHitRadius: 12,
        pointHoverRadius: 7,
        pointBackgroundColor: chartSuccessColor(),
        pointBorderColor: chartColorAt(3),
        pointBorderWidth: 1.5,
      });
    }

    return {
      type: 'line' as const,
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'nearest' as const, intersect: false, axis: 'xy' as const },
        plugins: {
          legend: {
            ...chartLegendBottom(),
            labels: {
              ...chartLegendBottom().labels,
              filter: (item: { text?: string }) => item.text === 'Median path',
            },
          },
          tooltip: {
            enabled: false,
          },
        },
        scales: {
          ...chartCartesianScales(),
          y: {
            ...chartCartesianScales().y,
            ticks: {
              ...chartCartesianScales().y?.ticks,
              callback: (v: string | number) => fmt(Number(v)),
            },
          },
        },
      },
    };
  }
}