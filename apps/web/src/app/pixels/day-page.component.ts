import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { todayIsoDate } from '@vivek/browser';
import { ReturnContext, UiStateComponent, returnPath, type HubCardState } from '@vivek/ui';
import { DayDetailComponent } from './day-detail.component';
import { dayOriginPath, parseDayQuery, type DayQuery } from './day-route';
import { PixelsDataService } from './pixels-data.service';
import { withoutFinance, yearScreenState } from './pixels-model';
import type { AnnotationChange, DayFactsStatus, PixelDayFacts, PixelsSnapshot } from './pixels.types';

@Component({
  selector: 'app-pixels-day',
  standalone: true,
  imports: [DayDetailComponent, UiStateComponent],
  templateUrl: './day-page.component.html',
  styleUrl: './pixels.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DayPageComponent {
  private readonly data = inject(PixelsDataService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly context = inject(ReturnContext);
  private readonly destroyRef = inject(DestroyRef);

  readonly today = todayIsoDate();
  readonly notice = signal<string | null>(null);
  readonly query = signal<DayQuery | null>(null);
  private readonly phase = signal<HubCardState>('loading');
  readonly snapshot = signal<PixelsSnapshot | null>(null);
  readonly facts = signal<PixelDayFacts | null>(null);
  readonly factsStatus = signal<DayFactsStatus>('idle');
  readonly annotationError = signal<string | null>(null);
  readonly draftEpoch = signal(0);
  readonly mutating = signal(false);

  private requestId = 0;
  private dayRequest = 0;
  private loadedDate: string | null = null;

  protected unlockSource(): string {
    return returnPath(this.router.url) ?? '/pixels/day';
  }

  readonly screen = computed(() => yearScreenState(this.snapshot(), this.phase(), this.today));
  readonly readySnapshot = computed(() => {
    const screen = this.screen();
    const snapshot = this.snapshot();
    if (!snapshot || (screen !== 'ready' && screen !== 'stale')) return null;
    return snapshot;
  });
  readonly selectedDay = computed(() => {
    const snapshot = this.readySnapshot();
    const date = this.query()?.date;
    if (!snapshot || !date) return null;
    return snapshot.days.find(item => item.date === date) ?? null;
  });

  constructor() {
    this.destroyRef.onDestroy(() => {
      this.requestId += 1;
      this.dayRequest += 1;
    });
    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe(params => {
      const parsed = parseDayQuery({
        date: params.get('date'),
        from: params.get('from'),
        year: params.get('year'),
        span: params.get('span'),
      });
      const next = parsed.query;
      const previous = this.query()?.date ?? null;
      this.notice.set(parsed.notice);
      this.query.set(next);
      if (!next) {
        this.requestId += 1;
        this.dayRequest += 1;
        this.loadedDate = null;
        this.snapshot.set(null);
        this.facts.set(null);
        this.factsStatus.set('idle');
        this.phase.set('empty');
        return;
      }
      if (previous !== next.date) {
        this.snapshot.set(null);
        this.facts.set(null);
        this.phase.set('loading');
        this.loadedDate = null;
      }
      this.load();
      this.loadFacts(next.date);
    });
    this.data.financeCleared$.pipe(takeUntilDestroyed()).subscribe(() => {
      this.draftEpoch.update(value => value + 1);
      this.snapshot.update(current => current ? withoutFinance(current, this.today) : current);
      this.loadedDate = null;
      this.load(true);
      this.loadFacts(this.query()?.date ?? null);
    });
    this.data.userChanged$.pipe(takeUntilDestroyed()).subscribe(() => {
      this.draftEpoch.update(value => value + 1);
      this.snapshot.set(null);
      this.phase.set('loading');
      this.loadedDate = null;
      this.load(true);
      this.loadFacts(this.query()?.date ?? null);
    });
  }

  leave(): void {
    if (this.context.back(this.router.url)) return;
    const query = this.query();
    void this.router.navigateByUrl(query ? dayOriginPath(query) : '/pixels');
  }

  reload(): void {
    this.loadedDate = null;
    this.load(true);
    this.loadFacts(this.query()?.date ?? null);
  }

  protected onArchive(conceptId: number): void {
    void this.mutate({ kind: 'archive', conceptId });
  }

  protected onRemove(conceptId: number): void {
    void this.mutate({ kind: 'delete', conceptId });
  }

  protected onRedate(change: { conceptId: number; understoodOn: string }): void {
    void this.mutate({ kind: 'redate', conceptId: change.conceptId, understoodOn: change.understoodOn });
  }

  private async mutate(action: AnnotationChange): Promise<void> {
    const date = this.query()?.date ?? null;
    if (!date) return;
    this.annotationError.set(null);
    this.mutating.set(true);
    try {
      const result = await this.data.changeAnnotation(action);
      if (this.query()?.date !== date) return;
      if (result.status === 'dropped') return;
      if (result.status === 'failed') {
        this.annotationError.set(result.message);
        return;
      }
      this.loadFacts(date, true);
    } finally {
      this.mutating.set(false);
    }
  }

  private loadFacts(date: string | null, preserve = false): void {
    const requestId = ++this.dayRequest;
    this.annotationError.set(null);
    if (!date) {
      this.facts.set(null);
      this.factsStatus.set('idle');
      return;
    }
    const current = this.facts();
    const keep = preserve && current?.date === date && this.factsStatus() === 'ready';
    if (!keep) {
      this.facts.set(null);
      this.factsStatus.set('loading');
    }
    void this.data.loadDay(date).then(result => {
      if (requestId !== this.dayRequest || this.query()?.date !== date) return;
      if (result.status === 'ready') {
        if (result.facts.date !== date) return;
        this.facts.set(result.facts);
        this.factsStatus.set('ready');
        return;
      }
      if (result.status === 'dropped') return;
      this.facts.set(null);
      this.factsStatus.set(result.status);
    });
  }

  private load(force = false): void {
    const query = this.query();
    if (!query) return;
    const date = query.date;
    if (!force && this.loadedDate === date && this.snapshot()) return;
    this.loadedDate = date;
    const requestId = ++this.requestId;
    const current = this.snapshot();
    if (current?.from === date) this.phase.set('stale');
    else if (!this.snapshot()) this.phase.set('loading');
    void this.data.load({
      from: date,
      to: date,
      profile: false,
      includeTrips: true,
      today: this.today,
    }).then(result => {
      if (requestId !== this.requestId || this.query()?.date !== date) return;
      if (result.status === 'dropped') return;
      if (result.status === 'ready') {
        this.snapshot.set(result.snapshot);
        this.phase.set('ready');
        return;
      }
      this.phase.set(result.status);
    });
  }
}
