import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { formatDateRange, plural } from '@vivek/browser';
import { ReturnContext } from '@vivek/ui';
import { calendarSpans, civilSpanLabel, civilWeekday, type CompactMemoryPreview } from './atlas';
import { weekFinanceText } from './day-memory';
import { formatDayHeading } from './day-detail.component';
import { MemoryPreviewComponent } from './memory-preview.component';
import { inclusiveIsoDates } from './pixels-dates';
import type { FinanceJoinStatus } from './pixels.types';
import type { LifeWeekCell } from './life-model';

export type LifeStep = 'week-prev' | 'week-next' | 'year-prev' | 'year-next';

@Component({
  selector: 'app-life-week',
  standalone: true,
  imports: [MemoryPreviewComponent, RouterLink],
  templateUrl: './life-week.component.html',
  styleUrls: ['./life-week.component.css', './atlas.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LifeWeekComponent {
  private readonly context = inject(ReturnContext);

  week = input.required<LifeWeekCell>();
  rowCount = input.required<number>();
  showAge = input(false);
  financeStatus = input<FinanceJoinStatus>('locked');
  unlockNext = input('/pixels/life');
  showTown = input(true);
  showMedia = input(true);
  showTravel = input(true);
  focusDate = input<string | null>(null);
  preview = input<CompactMemoryPreview | null>(null);

  step = output<LifeStep>();

  protected readonly spans = computed(() => calendarSpans(this.focusDate() ?? this.week().start));

  protected range(): string {
    return formatDateRange(this.week().start, this.week().end);
  }

  protected summary(): string {
    const week = this.week();
    return `${plural(week.activities, 'activity', { zeroIsNo: false })} · level ${week.level} of 4`;
  }

  protected place(): string {
    if (!this.showAge()) return '';
    return `Age ${this.week().row}. This row is one year of the poster, not an end date.`;
  }

  protected lifeLabel(): string {
    return civilSpanLabel(this.week().start, this.week().end);
  }

  protected spanNote(): string {
    const start = civilWeekday(this.week().start);
    return `Life week starts on ${start}. Sunday week starts on Sunday. ISO week starts on Monday.`;
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

  protected financeLine(): string {
    const week = this.week();
    return weekFinanceText(this.financeStatus(), week.financeKnown, week.financeKept);
  }

  protected dates(): string[] {
    const week = this.week();
    return inclusiveIsoDates(week.start, week.end);
  }

  protected dayLabel(date: string): string {
    return `Open ${formatDayHeading(date)}`;
  }

  protected dayParams(date: string): Record<string, string> {
    return { date, from: 'life', year: date.slice(0, 4), span: this.week().start };
  }

  protected dayState(date: string): Record<string, unknown> {
    const params = new URLSearchParams(this.dayParams(date));
    return this.context.link(`/pixels/day?${params.toString()}`);
  }
}
