import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  OnDestroy,
  computed,
  inject,
  input,
  output,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { dayActivities } from '@vivek/ui';
import { isIsoDate } from './pixels-dates';
import { tripDayLabel } from './pixels-model';
import type { FinanceJoinStatus, PixelDayView } from './pixels.types';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

/** Weekday, month, day, and year in UTC so the host timezone cannot shift the day. */
export function formatDayHeading(iso: string): string {
  if (!isIsoDate(iso)) return iso;
  const [year, month, day] = iso.split('-').map(Number) as [number, number, number];
  const weekday = WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
  return `${weekday}, ${MONTHS[month - 1]} ${day}, ${year}`;
}

function wholeCount(value: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return 0;
  return Math.floor(value);
}

export function townLine(count: number): string {
  const n = wholeCount(count);
  if (n === 0) return 'Town · none';
  return `Town · ${n} ${n === 1 ? 'check-in' : 'check-ins'}`;
}

export function mediaLine(count: number): string {
  const n = wholeCount(count);
  if (n === 0) return 'Media · none';
  return `Media · ${n} ${n === 1 ? 'episode' : 'episodes'} watched`;
}

/** Ready maps 1 and 0 to kept or over pace. Null, including ready before the first transaction, is not a miss. */
export function financeCopy(status: FinanceJoinStatus, fin: number | null): { locked: boolean; text: string } {
  if (status === 'locked') {
    return { locked: true, text: 'Finance is locked. Unlock to include budget kept.' };
  }
  if (status !== 'ready') return { locked: false, text: 'Finance · no data' };
  if (fin === 1) return { locked: false, text: 'Finance · budget kept' };
  if (fin === 0) return { locked: false, text: 'Finance · over budget pace' };
  return { locked: false, text: 'Finance · the budget is not in this day' };
}

@Component({
  selector: 'app-day-detail',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './day-detail.component.html',
  styleUrls: ['./pixels.css', './day-detail.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DayDetailComponent implements AfterViewInit, OnDestroy {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private focusTimers: ReturnType<typeof setTimeout>[] = [];

  day = input<PixelDayView | null>(null);
  financeStatus = input<FinanceJoinStatus>('locked');
  today = input('');
  phone = input(false);
  closed = output<void>();

  readonly detail = computed(() => {
    const day = this.day();
    if (!day) return null;
    const activities = dayActivities(day.channels);
    const level = day.level;
    return {
      heading: formatDayHeading(day.date),
      level,
      levelClass: level >= 1 && level <= 4 ? `pixel swatch l${level}` : 'pixel swatch',
      activityLabel: activities === 1 ? '1 activity' : `${activities} activities`,
      isToday: this.today() !== '' && day.date === this.today(),
      town: townLine(day.channels.town),
      media: mediaLine(day.channels.media),
      travel: day.trip ? `Travel · ${tripDayLabel(day.trip, day.date)}` : 'Travel · no trip',
      tripId: day.trip ? day.trip.id : null,
      finance: financeCopy(this.financeStatus(), day.channels.fin),
    };
  });

  ngAfterViewInit(): void {
    this.focusClose();
  }

  ngOnDestroy(): void {
    this.cancelFocus();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.day()) this.close();
  }

  close(): void {
    this.cancelFocus();
    this.closed.emit();
  }

  private cancelFocus(): void {
    for (const timer of this.focusTimers) clearTimeout(timer);
    this.focusTimers = [];
  }

  private focusClose(): void {
    if (!this.phone() || !this.day()) return;
    const focus = () => {
      if (!this.day()) return;
      const button = this.host.nativeElement.querySelector('[data-day-close]');
      if (button instanceof HTMLButtonElement) button.focus();
    };
    focus();
    // The shell moves focus to the page heading while this sheet is still mounting.
    this.focusTimers.push(setTimeout(focus, 0), setTimeout(focus, 50));
  }
}
