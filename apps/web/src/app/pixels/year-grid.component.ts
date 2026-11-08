import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, input, output, signal } from '@angular/core';
import { formatDate } from '@vivek/browser';
import { adjacentYearDate, daysInMonth, isIsoDate, type YearOrientation } from './pixels-dates';
import type { PixelsColorBy } from './pixels-preferences';
import type { PixelDayView } from './pixels.types';

const YEAR_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown']);

interface YearSlot {
  month: number;
  day: number;
  date: string | null;
  view: PixelDayView | null;
}

interface YearCell {
  month: number;
  day: number;
  date: string | null;
  className: string;
  label: string;
  today: boolean;
  gridRow: number;
  gridColumn: number;
}

function yearKey(year: number): string {
  return String(year).padStart(4, '0');
}

/** Twelve month rows of 31 columns. Impossible dates stay in the grid as empty slots. */
function yearSlots(year: number, days: readonly PixelDayView[]): YearSlot[][] {
  const byDate = new Map(days.map(day => [day.date, day]));
  const key = yearKey(year);
  const rows: YearSlot[][] = [];
  for (let month = 1; month <= 12; month += 1) {
    const length = daysInMonth(year, month);
    const row: YearSlot[] = [];
    for (let day = 1; day <= 31; day += 1) {
      const date = day <= length
        ? `${key}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
        : null;
      row.push({ month, day, date, view: date ? byDate.get(date) ?? null : null });
    }
    rows.push(row);
  }
  return rows;
}

function slotClass(slot: YearSlot, colorBy: PixelsColorBy, selected: string | null): string {
  if (!slot.date) return 'pixel none';
  const classes = ['pixel'];
  const view = slot.view;
  if (view && colorBy === 'app' && view.dominant) classes.push(`app-${view.dominant}`);
  if (view && colorBy === 'activity' && !view.future && view.level > 0) classes.push(`l${view.level}`);
  if (view?.future) classes.push('future');
  if (view?.planned) classes.push('plan');
  if (view?.trip) classes.push('trip');
  if (view?.today) classes.push('today');
  if (slot.date === selected) classes.push('selected');
  return classes.join(' ');
}

function appName(app: NonNullable<PixelDayView['dominant']>): string {
  if (app === 'town') return 'Town';
  if (app === 'media') return 'Media';
  if (app === 'travel') return 'Travel';
  return 'Finance';
}

function slotLabel(slot: YearSlot, colorBy: PixelsColorBy): string {
  const date = slot.date ?? '';
  const spoken = formatDate(date, 'heading');
  const parts = [spoken === 'No date' ? date : `${spoken}, ${date.slice(0, 4)}`];
  const view = slot.view;
  if (!view) return parts[0] ?? date;
  if (view.today) parts.push('today');
  if (view.planned) parts.push('planned trip');
  else if (view.future) parts.push('future');
  if (view.trip) parts.push(view.trip.title);
  if (colorBy === 'app') {
    if (view.dominant) parts.push(appName(view.dominant));
  } else if (!view.future && view.level > 0) {
    parts.push(`level ${view.level}`);
  }
  return parts.join(', ');
}

@Component({
  selector: 'app-year-grid',
  standalone: true,
  templateUrl: './year-grid.component.html',
  styleUrls: ['./pixels.css', './year-grid.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class YearGridComponent {
  private readonly host = inject(ElementRef<HTMLElement>);

  year = input.required<number>();
  days = input<readonly PixelDayView[]>([]);
  selected = input<string | null>(null);
  colorBy = input<PixelsColorBy>('activity');
  today = input('');
  /** Width ≤ 640px. Columns are months; rows are days. */
  phone = input(false);
  picked = output<string>();

  /** The one gridcell in the tab order. Arrows move this without changing selection. */
  private readonly roving = signal<string | null>(null);

  readonly label = computed(() => String(this.year()));

  readonly tabDate = computed(() => {
    const key = yearKey(this.year());
    const candidates = [this.roving(), this.selected(), this.today()];
    for (const candidate of candidates) {
      if (candidate && candidate.startsWith(`${key}-`) && isIsoDate(candidate)) return candidate;
    }
    return `${key}-01-01`;
  });

  readonly rows = computed((): YearCell[][] => {
    const phone = this.phone();
    const colorBy = this.colorBy();
    const selected = this.selected();
    return yearSlots(this.year(), this.days()).map(row => row.map(slot => ({
      month: slot.month,
      day: slot.day,
      date: slot.date,
      className: slotClass(slot, colorBy, selected),
      label: slot.date ? slotLabel(slot, colorBy) : '',
      today: slot.view?.today === true,
      gridRow: phone ? slot.day : slot.month,
      gridColumn: phone ? slot.month : slot.day,
    })));
  });

  cellId(date: string): string {
    return `pixel-day-${date}`;
  }

  onKeydown(event: KeyboardEvent): void {
    if (!YEAR_KEYS.has(event.key)) return;
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const date = target.getAttribute('data-date');
    if (!date) return;
    event.preventDefault();
    const next = adjacentYearDate(date, event.key, this.orientation());
    if (!next || next === date) return;
    this.roving.set(next);
    const node = this.host.nativeElement.querySelector(`[data-date="${next}"]`) as HTMLElement | null;
    node?.focus();
  }

  pick(date: string): void {
    this.roving.set(date);
    this.picked.emit(date);
  }

  /** Keep this day as the one tab stop, then focus it after the grid repaints. */
  focusDate(date: string): void {
    this.roving.set(date);
    const focus = () => {
      if (this.roving() !== date) return;
      const node = this.host.nativeElement.querySelector(`[data-date="${date}"]`) as HTMLElement | null;
      node?.focus();
    };
    queueMicrotask(focus);
    setTimeout(focus, 0);
  }

  private orientation(): YearOrientation {
    return this.phone() ? 'days-by-month' : 'months-by-day';
  }
}
