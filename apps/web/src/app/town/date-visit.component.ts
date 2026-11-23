import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, ParamMap, Router, RouterLink } from '@angular/router';
import { PixelsDataService } from '../pixels/pixels-data.service';
import { SessionService } from '../platform/session.service';
import {
  LAYOUT_NOTE,
  formatVisitDay,
  isIsoDate,
  originLabel,
  originRoute,
  readDateSelection,
  townVisitQuery,
  visitAppearance,
  visitSentence,
  worldVisitQuery,
  type DateSelection,
  type SelectionRead,
  type VisitAppearance,
} from '../platform/date-visit';

type VisitFacts = Extract<Awaited<ReturnType<PixelsDataService['loadDay']>>, { status: 'ready' }>['facts'];
type VisitFact = VisitFacts['facts'][number];

@Component({
  selector: 'app-date-visit',
  imports: [RouterLink],
  templateUrl: './date-visit.component.html',
  styleUrl: './date-visit.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[attr.data-visit-state]': 'hostState()',
    '[attr.data-origin]': 'originKind()',
    '[attr.data-origin-year]': 'originYear()',
    '[attr.data-origin-span]': 'originSpan()',
  },
})
export class DateVisitComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly session = inject(SessionService);
  private readonly data = inject(PixelsDataService);
  private readonly destroyRef = inject(DestroyRef);
  private epoch = 0;
  private seenOwner: number | null | undefined;

  readonly today = input('');

  private readonly params = signal<ParamMap | null>(null);
  protected readonly draft = signal('');
  protected readonly draftNotice = signal<string | null>(null);
  protected readonly overlay = signal(true);
  private readonly facts = signal<VisitFacts | null>(null);
  private readonly factsStatus = signal<'idle' | 'loading' | 'ready' | 'unavailable' | 'expired'>('idle');

  protected readonly layoutNote = LAYOUT_NOTE;
  protected readonly selection = computed((): SelectionRead => {
    const map = this.params();
    if (!map) return { status: 'absent' };
    return readDateSelection(searchFrom(map));
  });
  protected readonly appearance = computed((): VisitAppearance => {
    const read = this.selection();
    if (read.status !== 'ready') return 'loading';
    const facts = this.facts();
    const status = this.factsStatus();
    return visitAppearance({
      date: read.selection.day,
      today: this.today(),
      status: status === 'idle' ? 'loading' : status,
      records: facts ? facts.facts.length + facts.annotations.length : 0,
      sourceUnavailable: facts ? sourceUnavailable(facts) : false,
    });
  });

  constructor() {
    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe(map => this.params.set(map));
    effect(() => {
      const read = this.selection();
      const day = read.status === 'ready' ? read.selection.day : null;
      untracked(() => this.follow(day));
    });
    this.session.user$.pipe(takeUntilDestroyed()).subscribe(user => this.noteOwner(user?.id ?? null));
    this.session.cleared$.pipe(takeUntilDestroyed()).subscribe(() => this.invalidate());
    this.destroyRef.onDestroy(() => {
      this.epoch += 1;
    });
  }

  protected hostState(): string | null {
    const read = this.selection();
    if (read.status === 'invalid') return 'invalid';
    if (read.status !== 'ready') return null;
    return this.appearance();
  }

  protected heading(): string {
    const read = this.selection();
    if (read.status !== 'ready') return 'Date visit';
    return read.selection.kind === 'life'
      ? `Life week of ${formatVisitDay(read.selection.span)}`
      : formatVisitDay(read.selection.day);
  }

  protected sentence(): string {
    const read = this.selection();
    if (read.status !== 'ready') return '';
    return visitSentence(this.appearance(), read.selection.day);
  }

  protected invalidNotice(): string {
    const read = this.selection();
    return read.status === 'invalid' ? read.notice : '';
  }

  protected originText(): string {
    const selection = this.ready();
    return selection ? originLabel(selection) : 'Back';
  }

  protected originCommands(): string[] {
    const selection = this.ready();
    return selection ? originRoute(selection).commands : ['/pixels'];
  }

  protected originParams(): Record<string, string> {
    const selection = this.ready();
    return selection ? originRoute(selection).query : {};
  }

  protected worldParams(): Record<string, string> {
    const selection = this.ready();
    return selection ? worldVisitQuery(selection) : {};
  }

  protected originKind(): string | null {
    return this.ready()?.kind ?? null;
  }

  protected originYear(): string | null {
    const selection = this.ready();
    return selection?.kind === 'year' ? selection.year : null;
  }

  protected originSpan(): string | null {
    const selection = this.ready();
    return selection?.kind === 'life' ? selection.span : null;
  }

  protected lines(): { id: string; label: string; href: string | null }[] {
    const facts = this.facts();
    if (!facts || !this.overlay()) return [];
    return [
      ...facts.facts.map(fact => ({ id: fact.id, label: factLabel(fact), href: safePath(fact.route) })),
      ...facts.annotations.map(note => ({
        id: note.id,
        label: `Learning · ${note.name} · ${note.understoodOn}`,
        href: null,
      })),
    ];
  }

  protected sourceLine(key: string): string | null {
    const facts = this.facts();
    if (!facts || !this.overlay()) return null;
    const coverage = facts.coverage[key as keyof VisitFacts['coverage']];
    if (!coverage || coverage.status !== 'unavailable') return null;
    return `${key} records are unavailable.`;
  }

  protected canRetry(): boolean {
    const state = this.appearance();
    return state === 'unavailable' || state === 'expired';
  }

  protected toggleOverlay(): void {
    this.overlay.update(on => !on);
  }

  protected onDraft(event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    this.draft.set(target.value);
    this.draftNotice.set(null);
  }

  protected correct(event: Event): void {
    event.preventDefault();
    const value = this.draft().trim();
    const read = this.selection();
    if (read.status !== 'ready') return;
    if (!isIsoDate(value)) {
      this.draftNotice.set(value === '' ? 'Enter a date.' : `${value} is not a date.`);
      return;
    }
    const next: DateSelection = read.selection.kind === 'life'
      ? { kind: 'life', span: read.selection.span, day: value }
      : { kind: 'year', year: read.selection.year, day: value };
    if (next.day === read.selection.day) return;
    this.draftNotice.set(null);
    void this.router.navigate(['/town'], { queryParams: townVisitQuery(next) });
  }

  protected retry(): void {
    const read = this.selection();
    if (read.status !== 'ready') return;
    this.follow(read.selection.day);
  }

  private ready(): DateSelection | null {
    const read = this.selection();
    return read.status === 'ready' ? read.selection : null;
  }

  private noteOwner(userId: number | null): void {
    if (this.seenOwner === undefined) {
      this.seenOwner = userId;
      return;
    }
    if (this.seenOwner === userId) return;
    this.seenOwner = userId;
    this.invalidate();
  }

  private invalidate(): void {
    this.epoch += 1;
    this.facts.set(null);
    this.factsStatus.set('idle');
    this.draft.set('');
    this.draftNotice.set(null);
    const read = this.selection();
    if (read.status === 'ready') this.follow(read.selection.day);
  }

  private follow(day: string | null): void {
    const epoch = ++this.epoch;
    const owner = this.session.currentUser?.id ?? null;
    this.overlay.set(true);
    this.facts.set(null);
    if (!day) {
      this.factsStatus.set('idle');
      return;
    }
    this.factsStatus.set('loading');
    void this.data.loadDay(day).then(result => {
      if (epoch !== this.epoch || (this.session.currentUser?.id ?? null) !== owner) return;
      const read = this.selection();
      if (read.status !== 'ready' || read.selection.day !== day) return;
      if (result.status === 'ready') {
        if (result.facts.date !== day) return;
        this.facts.set(result.facts);
        this.factsStatus.set('ready');
        return;
      }
      if (result.status === 'dropped') {
        this.factsStatus.set('unavailable');
        return;
      }
      this.factsStatus.set(result.status);
    });
  }
}

function searchFrom(map: ParamMap): URLSearchParams {
  const params = new URLSearchParams();
  for (const key of map.keys) {
    for (const value of map.getAll(key)) params.append(key, value);
  }
  return params;
}

function sourceUnavailable(facts: VisitFacts): boolean {
  return (['town', 'media', 'travel', 'concepts'] as const).some(key => facts.coverage[key].status === 'unavailable');
}

function factLabel(fact: VisitFact): string {
  const kind = fact.kind === 'checkin' ? 'Town check-in' : fact.kind === 'episode' ? 'Watched episode' : 'Trip span';
  return fact.title ? `${kind} · ${fact.title} · ${fact.date}` : `${kind} · ${fact.date}`;
}

function safePath(route: string): string | null {
  if (!route.startsWith('/') || route.startsWith('//') || route.includes('://')) return null;
  return route;
}
