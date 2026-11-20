import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { HealthSparklineView } from './health-history';

@Component({
  selector: 'app-health-sparkline',
  templateUrl: './health-sparkline.component.html',
  styleUrl: './health-sparkline.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HealthSparklineComponent {
  readonly seriesId = input.required<string>();
  readonly caption = input.required<string>();
  readonly view = input.required<HealthSparklineView>();
}
