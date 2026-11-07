import { Component, computed, input } from "@angular/core";
import { showDay } from "./display";
import {
  chartGeometry,
  type ChartGeometry,
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
      <svg
        class="pto-chart"
        [attr.viewBox]="'0 0 ' + g.width + ' ' + g.height"
        role="img"
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
        @if (g.today; as today) {
          <circle
            class="pto-chart-today"
            [attr.cx]="today.x"
            [attr.cy]="today.y"
            r="3.5"
          />
        }
      </svg>
      <p class="pto-chart-caption muted">
        {{ showDay(g.first.on) }}: {{ g.first.days }} days ·
        {{ showDay(g.last.on) }}: {{ g.last.days }} days
        @if (g.today; as today) {
          · Today: {{ today.days }} days
        }
      </p>
    }
  `,
})
export class PtoChartComponent {
  readonly points = input<readonly PtoSeriesPoint[]>([]);
  readonly label = input("Time off balance");
  readonly geo = computed<ChartGeometry | null>(() =>
    chartGeometry(this.points()),
  );
  readonly showDay = showDay;

  summary(g: ChartGeometry): string {
    return `${this.label()} from ${showDay(g.first.on)} (${g.first.days} days) to ${showDay(g.last.on)} (${g.last.days} days).`;
  }
}
