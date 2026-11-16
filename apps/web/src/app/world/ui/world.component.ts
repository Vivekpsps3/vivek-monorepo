import { Location } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  InjectionToken,
  NgZone,
  afterNextRender,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, NavigationStart, Router, RouterLink } from '@angular/router';
import { filter } from 'rxjs';
import {
  ThemeService,
  UiButtonComponent,
  UiEmptyStateComponent,
} from '@vivek/ui';
import {
  bindLockNotices,
  financeVaultPresent,
  loadFinanceBudgetKept,
} from '../../../../../finance/frontend/src/public-api';
import { SessionService } from '../../platform/session.service';
import { FIXED_LOTS, weeksKeptRun, type TownResponse } from '../../town';
import { loadTownHealthStages, type TownHealthStages } from '../../town/health';
import { BAND, CHEST_X, CHUNK_H, CHUNK_W, dayIndex } from '../engine';
import {
  addIsoDays,
  isoMonday,
  readingDay,
  applyCamera,
  bandAt,
  bitmapKey,
  createBitmapCache,
  fogMask,
  inertiaFactor,
  isTap,
  litSummary,
  prefersReducedMotion,
  prependedWeekCount,
  readFogEnabled,
  readingForWeeks,
  readingWeek,
  scaleForWidth,
  shouldPage,
  shouldScheduleFrame,
  tileOfDay,
  writeFogEnabled,
  type BitmapCache,
  type CameraLayout,
  type CameraModel,
  type ConceptEdit,
} from '../logic';
import { SpriteAtlas, worldSpriteUrl } from '../render/atlas';
import {
  hitObjects,
  sceneObjects,
  districtPaint,
  paintViewport,
  renderChunkBitmap,
  type BitmapCanvas,
  type RenderContext,
} from '../render/renderer';
import { WorldApi } from '../data/world-api';
import { WorldController } from '../data/world-controller';
import {
  WORLD_COPY,
  type CameraCommand,
  type ChestOverlay,
  type LoadedChunk,
  type ReadingItem,
  type WorldMeta,
  type WorldWeek,
} from '../world.types';
import { ConceptSheetComponent, type ConceptChange } from './concept-sheet.component';

const WORLD_ART = [
  'flower', 'rock', 'oak', 'pine', 'snowrock', 'cactus', 'bones', 'palm', 'fern',
  'beacon', 'pile', 'guide', 'vivekbot', 'terrarian', 'manager',
  'chest-sealed', 'chest-gold', 'tome', 'reel', 'scroll', 'gem', 'signpost', 'pier',
] as const;

const EMPTY_CHESTS: ChestOverlay = { weeks: [], toolbar: null, retry: false };

export interface WorldView {
  meta: WorldMeta | null;
  weeks: WorldWeek[];
  chunks: LoadedChunk[];
  chests: ChestOverlay;
  fog: boolean;
  error: string | null;
  loading: boolean;
  townStatus?: 'idle' | 'loading' | 'ready' | 'failed' | 'unavailable';
  town?: TownResponse | null;
}

export interface ExplorerController {
  loadInitial(signal: AbortSignal): Promise<void>;
  ensureWeek?(week: string, signal: AbortSignal): Promise<void>;
  pageOlder(signal: AbortSignal, force?: boolean): Promise<void>;
  refetchWeeks(weeks: readonly string[], signal: AbortSignal): Promise<void>;
  applyConceptEdit(edit: ConceptEdit, signal: AbortSignal): Promise<void>;
  clearFinance(): void;
  dispose(): void;
  setFog(enabled: boolean): void;
  snapshot(): WorldView;
  reloadBudget?(signal: AbortSignal): Promise<void>;
  readonly town?: TownResponse | null;
}

export const WORLD_CONTROLLER = new InjectionToken<ExplorerController>('WORLD_CONTROLLER');

/** Test seam. Production calls the real camera. */
export const cameraApi = { apply: applyCamera };

/** Test seam. Production calls the real renderer. */
export const renderApi = { renderChunkBitmap, paintViewport, districtPaint };

export function commandForKey(event: {
  key: string;
  shiftKey: boolean;
  altKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
}): CameraCommand | null {
  if (event.altKey || event.ctrlKey || event.metaKey) return null;
  switch (event.key) {
    case 'ArrowLeft':
      return event.shiftKey ? { type: 'week', delta: -1 } : { type: 'band', delta: -1 };
    case 'ArrowRight':
      return event.shiftKey ? { type: 'week', delta: 1 } : { type: 'band', delta: 1 };
    case 'PageUp':
      return { type: 'week', delta: -4 };
    case 'PageDown':
      return { type: 'week', delta: 4 };
    case 'Home':
      return { type: 'home' };
    case 'End':
      return { type: 'end' };
    case 'Enter':
    case ' ':
    case 'Spacebar':
      return { type: 'select-center' };
    default:
      return null;
  }
}

function problemMessage(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    const body = error.error as { message?: string; detail?: string } | null;
    return body?.message || (typeof body?.detail === 'string' ? body.detail : '') || 'World is unavailable right now.';
  }
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string' && error.message) {
    return error.message;
  }
  return 'World is unavailable right now.';
}

function connectController(): ExplorerController {
  const provided = inject(WORLD_CONTROLLER, { optional: true });
  if (provided) return provided;
  const api = inject(WorldApi);
  const session = inject(SessionService);
  const injector = inject(Injector);
  return new WorldController({
    api,
    seedUserId: () => session.currentUser?.id ?? 0,
    loadBudget: (signal, opts) => loadFinanceBudgetKept(injector, signal, opts),
    vaultPresent: financeVaultPresent,
    matchMedia: (query: string) => matchMedia(query),
  }) as ExplorerController;
}

@Component({
  selector: 'app-world',
  imports: [RouterLink, UiButtonComponent, UiEmptyStateComponent, ConceptSheetComponent],
  templateUrl: './world.component.html',
  styleUrl: './world.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorldComponent {
  readonly copy = WORLD_COPY;
  private readonly destroyRef = inject(DestroyRef);
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly zone = inject(NgZone);
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  private readonly session = inject(SessionService);
  private readonly theme = inject(ThemeService);
  private readonly injector = inject(Injector);
  private readonly api = inject(WorldApi);
  private readonly controller = connectController();
  private readonly stageRef = viewChild<ElementRef<HTMLElement>>('stage');
  private readonly canvasRef = viewChild<ElementRef<HTMLCanvasElement>>('canvas');
  private readonly panelRef = viewChild<ElementRef<HTMLElement>>('weekPanel');

  readonly mode = signal<'list' | 'map'>('map');
  readonly selectedDate = signal('');
  readonly selectedItemId = signal<string | null>(null);
  readonly choices = signal<ReadingItem[]>([]);
  readonly dateBusy = signal(false);
  readonly historyBusy = signal(false);
  private navigationId = 0;
  private dateWork = new AbortController();
  private followingSelection = false;
  readonly reduced = signal(false);
  readonly fogOn = signal(true);
  readonly view = signal<WorldView | null>(null);
  readonly names = signal<Readonly<Record<number, string>>>({});
  readonly centerWeek = signal('');
  readonly centerDay = signal(0);
  readonly inTown = signal(false);
  readonly selectedTile = signal<number | null>(null);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly slow = signal(false);
  readonly townFailed = signal(false);
  readonly townData = signal<TownResponse | null>(null);
  readonly health = signal<TownHealthStages>({ state: 'locked' });
  readonly conceptsOpen = signal(false);
  readonly conceptFocus = signal<number | null>(null);
  readonly creatingConcept = signal(false);

  private model: CameraModel = { x: 0, reduced: false };
  private readonly atlas = new SpriteAtlas();
  private bitmaps: BitmapCache = createBitmapCache();
  private work = new AbortController();
  private disposed = false;
  private placed = false;
  private dragging = false;
  private moving = false;
  private pendingDrag = false;
  private velocity = 0;
  private frameQueued = false;
  private raf = 0;
  private bootId = 0;
  private financeEpoch = 0;
  private slowTimer = 0;
  private paging = false;
  private pointer: { id: number; x: number; y: number; lastX: number } | null = null;
  private observer?: ResizeObserver;
  private readonly cleanups: Array<() => void> = [];

  readonly weeksOldest = computed(() => {
    const names = this.names();
    const weeks = [...(this.view()?.weeks ?? [])].sort((a, b) => (a.week < b.week ? -1 : a.week > b.week ? 1 : 0));
    return weeks.map(week => ({
      ...week,
      concepts: week.concepts.map(concept => {
        const name = names[concept.id];
        return name ? { ...concept, name } : concept;
      }),
    }));
  });

  readonly readings = computed(() => {
    const snap = this.view();
    if (!snap) return [];
    return readingForWeeks(this.weeksOldest(), snap.chests?.weeks ?? [], true);
  });

  readonly centerReading = computed(() => {
    const week = this.selectedDate() ? isoMonday(this.selectedDate()) : this.centerWeek();
    const snap = this.view();
    if (!week || !snap || this.inTown()) return null;
    const source = this.weeksOldest().find(item => item.week === week);
    if (!source) return null;
    const chest = snap.chests?.weeks?.find(item => item.week === week) ?? null;
    return readingWeek(source, chest);
  });

  readonly activeWeek = computed(() => this.weeksOldest().find(week => week.week === this.centerReading()?.week) ?? null);
  readonly dayItems = computed(() => {
    const week = this.activeWeek();
    return week && this.selectedDate() ? readingDay(week, this.selectedDate()) : [];
  });
  readonly selectedItem = computed<ReadingItem | null>(() => {
    const reading = this.centerReading();
    const id = this.selectedItemId();
    const item = reading?.items.find(item => item.id === id);
    if (item) return item;
    if (reading && id === `budget:${reading.week}`) return {
      id, kind: 'budget', title: 'Weekly spending plan', date: reading.week,
      detail: 'Unlock Finance to view this completed week’s spending-plan status.',
    };
    return null;
  });
  readonly dayStrip = computed(() => {
    const week = this.centerReading()?.week;
    const source = this.activeWeek();
    const today = this.serverToday();
    if (!week || !source) return [];
    return Array.from({ length: 7 }, (_, index) => {
      const date = addIsoDays(week, index);
      const count = readingDay(source, date).length;
      return { date, name: this.formatDate(date, { weekday: 'short' }), number: Number(date.slice(8)), count, future: date > today };
    });
  });
  readonly selectedScene = computed(() => {
    const index = this.weeksOldest().findIndex(week => week.week === this.centerReading()?.week);
    const loaded = this.view()?.chunks.find(chunk => chunk.week.week === this.centerReading()?.week);
    const object = loaded && sceneObjects(loaded.chunk).find(item => item.id === this.selectedItemId());
    if (loaded && this.selectedItemId() === `budget:${loaded.week.week}`) return {
      id: this.selectedItemId()!, x: index * CHUNK_W + loaded.chunk.chest.x,
      y: 14, w: 2, h: 2, sprite: worldSpriteUrl('chest-sealed'),
    };
    return object ? { ...object, x: object.x + index * CHUNK_W } : null;
  });
  readonly weekItemCount = computed(() => {
    const week = this.activeWeek();
    return week ? week.trips.length + week.finished.length + (week.finished_more ?? 0) + week.concepts.length
      + week.habits.filter(habit => habit.days.some(day => day >= week.week && day <= addIsoDays(week.week, 6))).length : 0;
  });
  readonly weekTitle = computed(() => {
    const week = this.centerReading()?.week;
    return week ? `${this.formatDate(week, { day: 'numeric', month: 'short' })} – ${this.formatDate(addIsoDays(week, 6), { day: 'numeric', month: 'short', year: 'numeric' })}` : 'Your journey';
  });
  readonly dayState = computed(() => {
    if (this.error()) return 'Activity unavailable';
    if (this.selectedDate() > this.serverToday()) return 'On the horizon';
    return this.dayItems().length ? 'Recorded activity' : 'No recorded activity';
  });
  readonly liveText = computed(() => {
    if (!this.view()) return '';
    if (this.inTown()) return WORLD_COPY.town;
    const count = this.dayItems().length;
    return this.selectedDate() ? `${this.selectedDate()}. ${count} recorded ${count === 1 ? 'item' : 'items'}.` : '';
  });

  readonly litText = computed(() => {
    const snap = this.view();
    if (!snap?.meta) return '';
    const weeks = this.weeksOldest();
    const rows = (snap.chunks ?? []).map(chunk => ({ week: chunk.week.week, lit: (chunk.chunk.lit ?? []).filter((_, day) => addIsoDays(chunk.week.week, day) <= snap.meta!.today) }));
    const oldest = weeks[0]?.week ?? snap.meta.start_week;
    const summary = litSummary(rows, snap.meta.start_week, oldest <= snap.meta.start_week);
    const text = WORLD_COPY.litSummary(summary.lit, summary.total, summary.since);
    return summary.partial ? `${text} ${WORLD_COPY.loadedWeeks}` : text;
  });

  readonly showEmpty = computed(() => {
    if (this.busy() || this.error() || !this.view()) return false;
    return this.readings().every(week => week.items.every(item => item.kind === 'budget' || item.kind === 'lit'));
  });

  readonly canLoadOlder = computed(() => {
    const snap = this.view();
    if (!snap?.meta || this.busy()) return false;
    const oldest = this.weeksOldest()[0]?.week;
    return !!oldest && oldest > snap.meta.start_week;
  });

  constructor() {
    const reduced = prefersReducedMotion();
    this.reduced.set(reduced);
    this.model = { x: 0, reduced };
    if (reduced) this.mode.set('list');
    effect(() => {
      this.host.nativeElement.dataset['view'] = this.mode();
    });
    this.theme.theme$.pipe(takeUntilDestroyed()).subscribe(() => this.paint());
    this.session.cleared$.pipe(takeUntilDestroyed()).subscribe(() => {
      this.onFinanceCleared();
      this.shutdown();
      const canvas = this.canvasRef()?.nativeElement;
      if (canvas) canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
      this.view.set(null);
      this.townData.set(null);
      this.names.set({});
      this.error.set(null);
      this.townFailed.set(false);
      this.selectedDate.set('');
      this.selectedItemId.set(null);
      this.choices.set([]);
      this.conceptsOpen.set(false);
      this.busy.set(false);
      this.bitmaps = createBitmapCache();
      this.paint();
    });
    this.destroyRef.onDestroy(bindLockNotices(() => this.onFinanceCleared()));
    // The router may skip a popstate that matches its last URL, because date
    // selections use Location.go. Listen to the actual browser history too.
    const history = this.location.subscribe(() => {
      if (!this.disposed && this.location.path().split('?')[0] === '/town/world' && this.view()?.meta) {
        void this.restoreQuery();
      }
    });
    this.cleanups.push(() => history.unsubscribe());
    this.router.events.pipe(
      filter((event): event is NavigationStart => event instanceof NavigationStart),
      takeUntilDestroyed(),
    ).subscribe(event => {
      const path = event.url.split(/[?#]/)[0];
      if (path !== '/town/world') this.shutdown();
    });
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      takeUntilDestroyed(),
    ).subscribe(() => {
      if (!this.disposed && this.view()?.meta) void this.restoreQuery();
    });
    this.destroyRef.onDestroy(() => this.shutdown());
    afterNextRender(() => this.bindStage());
    void this.boot();
  }

  chests(): ChestOverlay {
    return this.view()?.chests ?? EMPTY_CHESTS;
  }

  serverToday(): string {
    return this.view()?.meta?.today ?? '';
  }

  lastDate(): string {
    const week = this.view()?.meta?.current_week;
    return week ? addIsoDays(week, 6) : '';
  }

  sourceName(item: ReadingItem): string {
    return { habit: 'Town', finished: 'Media', concept: 'Concepts', trip: 'Travel', lit: 'World', budget: 'Finance' }[item.kind];
  }

  itemSprite(item: ReadingItem, week: string): string {
    const loaded = this.view()?.chunks.find(chunk => chunk.week.week === week);
    const object = loaded && sceneObjects(loaded.chunk).find(row => row.id === item.id);
    return object?.sprite ?? worldSpriteUrl(item.kind === 'trip' ? 'signpost' : item.kind === 'concept' ? 'beacon' : 'pile');
  }

  conceptId(item: ReadingItem): number | null {
    if (item.kind !== 'concept') return null;
    const match = /^concept:(\d+)$/.exec(item.id);
    return match ? Number(match[1]) : null;
  }

  setMode(mode: 'list' | 'map'): void {
    this.mode.set(mode);
    queueMicrotask(() => this.paint());
  }

  toggleFog(): void {
    const next = !this.fogOn();
    this.fogOn.set(next);
    const id = this.session.currentUser?.id;
    if (id != null) writeFogEnabled(id, next, localStorage);
    this.controller.setFog(next);
    this.paint();
  }

  stepWeek(delta: number): void {
    const base = this.selectedDate() || this.view()?.meta?.current_week;
    if (base) void this.visitDate(addIsoDays(base, delta * 7), false, this.readDayQuery() !== null);
  }

  goToday(): void {
    const today = this.serverToday();
    if (today) void this.visitDate(today);
  }

  onJump(event: Event): void {
    const value = event.target instanceof HTMLInputElement ? event.target.value : '';
    if (this.validDate(value)) void this.visitDate(value);
  }

  onKey(event: KeyboardEvent): void {
    const command = commandForKey(event);
    if (!command || this.busy() || this.dateBusy()) return;
    event.preventDefault();
    if (command.type === 'week') this.stepWeek(command.delta);
    else if (command.type === 'band') {
      const date = this.selectedDate() || this.serverToday();
      if (date) void this.visitDate(addIsoDays(date, command.delta));
    } else if (command.type === 'home') {
      const oldest = this.weeksOldest()[0]?.week;
      if (oldest) void this.visitDate(oldest);
    } else if (command.type === 'end') this.goTown();
    else this.move(command);
  }

  goTown(): void {
    this.followingSelection = false;
    this.selectedItemId.set(null);
    this.choices.set([]);
    this.move({ type: 'end' });
  }

  formatDate(date: string, options: Intl.DateTimeFormatOptions = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }): string {
    if (!this.validDate(date)) return date;
    return new Intl.DateTimeFormat('en', { ...options, timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`));
  }

  private validDate(value: string): boolean {
    return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00Z`))
      && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
  }

  async visitDate(raw: string, replace = false, includeDay = true, recenter = true): Promise<void> {
    const meta = this.view()?.meta;
    if (!meta || !this.validDate(raw) || this.disposed) return;
    const date = raw < meta.start_week ? meta.start_week : raw > addIsoDays(meta.current_week, 6) ? addIsoDays(meta.current_week, 6) : raw;
    const week = isoMonday(date);
    const id = ++this.navigationId;
    this.dateWork.abort();
    this.dateWork = new AbortController();
    const signal = AbortSignal.any([this.dateWork.signal, this.work.signal]);
    this.dateBusy.set(true);
    this.writeSelectionQuery(week, includeDay ? date : null, replace);
    try {
      if (!this.weeksOldest().some(item => item.week === week)) {
        await this.controller.ensureWeek?.(week, signal);
        if (signal.aborted || id !== this.navigationId) return;
        this.pull();
        if (!this.weeksOldest().some(item => item.week === week)) {
          this.error.set(this.view()?.error || 'That date could not be loaded. Try again.');
          return;
        }
        await this.refreshArt();
      }
      if (signal.aborted || id !== this.navigationId) return;
      this.error.set(this.view()?.error ?? null);
      this.selectedDate.set(date);
      this.selectedItemId.set(null);
      this.choices.set([]);
      this.inTown.set(false);
      this.followingSelection = true;
      this.centerWeek.set(week);
      this.centerDay.set(dayIndex(week, date));
      const index = this.weeksOldest().findIndex(item => item.week === week);
      this.selectedTile.set(tileOfDay(index, dayIndex(week, date)));
      if (recenter) this.move({ type: 'jump', week, day: dayIndex(week, date) });
      this.writeSelectionQuery(week, includeDay ? date : null, replace);
      this.paint();
    } finally {
      if (id === this.navigationId) this.dateBusy.set(false);
    }
  }

  inspectItem(item: ReadingItem, week: string): void {
    const source = this.weeksOldest().find(row => row.week === week);
    const habit = source?.habits.find(row => item.id === `habit:${row.habit_id}`);
    const trip = source?.trips.find(row => item.id === `trip:${row.id}`);
    const selected = this.selectedDate();
    const sameWeek = !!selected && isoMonday(selected) === week;
    let occurrence = item.date || week;
    if (item.kind === 'budget') occurrence = addIsoDays(week, 6);
    else if (trip) {
      occurrence = sameWeek && selected >= trip.start && selected <= trip.end ? selected : trip.start;
    } else if (habit) {
      occurrence = sameWeek && habit.days.includes(selected) ? selected
        : habit.days.filter(day => day >= week && day <= addIsoDays(week, 6)).sort()[0] || week;
    }
    if (occurrence < week) occurrence = week;
    const visit = this.visitDate(occurrence, false, true, false);
    const id = this.navigationId;
    void visit.then(() => {
      if (this.disposed || id !== this.navigationId || this.selectedDate() !== occurrence) return;
      this.selectedItemId.set(item.id);
      this.choices.set([]);
      this.focusPanel();
      this.paint();
    });
  }

  itemKind(item: ReadingItem): string {
    return { habit: 'Habit', finished: 'Media', concept: 'Learning', trip: 'Travel', lit: 'Activity', budget: 'Weekly spending plan' }[item.kind];
  }

  itemDates(item: ReadingItem): string {
    if (item.kind !== 'habit') return item.date;
    const week = this.activeWeek();
    return week?.habits.find(habit => item.id === `habit:${habit.habit_id}`)?.days
      .filter(day => day >= week.week && day <= addIsoDays(week.week, 6)).sort().join(', ') ?? '';
  }

  itemReason(item: ReadingItem): string {
    if (item.id.startsWith('finished-more:')) return 'Additional completions are counted for this week. Their titles and exact dates are not included in this view.';
    switch (item.kind) {
      case 'habit': return 'This building represents recorded habit check-ins for this week. Its appearance reflects this week’s check-ins, not your current Town level.';
      case 'finished': return 'This keepsake marks a recorded completion in Media. The date comes from the saved completion.';
      case 'concept': return 'This beacon marks the date you recorded understanding this concept.';
      case 'trip': return 'This landscape follows a booked or completed trip. Its scenery is illustrative; the title, place and dates come from Travel.';
      default: return 'This is a weekly summary, separate from your daily activity.';
    }
  }

  sourceHref(item: ReadingItem): string | null {
    const id = item.id.split(':')[1];
    if (item.kind === 'finished' && /^\d+$/.test(id)) return `/media/item/${id}`;
    if (item.kind === 'trip' && /^\d+$/.test(id)) return `/travel/trips/${id}?day=${this.selectedDate()}`;
    if (item.kind === 'habit') return '/town';
    if (item.kind === 'budget') return this.chests().toolbar?.href ?? WORLD_COPY.reviewSpendingHref;
    if (item.id.startsWith('finished-more:')) return '/media/library';
    return null;
  }

  openConcepts(id?: number, create = false): void {
    this.conceptFocus.set(id ?? null);
    this.creatingConcept.set(create);
    this.conceptsOpen.set(true);
  }

  openCreate(): void {
    this.openConcepts(undefined, true);
  }

  closeConcepts(): void {
    this.conceptsOpen.set(false);
    this.creatingConcept.set(false);
  }

  onConceptChanged(change: ConceptChange): void {
    void this.applyConceptChange(change);
  }

  retry(): void {
    this.work.abort();
    this.work = new AbortController();
    this.error.set(null);
    this.placed = false;
    void this.boot();
  }

  retryTown(): void {
    const signal = this.work.signal;
    void this.api.getTown(signal).then(town => {
      if (signal.aborted) return;
      this.townData.set(town);
      this.townFailed.set(false);
      this.paint();
    }).catch(() => {
      if (!signal.aborted) this.townFailed.set(true);
    });
  }

  retryBudget(): void {
    const reload = this.controller.reloadBudget;
    if (!reload) return;
    const signal = this.work.signal;
    void reload.call(this.controller, signal).then(() => {
      if (signal.aborted) return;
      this.pull();
      this.paint();
    });
  }

  loadOlder(): void {
    void this.pageIfNeeded(true);
  }

  private async boot(): Promise<void> {
    const id = ++this.bootId;
    const signal = this.work.signal;
    this.busy.set(true);
    this.armSlow();
    try {
      this.applySavedFog();
      await this.controller.loadInitial(signal);
      if (signal.aborted || id !== this.bootId) return;
      this.pull();
      this.applySavedFog();
      await this.placeCamera();
      await this.loadDistrict(signal);
      if (signal.aborted || id !== this.bootId) return;
      await this.loadHealth(signal);
      if (signal.aborted || id !== this.bootId) return;
      this.error.set(this.view()?.error ?? null);
      await this.refreshArt();
      if (signal.aborted || id !== this.bootId) return;
      this.bitmaps = createBitmapCache();
      this.paint();
    } catch (error) {
      if (signal.aborted || id !== this.bootId) return;
      this.pull();
      this.error.set(this.view()?.error || problemMessage(error));
      this.paint();
    } finally {
      if (id === this.bootId) {
        this.busy.set(false);
        this.clearSlow();
      }
    }
  }

  private async applyConceptChange(change: ConceptChange): Promise<void> {
    if (this.disposed) return;
    if (change.id != null && change.name) {
      const id = change.id;
      const name = change.name;
      this.names.update(current => ({ ...current, [id]: name }));
    }
    const signal = this.work.signal;
    const edit: ConceptEdit = change.kind === 'weeks'
      ? { kind: 'weeks', weeks: change.weeks ?? [] }
      : { kind: change.kind };
    await this.controller.applyConceptEdit(edit, signal);
    if (signal.aborted || change.kind !== 'weeks') return;
    this.pull();
    await this.refreshArt();
    this.paint();
  }

  private async loadDistrict(signal: AbortSignal): Promise<void> {
    this.pull();
    if (signal.aborted) return;
    const status = this.view()?.townStatus;
    if (this.town() && status !== 'unavailable' && status !== 'failed') {
      this.townFailed.set(false);
      return;
    }
    if (status === 'unavailable' || status === 'failed') {
      this.townFailed.set(true);
      return;
    }
    try {
      const town = await this.api.getTown(signal);
      if (signal.aborted) return;
      this.townData.set(town);
      this.townFailed.set(false);
    } catch {
      if (!signal.aborted) this.townFailed.set(true);
    }
  }

  private async loadHealth(signal: AbortSignal): Promise<void> {
    const epoch = this.financeEpoch;
    try {
      const stages = await loadTownHealthStages(this.injector, signal);
      if (!signal.aborted && epoch === this.financeEpoch) this.health.set(stages);
    } catch {
      if (!signal.aborted && epoch === this.financeEpoch) this.health.set({ state: 'unavailable' });
    }
  }

  private onFinanceCleared(): void {
    if (this.disposed) return;
    this.financeEpoch += 1;
    this.controller.clearFinance();
    this.health.set({ state: 'locked' });
    if (this.selectedItemId()?.startsWith('budget:')) this.selectedItemId.set(null);
    this.pull();
    this.paint();
  }

  private applySavedFog(): void {
    const id = this.session.currentUser?.id;
    if (id == null) return;
    const enabled = readFogEnabled(id, localStorage);
    this.fogOn.set(enabled);
    this.controller.setFog(enabled);
  }

  private pull(): boolean {
    const before = this.weeksOldest().map(week => week.week);
    const snapshot = this.controller.snapshot();
    this.view.set({
      meta: snapshot?.meta ?? null,
      weeks: snapshot?.weeks ?? [],
      chunks: snapshot?.chunks ?? [],
      chests: snapshot?.chests ?? EMPTY_CHESTS,
      fog: snapshot?.fog ?? this.fogOn(),
      error: snapshot?.error ?? null,
      loading: snapshot?.loading ?? false,
      townStatus: snapshot?.townStatus,
      town: this.townData() ?? this.townFromController() ?? snapshot?.town ?? null,
    });
    this.error.set(snapshot?.error ?? null);
    const status = snapshot?.townStatus;
    if ((status === 'failed' || status === 'unavailable') && !this.townData()) this.townFailed.set(true);
    else if (this.view()?.town) this.townFailed.set(false);
    const added = prependedWeekCount(before, this.weeksOldest().map(week => week.week));
    if (added <= 0) return false;
    this.model = { x: this.model.x + added * CHUNK_W, reduced: this.reduced() };
    if (this.selectedTile() != null) this.selectedTile.update(tile => tile == null ? null : tile + added * CHUNK_W);
    this.publishCamera();
    return true;
  }

  private async placeCamera(): Promise<void> {
    if (this.placed || !this.view()?.meta) return;
    this.placed = true;
    await this.restoreQuery();
  }

  private async restoreQuery(): Promise<void> {
    const day = this.readDayQuery();
    const week = this.readWeekQuery();
    const validWeek = week && this.validDate(week);
    const date = day && this.validDate(day) ? day : validWeek ? isoMonday(week) : this.serverToday();
    await this.visitDate(date, true, day !== null || !validWeek);
  }

  private move(command: CameraCommand): void {
    const layout = this.layout();
    if (command.type === 'select-center') {
      this.model = cameraApi.apply(this.model, command, layout);
      this.paint();
      this.focusPanel();
      this.paint();
      return;
    }
    if (command.type === 'drag') {
      this.model = cameraApi.apply(this.model, command, layout);
      this.pendingDrag = true;
      this.moving = true;
      this.syncCenter();
      this.requestFrame();
      return;
    }
    this.model = cameraApi.apply(this.model, command, layout);
    this.moving = false;
    this.syncCenter();
    this.paint();
  }

  private requestFrame(): void {
    if (this.frameQueued || this.disposed) return;
    if (!shouldScheduleFrame(this.moving, this.dragging || this.pendingDrag)) return;
    this.frameQueued = true;
    this.raf = requestAnimationFrame(() => {
      this.frameQueued = false;
      this.zone.run(() => this.onFrame());
    });
  }

  private onFrame(): void {
    if (!this.dragging && Math.abs(this.velocity) > 0.02) {
      const factor = inertiaFactor(this.reduced());
      if (factor === 0) this.velocity = 0;
      else {
        this.model = cameraApi.apply(this.model, { type: 'drag', dxTiles: this.velocity }, this.layout());
        this.velocity *= factor;
        if (Math.abs(this.velocity) < 0.02) this.velocity = 0;
      }
    }
    const dragActive = this.dragging && this.pendingDrag;
    this.pendingDrag = false;
    const coasting = !this.dragging && Math.abs(this.velocity) > 0.02;
    this.moving = coasting;
    this.syncCenter();
    this.paint();
    if (shouldScheduleFrame(coasting, dragActive)) this.requestFrame();
  }

  private syncCenter(page = true): void {
    const layout = this.layout();
    if (!this.followingSelection) {
      const band = bandAt(this.model.x, layout.viewportTiles, layout.weeks);
      this.centerWeek.set(band.week);
      this.centerDay.set(band.day);
      this.inTown.set(band.inTown);
      if (!this.dragging && !this.moving && band.week && !band.inTown) {
        const date = addIsoDays(band.week, band.day);
        this.selectedDate.set(date);
        this.selectedItemId.set(null);
        this.choices.set([]);
        this.selectedTile.set(tileOfDay(layout.weeks.indexOf(band.week), band.day));
        this.writeSelectionQuery(band.week, date, true);
      }
    }
    this.publishCamera();
    if (page && !this.busy() && !this.dateBusy()) void this.pageIfNeeded();
  }

  private publishCamera(): void {
    (this.controller as ExplorerController & { cameraX?: number }).cameraX = this.model.x;
  }

  /** Page older history while the viewport is within four chunks of the loaded edge. */
  private async pageIfNeeded(force = false): Promise<void> {
    if (this.paging || this.dateBusy() || this.disposed || (!force && !shouldPage(this.model.x, 0)) || !this.canLoadOlder()) return;
    this.paging = true;
    this.historyBusy.set(true);
    const signal = this.work.signal;
    let shifted = false;
    try {
      await this.controller.pageOlder(signal, force);
      if (signal.aborted || this.disposed) return;
      shifted = this.pull();
      if (shifted) this.syncCenter(false);
      await this.refreshArt();
      if (!signal.aborted) this.paint();
    } finally {
      this.paging = false;
      this.historyBusy.set(false);
    }
    if (shifted && !force) await this.pageIfNeeded();
  }

  private readWeekQuery(): string | null {
    const path = this.location.path();
    const query = path.includes('?') ? path.slice(path.indexOf('?') + 1) : '';
    const week = new URLSearchParams(query).get('week');
    return week?.trim() ? week.trim() : null;
  }

  private readDayQuery(): string | null {
    const path = this.location.path();
    return new URLSearchParams(path.split('?')[1] ?? '').get('day');
  }

  private writeSelectionQuery(week: string, day: string | null, replace: boolean): void {
    const params = new URLSearchParams(this.location.path().split('?')[1] ?? '');
    params.set('week', week);
    if (day) params.set('day', day);
    else params.delete('day');
    const query = params.toString();
    if (this.location.path() === `/town/world?${query}`) return;
    if (replace) this.location.replaceState('/town/world', query);
    else this.location.go('/town/world', query);
  }

  private layout(): CameraLayout {
    const weeks = this.weeksOldest().map(week => week.week);
    const meta = this.view()?.meta;
    return {
      weekCount: weeks.length,
      viewportTiles: Math.max(1, this.viewportTiles()),
      startWeek: meta?.start_week ?? weeks[0] ?? '1970-01-05',
      currentWeek: meta?.current_week ?? weeks[weeks.length - 1] ?? '1970-01-05',
      weeks,
    };
  }

  private cssWidth(): number {
    const measured = this.stageRef()?.nativeElement.clientWidth ?? 0;
    return measured > 0 ? measured : 320;
  }

  private viewportTiles(): number {
    return this.cssWidth() / this.scaleNow();
  }

  private scaleNow(): number {
    return scaleForWidth(this.cssWidth());
  }

  private town(): TownResponse | null {
    return this.view()?.town ?? this.townData() ?? this.townFromController();
  }

  private townFromController(): TownResponse | null {
    const source = this.controller as ExplorerController & { town?: TownResponse | null };
    return source.town ?? null;
  }

  private occupiedSlots(town: TownResponse): string[] {
    const ids: string[] = [...FIXED_LOTS];
    for (const lot of town.lots ?? []) {
      if (lot.state === 'occupied') ids.push(`slot-${lot.slot}`);
    }
    return ids;
  }

  private district() {
    if (this.townFailed()) {
      return renderApi.districtPaint({
        founded: false,
        townFailed: true,
        level: 1,
        weeksKept: 0,
        vaultUnlocked: false,
        health: { state: 'unavailable' },
        occupiedSlots: [],
      });
    }
    const town = this.town();
    if (!town) return null;
    return renderApi.districtPaint({
      founded: town.town.founded_on !== null,
      townFailed: false,
      level: town.town.level,
      weeksKept: weeksKeptRun(town.habits),
      vaultUnlocked: financeVaultPresent(),
      health: this.health(),
      occupiedSlots: this.occupiedSlots(town),
    });
  }

  private artUrls(): string[] {
    const urls = WORLD_ART.map(id => worldSpriteUrl(id));
    for (const loaded of this.view()?.chunks ?? []) {
      for (const object of sceneObjects(loaded.chunk)) urls.push(object.sprite);
    }
    const district = this.district();
    if (!district) return urls;
    for (const lot of district.lots) if (lot.spriteUrl) urls.push(lot.spriteUrl);
    for (const npc of district.npcs) urls.push(npc.spriteUrl);
    return urls;
  }

  private async refreshArt(): Promise<void> {
    await this.atlas.ensure(this.artUrls());
    if (this.disposed) return;
    this.bitmaps = createBitmapCache();
  }

  private paint(): void {
    const canvas = this.canvasRef()?.nativeElement;
    if (!canvas || this.disposed) return;
    const cssWidth = Math.max(1, Math.floor(this.cssWidth()));
    const scale = this.scaleNow();
    const cssHeight = CHUNK_H * scale;
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const width = Math.round(cssWidth * dpr);
    const height = Math.round(cssHeight * dpr);
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    canvas.style.width = `${cssWidth}px`;
    canvas.style.height = `${cssHeight}px`;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
    const snap = this.view();
    const weeks = this.weeksOldest();
    if (!snap || weeks.length === 0) {
      ctx.clearRect(0, 0, cssWidth, cssHeight);
      return;
    }
    const theme = this.theme.resolved === 'dark' ? 'dark' : 'light';
    const viewport = cssWidth / scale;
    const first = Math.floor(this.model.x / CHUNK_W) - 1;
    const last = Math.floor((this.model.x + viewport) / CHUNK_W) + 1;
    const start = Math.max(0, first);
    const end = Math.min(weeks.length - 1, last);
    this.bitmaps.resetFrame();
    const budget = { left: 2 };
    const bitmaps: { originTile: number; source: CanvasImageSource }[] = [];
    const byWeek = new Map((snap.chunks ?? []).map(chunk => [chunk.week.week, chunk]));
    for (let index = start; index <= end; index += 1) {
      const loaded = byWeek.get(weeks[index].week);
      if (!loaded) continue;
      const key = bitmapKey(loaded.inputKey, scale, theme);
      let source = this.bitmaps.get(key);
      if (!source && budget.left > 0) {
        const bitmap = document.createElement('canvas');
        renderApi.renderChunkBitmap(bitmap as BitmapCanvas, loaded.chunk, this.atlas, scale, theme);
        if (this.bitmaps.put(key, bitmap, budget)) source = bitmap;
      }
      if (source) bitmaps.push({ originTile: tileOfDay(index, 0), source });
    }
    const fogTiles: { tile: number }[] = [];
    const futureTiles: { tile: number }[] = [];
    const meta = snap.meta;
    if (meta) {
      for (let index = start; index <= end; index += 1) {
        const loaded = byWeek.get(weeks[index].week);
        if (!loaded) continue;
        fogMask(loaded.chunk.lit ?? [], weeks[index].week, meta.current_week, meta.today).forEach((fog, day) => {
          const future = addIsoDays(weeks[index].week, day) > meta.today;
          for (let offset = 0; offset < BAND; offset += 1) {
            const entry = { tile: tileOfDay(index, day) + offset };
            if (future) futureTiles.push(entry);
            else if (this.fogOn() && !fog) fogTiles.push(entry);
          }
        });
      }
    }
    const chests: { tile: number; visual: 'sealed' | 'gold' | 'none' }[] = [];
    for (const chest of snap.chests?.weeks ?? []) {
      if (chest.visual === 'none') continue;
      const index = weeks.findIndex(week => week.week === chest.week);
      if (index < 0) continue;
      chests.push({ tile: tileOfDay(index, 0) + (byWeek.get(chest.week)?.chunk.chest.x ?? CHEST_X), visual: chest.visual });
    }
    renderApi.paintViewport(ctx as RenderContext, {
      scale,
      cameraX: this.model.x,
      viewportTiles: viewport,
      theme,
      bitmaps,
      fogTiles,
      chests,
      selectionTile: this.selectedTile(),
      selectionObject: this.selectedScene(),
      futureTiles,
      district: this.district(),
      districtOrigin: tileOfDay(weeks.length, 0),
      showPier: true,
      atlas: this.atlas,
    });
    const visibleCount = Math.max(0, end - start + 1);
    if (bitmaps.length < visibleCount) {
      this.pendingDrag = true;
      this.requestFrame();
    }
  }

  private selectAt(clientX: number, clientY: number): void {
    const rect = this.canvasRef()?.nativeElement.getBoundingClientRect();
    if (!rect || !this.view()?.meta || this.busy() || this.dateBusy()) return;
    const tile = this.model.x + (clientX - rect.left) / this.scaleNow();
    const y = (clientY - rect.top) / this.scaleNow();
    const weeks = this.weeksOldest();
    const index = Math.floor(tile / CHUNK_W);
    if (index >= weeks.length) {
      this.goTown();
      this.focusPanel();
      return;
    }
    if (index < 0) return;
    const week = weeks[index];
    const loaded = this.view()?.chunks.find(chunk => chunk.week.week === week.week);
    const objects = loaded ? hitObjects(sceneObjects(loaded.chunk), tile - index * CHUNK_W, y, 0.4) : [];
    const reading = readingWeek(week, this.chests().weeks.find(chest => chest.week === week.week));
    const matches = objects.flatMap(object => {
      if (object.id.startsWith('pile:')) return reading.items.filter(item => item.kind === 'concept' || item.kind === 'finished');
      const item = reading.items.find(row => row.id === object.id);
      return item ? [item] : [];
    }).filter((item, i, all) => all.findIndex(row => row.id === item.id) === i);
    const chest = this.chests().weeks.find(item => item.week === week.week);
    const chestX = loaded?.chunk.chest.x ?? CHEST_X;
    if (chest && chest.visual !== 'none' && tile - index * CHUNK_W >= chestX && tile - index * CHUNK_W <= chestX + 2 && y >= 14 && y <= 16) {
      matches.push({ id: `budget:${week.week}`, kind: 'budget', title: 'Weekly spending plan', detail: chest.line ?? 'Unlock Finance to view this week.', date: '' });
    }
    const day = Math.min(6, Math.max(0, Math.floor((tile - index * CHUNK_W) / BAND)));
    if (matches.length === 1) this.inspectItem(matches[0], week.week);
    else {
      const visit = this.visitDate(addIsoDays(week.week, day), false, true, false);
      const id = this.navigationId;
      void visit.then(() => {
        if (this.disposed || id !== this.navigationId) return;
        this.choices.set(matches);
        this.focusPanel();
      });
    }
  }

  private focusPanel(): void {
    queueMicrotask(() => this.panelRef()?.nativeElement.focus());
  }

  private bindStage(): void {
    const stage = this.stageRef()?.nativeElement;
    if (!stage) return;
    const move = (event: PointerEvent) => this.onPointerMove(event);
    const down = (event: PointerEvent) => this.onPointerDown(event);
    const up = (event: PointerEvent) => this.endPointer(event);
    const cancel = (event: PointerEvent) => this.endPointer(event, true);
    const wheel = (event: WheelEvent) => this.onWheel(event);
    stage.addEventListener('pointerdown', down);
    stage.addEventListener('pointermove', move);
    stage.addEventListener('pointerup', up);
    stage.addEventListener('pointercancel', cancel);
    stage.addEventListener('wheel', wheel, { passive: false });
    this.cleanups.push(() => {
      stage.removeEventListener('pointerdown', down);
      stage.removeEventListener('pointermove', move);
      stage.removeEventListener('pointerup', up);
      stage.removeEventListener('pointercancel', cancel);
      stage.removeEventListener('wheel', wheel);
    });
    if (typeof ResizeObserver !== 'undefined') {
      this.observer = new ResizeObserver(() => this.zone.run(() => {
        const date = this.selectedDate();
        if (this.inTown()) this.model = cameraApi.apply(this.model, { type: 'end' }, this.layout());
        else if (date && !this.dragging) {
          this.model = cameraApi.apply(this.model, { type: 'jump', week: isoMonday(date), day: dayIndex(isoMonday(date), date) }, this.layout());
        }
        this.paint();
      }));
      this.observer.observe(stage);
    }
    this.paint();
  }

  private onPointerDown(event: PointerEvent): void {
    if (this.mode() === 'list' || event.button !== 0 || this.pointer || this.busy() || this.dateBusy()) return;
    this.pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, lastX: event.clientX };
    this.velocity = 0;
    const target = event.currentTarget;
    if (target instanceof HTMLElement) {
      try { target.setPointerCapture(event.pointerId); } catch { /* synthetic events */ }
    }
  }

  private onPointerMove(event: PointerEvent): void {
    const active = this.pointer;
    if (!active || event.pointerId !== active.id) return;
    const distance = Math.hypot(event.clientX - active.x, event.clientY - active.y);
    if (!this.dragging) {
      if (isTap(distance)) return;
      this.dragging = true;
      this.followingSelection = false;
      this.selectedItemId.set(null);
      this.moving = true;
    }
    const dxTiles = -(event.clientX - active.lastX) / this.scaleNow();
    active.lastX = event.clientX;
    this.velocity = dxTiles;
    this.dragging = true;
    this.move({ type: 'drag', dxTiles });
  }

  private endPointer(event: PointerEvent, cancelled = false): void {
    const active = this.pointer;
    if (!active || event.pointerId !== active.id) return;
    const distance = Math.hypot(event.clientX - active.x, event.clientY - active.y);
    const wasDragging = this.dragging;
    this.pointer = null;
    this.dragging = false;
    this.pendingDrag = false;
    const target = event.currentTarget;
    if (target instanceof HTMLElement && target.hasPointerCapture?.(event.pointerId)) target.releasePointerCapture(event.pointerId);
    if (cancelled) {
      this.velocity = 0;
      this.moving = false;
      this.syncCenter();
      this.paint();
      return;
    }
    if (!wasDragging && isTap(distance)) {
      this.velocity = 0;
      this.moving = false;
      this.selectAt(event.clientX, event.clientY);
      return;
    }
    if (inertiaFactor(this.reduced()) === 0 || Math.abs(this.velocity) < 0.02) {
      this.velocity = 0;
      this.moving = false;
      this.syncCenter();
      this.paint();
      return;
    }
    this.moving = true;
    this.requestFrame();
  }

  private onWheel(event: WheelEvent): void {
    if (this.mode() === 'list') return;
    const delta = event.shiftKey ? event.deltaY : event.deltaX;
    if (!delta) return;
    event.preventDefault();
    this.followingSelection = false;
    this.velocity = 0;
    this.moving = true;
    this.move({ type: 'drag', dxTiles: delta / this.scaleNow() });
    this.moving = this.dragging;
  }

  private armSlow(): void {
    this.clearSlow();
    this.slowTimer = window.setTimeout(() => this.slow.set(true), 8000);
  }

  private clearSlow(): void {
    if (this.slowTimer) window.clearTimeout(this.slowTimer);
    this.slowTimer = 0;
    this.slow.set(false);
  }

  private shutdown(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.clearSlow();
    this.work.abort();
    this.dateWork.abort();
    cancelAnimationFrame(this.raf);
    this.observer?.disconnect();
    for (const cleanup of this.cleanups) cleanup();
    this.controller.dispose();
  }
}
