import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import {
  LIFE_FILLS,
  lifeNearestWeek,
  lifePosterPathStrings,
  lifePosterSize,
  lifeRingRect,
  lifeSelectionRect,
  lifeSvgLabels,
  lifeTripDots,
  type LifePosterMetrics,
  type LifeWeekCell,
} from './life-model';

@Component({
  selector: 'app-life-poster',
  standalone: true,
  templateUrl: './life-poster.component.html',
  styleUrl: './life-poster.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LifePosterComponent {
  weeks = input.required<readonly LifeWeekCell[]>();
  metrics = input.required<LifePosterMetrics>();
  birthday = input.required<string>();
  showAge = input(false);
  rowCount = input.required<number>();
  now = input<{ row: number; week: number } | null>(null);
  selected = input<{ row: number; week: number } | null>(null);

  selectedChange = output<{ row: number; week: number }>();

  protected readonly paths = computed(() => {
    const entries = lifePosterPathStrings(this.weeks(), this.metrics());
    const painted: { key: string; d: string; fill: string; stroke: string | null }[] = [];
    for (const key of ['lived', 'future', 'l1', 'l2', 'l3', 'l4'] as const) {
      const d = entries[key];
      if (!d) continue;
      const paint = LIFE_FILLS[key];
      painted.push({ key, d, fill: paint.fill, stroke: paint.stroke });
    }
    return painted;
  });

  protected readonly dots = computed(() => lifeTripDots(this.weeks(), this.metrics()));

  protected readonly labels = computed(() => lifeSvgLabels({
    birthday: this.birthday(),
    rowCount: this.rowCount(),
    showAge: this.showAge(),
    metrics: this.metrics(),
    now: this.now(),
  }));

  protected readonly size = computed(() => lifePosterSize(this.metrics(), this.rowCount()));

  protected readonly nowRect = computed(() => {
    const now = this.now();
    return now ? lifeRingRect(this.metrics(), now.row, now.week) : null;
  });

  protected readonly selectionRect = computed(() => {
    const selected = this.selected();
    return selected ? lifeSelectionRect(this.metrics(), selected.row, selected.week) : null;
  });

  protected readonly viewBox = computed(() => {
    const size = this.size();
    return `0 0 ${size.width} ${size.height}`;
  });

  protected onPosterClick(event: MouseEvent): void {
    const svg = event.currentTarget;
    if (!(svg instanceof SVGSVGElement)) return;
    const bounds = svg.getBoundingClientRect();
    const size = this.size();
    const width = bounds.width || size.width;
    const height = bounds.height || size.height;
    if (width === 0 || height === 0) return;
    const x = ((event.clientX - bounds.left) / width) * size.width;
    const y = ((event.clientY - bounds.top) / height) * size.height;
    this.selectedChange.emit(lifeNearestWeek(this.metrics(), x, y, this.rowCount()));
  }
}
