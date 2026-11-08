import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { dayActivities, type PixelApp } from '@vivek/ui';
import { isIsoDate } from './pixels-dates';
import { tripDayLabel } from './pixels-model';
import type { PixelDayView } from './pixels.types';
import { formatDayHeading } from './day-detail.component';

const APP_LABEL: Record<PixelApp, string> = {
  travel: 'Travel',
  town: 'Town',
  media: 'Media',
  finance: 'Finance',
};

/**
 * Real calendar days only. Invalid dates are the 31-column padding.
 * When the list has a non-future day, future dates in another year are
 * future-only padding and stay out. A year that is entirely in the future stays.
 */
export function yearTableDays(days: readonly PixelDayView[]): PixelDayView[] {
  const valid = days.filter(day => isIsoDate(day.date));
  const anchoredYears = new Set(valid.filter(day => !day.future).map(day => day.date.slice(0, 4)));
  if (anchoredYears.size === 0) return valid;
  return valid.filter(day => !day.future || anchoredYears.has(day.date.slice(0, 4)));
}

export function financeCell(fin: number | null): string {
  if (fin === 1) return 'budget kept';
  if (fin === 0) return 'over budget pace';
  return '';
}

export function dominantLabel(app: PixelApp | null): string {
  return app ? APP_LABEL[app] : '';
}

export function dominantClass(app: PixelApp | null): string {
  return app ? `pixel swatch app-${app}` : 'pixel swatch';
}

@Component({
  selector: 'app-year-table',
  standalone: true,
  templateUrl: './year-table.component.html',
  styleUrls: ['./pixels.css', './year-table.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class YearTableComponent {
  days = input<readonly PixelDayView[]>([]);
  selected = output<string>();

  readonly rows = computed(() => yearTableDays(this.days()));

  heading(date: string): string {
    return formatDayHeading(date);
  }

  activities(day: PixelDayView): number {
    return dayActivities(day.channels);
  }

  travel(day: PixelDayView): string {
    if (day.trip) return tripDayLabel(day.trip, day.date);
    return day.channels.trip > 0 ? String(Math.floor(day.channels.trip)) : '0';
  }

  finance(day: PixelDayView): string {
    return financeCell(day.channels.fin);
  }

  dominant(day: PixelDayView): string {
    return dominantLabel(day.dominant);
  }

  swatch(day: PixelDayView): string {
    return dominantClass(day.dominant);
  }

  choose(date: string): void {
    this.selected.emit(date);
  }
}
