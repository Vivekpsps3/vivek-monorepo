import { Component, DestroyRef, ElementRef, computed, inject, input, signal } from "@angular/core";
import { combinedForecast, type CombinedForecast, type PtoChartSeries } from "./pto-chart.mjs";

/** One accessible PTO/Sick forecast. Geometry stays in pto-chart.mjs. */
@Component({
  selector: "travel-pto-chart",
  standalone: true,
  template: `
    @if (geo(); as g) {
      <figure class="pto-forecast-figure">
        @for (warning of g.warnings; track warning) {
          <p class="pto-forecast-warning" role="status">{{ warning }}</p>
        }
        <p class="pto-forecast-legend">
          @for (item of g.legend; track item.bucket) {
            <span [class]="item.legendClass">{{ item.glyph }} {{ item.label }}</span>
          }
        </p>
        <svg
          class="pto-forecast"
          [attr.viewBox]="g.viewBox"
          [style.height.px]="g.height"
          aria-hidden="true"
          focusable="false"
          preserveAspectRatio="none"
        >
          @if (g.band; as band) {
            <rect
              class="pto-band"
              [attr.x]="band.x"
              [attr.y]="band.y"
              [attr.width]="band.width"
              [attr.height]="band.height"
            />
          }
          @for (tick of g.yTicks; track tick.label) {
            @if (g.zeroY === null || tick.days !== 0) {
              <line
                class="pto-grid"
                [attr.x1]="g.plot.left"
                [attr.x2]="g.plot.right"
                [attr.y1]="tick.y"
                [attr.y2]="tick.y"
              />
            }
            <text
              class="pto-tick"
              [attr.x]="g.plot.left - 6"
              [attr.y]="tick.y"
              text-anchor="end"
              dominant-baseline="middle"
            >{{ tick.label }}</text>
          }
          <text class="pto-axis-name" [attr.x]="g.axisName.x" [attr.y]="g.axisName.y" text-anchor="end">{{
            g.axisName.text
          }}</text>
          @if (g.zeroY !== null) {
            <line
              class="pto-zero"
              [attr.x1]="g.plot.left"
              [attr.x2]="g.plot.right"
              [attr.y1]="g.zeroY"
              [attr.y2]="g.zeroY"
            />
          }
          @for (line of g.series; track line.bucket) {
            @if (line.history) {
              <path [attr.class]="line.historyClass" [attr.d]="line.history" />
            }
            @if (line.projection) {
              <path [attr.class]="line.projectionClass" [attr.d]="line.projection" />
            }
          }
          @if (g.today; as today) {
            <line
              class="pto-today"
              [attr.x1]="today.x"
              [attr.x2]="today.x"
              [attr.y1]="g.plot.top"
              [attr.y2]="g.plot.bottom"
            />
            <text
              class="pto-today-label"
              [attr.x]="today.labelX"
              [attr.y]="today.labelY"
              [attr.text-anchor]="today.anchor"
            >Today</text>
          }
          @for (line of g.series; track line.bucket) {
            @for (marker of line.markers; track marker.on) {
              @if (line.shape === "circle") {
                <circle [class]="line.markerClass" [attr.cx]="marker.x" [attr.cy]="marker.y" r="4" />
              } @else {
                <rect
                  [class]="line.markerClass"
                  [attr.x]="marker.x - 4"
                  [attr.y]="marker.y - 4"
                  width="8"
                  height="8"
                />
              }
            }
          }
          @for (label of g.endLabels; track label.text) {
            <text class="pto-end-label" [attr.x]="label.x" [attr.y]="label.y" dominant-baseline="middle">{{
              label.text
            }}</text>
          }
          @for (tick of g.xTicks; track tick.on) {
            <text class="pto-xtick" [attr.x]="tick.x" [attr.y]="g.xLabelY" text-anchor="middle">{{
              tick.label
            }}</text>
          }
        </svg>
        <p class="pto-forecast-caption">{{ g.caption }}</p>
        <table class="pto-forecast-table">
          <caption>Balance by month</caption>
          <thead>
            <tr>
              @for (column of g.table.columns; track column) {
                <th scope="col">{{ column }}</th>
              }
            </tr>
          </thead>
          <tbody>
            @for (row of g.table.rows; track row.key) {
              <tr>
                @for (cell of row.cells; track $index) {
                  @if ($index === 0) {
                    <th scope="row">{{ cell }}</th>
                  } @else {
                    <td>{{ cell }}</td>
                  }
                }
              </tr>
            }
          </tbody>
        </table>
      </figure>
    }
  `,
  styles: [
    `
      :host {
        display: block;
        width: 100%;
        --series-2: #7c3aed;
      }
      :host-context([data-theme="dark"]) {
        --series-2: #a78bfa;
      }
      .pto-forecast-figure { position: relative; margin: 0; min-width: 0; overflow: hidden; }
      .pto-forecast-legend { display: flex; flex-wrap: wrap; gap: 0.75rem 1rem; margin: 0 0 0.35rem; }
      .pto-key-pto { color: var(--accent); }
      .pto-key-sick { color: var(--series-2); }
      .pto-forecast-warning { margin: 0 0 0.35rem; }
      .pto-forecast { width: 100%; max-width: 100%; display: block; overflow: hidden; }
      .pto-line { fill: none; stroke-width: 2.5; stroke-linejoin: round; stroke-linecap: round; vector-effect: non-scaling-stroke; }
      .pto-line-pto { stroke: var(--accent); }
      .pto-line-sick { stroke: var(--series-2); }
      .pto-future { stroke-dasharray: 6 4; }
      .pto-marker-pto { fill: var(--accent); }
      .pto-marker-sick { fill: var(--series-2); }
      .pto-grid, .pto-zero, .pto-today { vector-effect: non-scaling-stroke; }
      .pto-grid { stroke: var(--border-subtle); stroke-width: 1; }
      .pto-zero { stroke: var(--text); stroke-width: 1; }
      .pto-today { stroke: var(--text-secondary); stroke-width: 1; stroke-dasharray: 1 3; }
      .pto-band { fill: var(--danger); fill-opacity: 0.12; }
      .pto-tick, .pto-xtick, .pto-today-label, .pto-axis-name { fill: var(--text-secondary); font-size: 12px; }
      .pto-end-label { fill: var(--text); font-size: 12px; }
      .pto-forecast-caption { margin: 0.35rem 0 0; }
      .pto-forecast-table {
        position: absolute;
        left: 0;
        top: 0;
        width: 1px;
        height: 1px;
        padding: 0;
        margin: 0;
        overflow: hidden;
        clip: rect(0, 0, 0, 0);
        clip-path: inset(50%);
        white-space: nowrap;
        border: 0;
      }
    `,
  ],
})
export class PtoChartComponent {
  readonly series = input<PtoChartSeries | null>(null);
  readonly wide = signal(false);
  readonly plotWidth = signal(0);
  readonly geo = computed<CombinedForecast | null>(() =>
    combinedForecast(this.series(), {
      wide: this.wide(),
      width: this.plotWidth() || undefined,
    }),
  );
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly destroyRef = inject(DestroyRef);

  constructor() {
    if (typeof matchMedia === "function") {
      const query = matchMedia("(min-width: 1280px)");
      this.wide.set(query.matches);
      const onChange = (event: MediaQueryListEvent) => this.wide.set(event.matches);
      query.addEventListener("change", onChange);
      this.destroyRef.onDestroy(() => query.removeEventListener("change", onChange));
    }
    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(() => {
        const next = Math.round(this.host.nativeElement.clientWidth);
        if (next > 0) this.plotWidth.set(next);
      });
      observer.observe(this.host.nativeElement);
      this.destroyRef.onDestroy(() => observer.disconnect());
    }
  }
}
