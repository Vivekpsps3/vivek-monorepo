import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { formatDateRange, plural } from '@vivek/browser';
import type { FinanceJoinStatus } from './pixels.types';
import { lifeWeekOrdinal, type LifeWeekCell } from './life-model';

export type LifeStep = 'week-prev' | 'week-next' | 'year-prev' | 'year-next';

@Component({
  selector: 'app-life-week',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './life-week.component.html',
  styleUrl: './life-week.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LifeWeekComponent {
  week = input.required<LifeWeekCell>();
  rowCount = input.required<number>();
  showAge = input(false);
  financeStatus = input<FinanceJoinStatus>('locked');
  showTown = input(true);
  showMedia = input(true);
  showTravel = input(true);

  step = output<LifeStep>();

  protected range(): string {
    return formatDateRange(this.week().start, this.week().end);
  }

  protected summary(): string {
    const week = this.week();
    return `${plural(week.activities, 'activity', { zeroIsNo: false })} · level ${week.level} of 4`;
  }

  protected place(): string {
    if (!this.showAge()) return '';
    const index = lifeWeekOrdinal(this.week().row, this.week().week).toLocaleString('en-US');
    const total = (this.rowCount() * 52).toLocaleString('en-US');
    return `Week ${index} of ${total}. Age ${this.week().row}.`;
  }

  protected town(): string {
    return `Town · ${plural(this.week().town, 'check-in', { zeroIsNo: false })}`;
  }

  protected media(): string {
    return `Media · ${plural(this.week().media, 'episode', { zeroIsNo: false })}`;
  }

  protected travel(): string {
    const title = this.week().tripTitle;
    return title ? `Travel · ${title}` : 'Travel · no trip';
  }

  protected finance(): string {
    const week = this.week();
    if (!week.financeKnown) return 'Finance · no data for this week';
    const noun = week.financeKept === 1 ? 'day' : 'days';
    return `Finance · ${week.financeKept} ${noun} kept`;
  }
}
