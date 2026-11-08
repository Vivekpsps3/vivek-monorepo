import { Component, computed, input, signal } from "@angular/core";
import { showDay } from "./display";
import {
  chartGeometry,
  type ChartGeometry,
  type ChartMarker,
  type SeriesPointLike,
} from "./pto-chart.mjs";

export interface PtoSeriesPoint extends SeriesPointLike {
  hours: string;
}

/** TPTO2B: step chart of one bucket's /pto/series points. */
@Component({
  selector: "travel-pto-chart",
  standalone: true,
  template: `
    @if (geo(); as g) {
      <div class="pto-chart-frame">
        <div class="pto-chart-axis" aria-hidden="true">
          @for (tick of g.ticks; track tick.label) {
            <span class="pto-chart-tick" [style.top.%]="(tick.y / g.height) * 100">{{
              tick.label
            }}</span>
          }
        </div>
        <svg
          class="pto-chart"
          [attr.viewBox]="'0 0 ' + g.width + ' ' + g.height"
          role="group"
          [attr.aria-label]="summary(g)"
          preserveAspectRatio="none"
        >
          @if (g.zeroY !== null) {
            <line
              class="pto-chart-zero"
              [attr.x1]="0"
              [attr.x2]="g.width"
              [attr.y1]="g.zeroY"
              [attr.y2]="g.zeroY"
            />
          }
          <path class="pto-chart-line" [attr.d]="g.path" />
          @for (marker of g.markers; track marker.on) {
            <circle
              class="pto-chart-point"
              [attr.cx]="marker.x"
              [attr.cy]="marker.y"
              r="7"
              tabindex="0"
              fill="transparent"
              [attr.aria-label]="pointText(marker)"
              (mouseenter)="showTip(marker)"
              (mouseleave)="hideTip(marker)"
              (focus)="showTip(marker)"
              (blur)="hideTip(marker)"
            />
          }
          @if (g.today; as today) {
            <circle
              class="pto-chart-today"
              [attr.cx]="today.x"
              [attr.cy]="today.y"
              r="3.5"
              pointer-events="none"
            />
          }
        </svg>
        @if (tip(); as active) {
          <p class="pto-chart-tip" role="tooltip">{{ pointText(active) }}</p>
        }
      </div>
      <p class="pto-chart-caption muted">
        {{ showDay(g.first.on) }}: {{ g.first.days }} days ·
        {{ showDay(g.last.on) }}: {{ g.last.days }} days
        @if (g.today; as today) {
          · Today: {{ today.days }} days
        }
      </p>
    }
  `,
  styles: [
    `
      .pto-chart-frame {
        display: grid;
        grid-template-columns: 2.75rem minmax(0, 1fr);
        column-gap: 0.25rem;
        align-items: start;
      }
      .pto-chart-axis {
        position: relative;
        height: 200px;
      }
      .pto-chart-tick {
        position: absolute;
        right: 0;
        transform: translateY(-50%);
        font-size: 0.75rem;
        line-height: 1;
        color: var(--text-secondary);
      }
      .pto-chart {
        width: 100%;
        height: 200px;
        display: block;
      }
      .pto-chart-point {
        cursor: pointer;
      }
      .pto-chart-point:hover,
      .pto-chart-point:focus {
        fill: var(--accent);
        fill-opacity: 0.45;
        outline: 2px solid var(--focus-ring);
        outline-offset: 1px;
      }
      .pto-chart-tip {
        grid-column: 1 / -1;
        margin: 0.35rem 0 0;
      }
    `,
  ],
})
export class PtoChartComponent {
  readonly points = input<readonly PtoSeriesPoint[]>([]);
  readonly label = input("Time off balance");
  readonly geo = computed<ChartGeometry | null>(() =>
    chartGeometry(this.points()),
  );
  readonly showDay = showDay;
  readonly tip = signal<ChartMarker | null>(null);

  summary(g: ChartGeometry): string {
    return `${this.label()} from ${showDay(g.first.on)} (${g.first.days} days) to ${showDay(g.last.on)} (${g.last.days} days).`;
  }

  pointText(marker: ChartMarker): string {
    const hours = marker.hours ? ` (${marker.hours} hours)` : "";
    return `${showDay(marker.on)}: ${marker.daysText} days${hours}`;
  }

  showTip(marker: ChartMarker): void {
    this.tip.set(marker);
  }

  hideTip(marker: ChartMarker): void {
    if (this.tip() === marker) this.tip.set(null);
  }
}
