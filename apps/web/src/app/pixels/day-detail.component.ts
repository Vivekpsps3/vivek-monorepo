import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import type { FinanceJoinStatus, PixelDayView } from './pixels.types';

/** Replaced by the day-detail slice. Inputs and outputs stay. */
@Component({
  selector: 'app-day-detail',
  standalone: true,
  template: '',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DayDetailComponent {
  day = input<PixelDayView | null>(null);
  financeStatus = input<FinanceJoinStatus>('locked');
  today = input('');
  phone = input(false);
  closed = output<void>();
}
