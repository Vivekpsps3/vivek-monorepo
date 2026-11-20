import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  OnDestroy,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ReturnContext, dayActivities, vaultReturnQuery } from '@vivek/ui';
import { pixelsDayActivityPath } from '../../../../finance/frontend/src/public-api';
import { buildDayMemory, type DayMemory } from './day-memory';
import { dayOriginPath, daySearch, type DayQuery } from './day-route';
import { isIsoDate } from './pixels-dates';
import { dayScoreVector } from './pixels-model';
import type {
  DayFactsStatus,
  FinanceJoinStatus,
  PixelAnnotation,
  PixelDayFacts,
  PixelDayView,
  SourceCoverage,
} from './pixels.types';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

/** Weekday, month, day, and year in UTC so the host timezone cannot shift the day. */
export function formatDayHeading(iso: string): string {
  if (!isIsoDate(iso)) return iso;
  const [year, month, day] = iso.split('-').map(Number) as [number, number, number];
  const weekday = WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
  return `${weekday}, ${MONTHS[month - 1]} ${day}, ${year}`;
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
  protected readonly context = inject(ReturnContext);
  protected readonly returnQuery = vaultReturnQuery;
  private readonly router = inject(Router);
  private focusTimers: ReturnType<typeof setTimeout>[] = [];

  constructor() {
    effect(() => {
      const ids = (this.facts()?.annotations ?? []).map(item => item.id).join(',');
      const previous = this.shownAnnotations;
      this.shownAnnotations = ids;
      if (!previous || previous === ids) return;
      const removed = previous.split(',').some(id => id !== '' && !ids.split(',').includes(id));
      if (!removed) return;
      queueMicrotask(() => {
        this.host.nativeElement.querySelector<HTMLElement>('#day-learning-heading')?.focus();
      });
    });
  }

  day = input<PixelDayView | null>(null);
  financeStatus = input<FinanceJoinStatus>('locked');
  today = input('');
  phone = input(false);
  pageMode = input(false);
  originView = input<'year' | 'life'>('year');
  originYear = input('');
  originSpan = input<string | null>(null);
  unlockSource = input('/pixels');
  facts = input<PixelDayFacts | null>(null);
  factsStatus = input<DayFactsStatus>('idle');
  annotationError = input<string | null>(null);
  draftEpoch = input(0);
  mutating = input(false);
  closed = output<void>();
  archive = output<number>();
  remove = output<number>();
  redate = output<{ conceptId: number; understoodOn: string }>();

  protected readonly scoreVector = computed(() => {
    const day = this.day();
    return day ? dayScoreVector(day) : '';
  });
  protected readonly drafts = signal<ReadonlyMap<string, string>>(new Map());
  protected readonly coverageLines = computed(() => {
    const facts = this.facts();
    if (!facts || this.factsStatus() !== 'ready') return [];
    return (['town', 'media', 'travel', 'concepts'] as const).map(key => ({
      key,
      text: coverageText(key, facts.coverage[key]),
    }));
  });
  private shownAnnotations = '';

  protected readonly coordinates = computed((): DayQuery | null => {
    const day = this.day();
    if (!day) return null;
    const from = this.originView() === 'life' ? 'life' : 'year';
    const yearText = this.originYear().trim();
    const year = /^(?!0+$)\d{1,4}$/.test(yearText) ? yearText : day.date.slice(0, 4);
    const spanText = this.originSpan();
    const span = from === 'life' && spanText && isIsoDate(spanText) ? spanText : null;
    return { date: day.date, from, year, span };
  });

  protected readonly memory = computed((): DayMemory | null => {
    const day = this.day();
    if (!day) return null;
    return buildDayMemory({
      day,
      financeStatus: this.financeStatus(),
      facts: this.facts(),
      factsStatus: this.factsStatus(),
    });
  });

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
      activityLink: this.router.parseUrl(pixelsDayActivityPath(day.date)),
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

  protected dayParams(): Record<string, string> | null {
    const query = this.coordinates();
    if (!query) return null;
    const params: Record<string, string> = { date: query.date, from: query.from, year: query.year };
    if (query.span) params['span'] = query.span;
    return params;
  }

  protected openState(): Record<string, unknown> {
    const query = this.coordinates();
    return query ? this.context.link(`/pixels/day?${daySearch(query)}`) : {};
  }

  protected originCommands(): string[] {
    const query = this.coordinates();
    return query?.from === 'life' && query.span ? ['/pixels/life'] : ['/pixels'];
  }

  protected originParams(): Record<string, string> {
    const query = this.coordinates();
    if (!query) return {};
    if (query.from === 'life' && query.span) return { span: query.span };
    return dayOriginPath(query) === `/pixels?year=${query.year}`
      ? { year: query.year }
      : { year: query.year, day: query.date };
  }

  protected backLabel(): string {
    const query = this.coordinates();
    if (!query) return 'Back';
    if (query.from === 'life' && query.span) return `Back to week of ${formatDayHeading(query.span)}`;
    return `Back to ${query.year}`;
  }

  protected draftValue(id: string): string {
    return this.drafts().get(this.draftKey(id)) ?? '';
  }

  protected onDraft(id: string, event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    const value = target.value;
    const key = this.draftKey(id);
    this.drafts.update(current => {
      const next = new Map(current);
      next.set(key, value);
      return next;
    });
  }

  protected submitRedate(event: Event, annotation: PixelAnnotation): void {
    event.preventDefault();
    this.redate.emit({
      conceptId: annotation.conceptId,
      understoodOn: this.draftValue(annotation.id),
    });
  }

  /** A lock, owner change, or selected day starts a new draft. The previous text stays out of the field. */
  private draftKey(id: string): string {
    return `${this.draftEpoch()}|${this.day()?.date ?? ''}|${id}`;
  }

  protected redateId(conceptId: number): string {
    return `redate-${conceptId}`;
  }

  private cancelFocus(): void {
    for (const timer of this.focusTimers) clearTimeout(timer);
    this.focusTimers = [];
  }

  private focusClose(): void {
    if (this.pageMode() || !this.phone() || !this.day()) return;
    const focus = () => {
      if (!this.day()) return;
      const button = this.host.nativeElement.querySelector('[data-day-close]');
      if (button instanceof HTMLButtonElement) button.focus({ preventScroll: true });
    };
    focus();
    // The shell moves focus to the page heading while this sheet is still mounting.
    this.focusTimers.push(setTimeout(focus, 0), setTimeout(focus, 50));
  }
}

const COVERAGE_LABEL = {
  town: 'Town check-ins',
  media: 'Watched episodes',
  travel: 'Trip spans',
  concepts: 'Learning annotations',
} as const;

function coverageText(key: keyof typeof COVERAGE_LABEL, coverage: SourceCoverage): string {
  const label = COVERAGE_LABEL[key];
  if (coverage.status === 'absent') return `${label} are not set up.`;
  if (coverage.status !== 'ok') return `${label} are unavailable. The score is unchanged.`;
  const suffix = coverage.truncated ? ', truncated' : '';
  return `${label}: ${coverage.included} of ${coverage.total}${suffix}.`;
}
