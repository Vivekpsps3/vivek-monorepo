import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { UiIconComponent } from '@vivek/ui';
import type { FinanceJoinStatus } from './pixels.types';

@Component({
  selector: 'app-year-stats',
  standalone: true,
  imports: [UiIconComponent],
  templateUrl: './year-stats.component.html',
  styleUrl: './year-stats.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class YearStatsComponent {
  stats = input.required<{
    active: number;
    longestRun: number;
    tripDays: number;
    budgetKept: number | null;
  }>();
  financeStatus = input<FinanceJoinStatus>('locked');
}
