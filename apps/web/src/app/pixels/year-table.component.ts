import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import type { PixelDayView } from './pixels.types';

/** Replaced by the day-detail slice. Inputs and outputs stay. */
@Component({
  selector: 'app-year-table',
  standalone: true,
  template: '',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class YearTableComponent {
  days = input<readonly PixelDayView[]>([]);
  selected = output<string>();
}
