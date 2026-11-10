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
import { NavigationStart, Router } from '@angular/router';
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
  applyCamera,
  bandAt,
  bitmapKey,
  createBitmapCache,
  fogMask,
  inertiaFactor,
  isTap,
  litSummary,
  panDurationMs,
  prefersReducedMotion,
  prependedWeekCount,
  readFogEnabled,
  readingForWeeks,
  readingWeek,
  scaleForWidth,
  shouldPage,
  shouldScheduleFrame,
  snapWeek,
  tileOfDay,
  writeFogEnabled,
  type BitmapCache,
  type CameraLayout,
  type CameraModel,
  type ConceptEdit,
} from '../logic';
import { SpriteAtlas, worldSpriteUrl } from '../render/atlas';
import {
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
  imports: [UiButtonComponent, UiEmptyStateComponent, ConceptSheetComponent],
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
  private painted = false;
  private dragging = false;
  private moving = false;
  private pendingDrag = false;
  private velocity = 0;
  private frameQueued = false;
  private raf = 0;
  private bootId = 0;
  private slowTimer = 0;
  private paging = false;
  private pointer: { id: number; x: number; y: number; lastX: number } | null = null;
  private anim: { from: number; to: number; start: number; dur: number } | null = null;
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
    const week = this.centerWeek();
    const snap = this.view();
    if (!week || !snap || this.inTown()) return null;
    const source = this.weeksOldest().find(item => item.week === week);
    if (!source) return null;
    const chest = snap.chests?.weeks?.find(item => item.week === week) ?? null;
    return readingWeek(source, chest);
  });

  readonly liveText = computed(() => {
    if (!this.view()) return '';
    if (this.inTown()) return WORLD_COPY.town;
    const reading = this.centerReading();
    if (!reading) return '';
    const count = reading.items.length;
    return `${reading.label}. ${count === 1 ? '1 item' : `${count} items`}.`;
  });

  readonly litText = computed(() => {
    const snap = this.view();
    if (!snap?.meta) return '';
    const weeks = this.weeksOldest();
    const rows = (snap.chunks ?? []).map(chunk => ({ week: chunk.week.week, lit: chunk.chunk.lit ?? [] }));
    const oldest = weeks[0]?.week ?? snap.meta.start_week;
    const summary = litSummary(rows, snap.meta.start_week, oldest <= snap.meta.start_week);
    const text = WORLD_COPY.litSummary(summary.lit, summary.total, summary.since);
    return summary.partial ? `${text} ${WORLD_COPY.loadedWeeks}` : text;
  });

  readonly showEmpty = computed(() => {
    if (this.busy() || this.error() || !this.view()) return false;
    return this.readings().every(week => week.items.length === 0);
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
      this.work.abort();
      this.work = new AbortController();
      this.onFinanceCleared();
    });
    this.destroyRef.onDestroy(bindLockNotices(() => this.onFinanceCleared()));
    this.router.events.pipe(
      filter((event): event is NavigationStart => event instanceof NavigationStart),
      takeUntilDestroyed(),
    ).subscribe(event => {
      const path = event.url.split(/[?#]/)[0];
      if (path !== '/town/world') this.shutdown();
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
    this.move({ type: 'week', delta });
  }

  goToday(): void {
    const meta = this.view()?.meta;
    if (!meta) return;
    const week = snapWeek(meta.today, meta.start_week, meta.current_week);
    const offset = dayIndex(week, meta.today);
    const day = offset >= 0 && offset < 7 ? offset : 0;
    this.move({ type: 'jump', week, day });
  }

  onJump(event: Event): void {
    const value = event.target instanceof HTMLInputElement ? event.target.value : '';
    const meta = this.view()?.meta;
    if (!value || !meta) return;
    this.move({ type: 'jump', week: snapWeek(value, meta.start_week, meta.current_week), day: 0 });
  }

  onKey(event: KeyboardEvent): void {
    const command = commandForKey(event);
    if (!command) return;
    event.preventDefault();
    this.move(command);
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
    const signal = this.work.signal;
    void this.controller.pageOlder(signal, true).then(() => {
      if (signal.aborted) return;
      const shifted = this.pull();
      if (shifted) this.syncCenter(false);
      this.paint();
    });
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
      this.placeCamera();
      await this.loadDistrict(signal);
      if (signal.aborted || id !== this.bootId) return;
      await this.loadHealth(signal);
      if (signal.aborted || id !== this.bootId) return;
      this.error.set(this.view()?.error ?? null);
      await this.atlas.ensure(this.artUrls());
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
    try {
      const stages = await loadTownHealthStages(this.injector, signal);
      if (!signal.aborted) this.health.set(stages);
    } catch {
      if (!signal.aborted) this.health.set({ state: 'unavailable' });
    }
  }

  private onFinanceCleared(): void {
    this.controller.clearFinance();
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
    const status = snapshot?.townStatus;
    if ((status === 'failed' || status === 'unavailable') && !this.townData()) this.townFailed.set(true);
    else if (this.view()?.town) this.townFailed.set(false);
    const added = prependedWeekCount(before, this.weeksOldest().map(week => week.week));
    if (added <= 0) return false;
    this.model = { x: this.model.x + added * CHUNK_W, reduced: this.reduced() };
    this.publishCamera();
    return true;
  }

  private placeCamera(): void {
    if (this.placed) return;
    const meta = this.view()?.meta;
    if (!meta) return;
    this.placed = true;
    const raw = this.readWeekQuery();
    if (raw) {
      const snapped = snapWeek(raw, meta.start_week, meta.current_week);
      this.move({ type: 'jump', week: snapped, day: 0 }, true);
      this.writeWeekQuery(snapped);
      return;
    }
    this.move({ type: 'end' }, true);
  }

  private move(command: CameraCommand, instant = false): void {
    const layout = this.layout();
    if (command.type === 'select-center') {
      this.model = cameraApi.apply(this.model, command, layout);
      const band = bandAt(this.model.x, layout.viewportTiles, layout.weeks);
      const index = Math.max(0, layout.weeks.indexOf(band.week));
      this.selectedTile.set(tileOfDay(index, band.day));
      this.syncCenter();
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
    const next = cameraApi.apply(this.model, command, layout);
    const duration = instant ? 0 : panDurationMs(this.reduced());
    if (duration === 0 || next.x === this.model.x) {
      this.anim = null;
      this.model = { x: next.x, reduced: this.reduced() };
      this.moving = false;
      this.syncCenter();
      this.paint();
      return;
    }
    this.anim = { from: this.model.x, to: next.x, start: performance.now(), dur: duration };
    this.moving = true;
    this.requestFrame();
  }

  private requestFrame(): void {
    if (this.frameQueued || this.disposed) return;
    if (!shouldScheduleFrame(this.moving, this.dragging || this.pendingDrag)) return;
    this.frameQueued = true;
    this.raf = requestAnimationFrame(now => {
      this.frameQueued = false;
      this.zone.run(() => this.onFrame(now));
    });
  }

  private onFrame(now: number): void {
    if (this.anim) {
      const t = this.anim.dur <= 0 ? 1 : Math.min(1, (now - this.anim.start) / this.anim.dur);
      this.model = {
        x: this.anim.from + (this.anim.to - this.anim.from) * t,
        reduced: this.reduced(),
      };
      if (t >= 1) this.anim = null;
    } else if (!this.dragging && Math.abs(this.velocity) > 0.02) {
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
    const coasting = this.anim != null || (!this.dragging && Math.abs(this.velocity) > 0.02);
    this.moving = coasting;
    this.syncCenter();
    this.paint();
    if (shouldScheduleFrame(coasting, dragActive)) this.requestFrame();
  }

  private syncCenter(page = true): void {
    const layout = this.layout();
    const band = bandAt(this.model.x, layout.viewportTiles, layout.weeks);
    const changed = band.week !== this.centerWeek() || band.day !== this.centerDay() || band.inTown !== this.inTown();
    this.centerWeek.set(band.week);
    this.centerDay.set(band.day);
    this.inTown.set(band.inTown);
    if (changed && band.week && !band.inTown) this.writeWeekQuery(band.week);
    this.publishCamera();
    if (page) void this.pageIfNeeded();
  }

  private publishCamera(): void {
    (this.controller as ExplorerController & { cameraX?: number }).cameraX = this.model.x;
  }

  /** Page older history while the viewport is within four chunks of the loaded edge. */
  private async pageIfNeeded(): Promise<void> {
    if (this.paging || this.disposed || !shouldPage(this.model.x, 0) || !this.canLoadOlder()) return;
    this.paging = true;
    const signal = this.work.signal;
    let shifted = false;
    try {
      await this.controller.pageOlder(signal);
      if (signal.aborted || this.disposed) return;
      shifted = this.pull();
      if (shifted) this.syncCenter(false);
      this.paint();
    } finally {
      this.paging = false;
    }
    if (shifted) await this.pageIfNeeded();
  }

  private readWeekQuery(): string | null {
    const path = this.location.path();
    const query = path.includes('?') ? path.slice(path.indexOf('?') + 1) : '';
    const week = new URLSearchParams(query).get('week');
    return week?.trim() ? week.trim() : null;
  }

  private writeWeekQuery(week: string): void {
    const meta = this.view()?.meta;
    if (!meta) return;
    const snapped = snapWeek(week, meta.start_week, meta.current_week);
    if (this.readWeekQuery() === snapped) return;
    this.location.replaceState('/town/world', `week=${snapped}`);
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

  private scaleNow(): 2 | 3 {
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
    const district = this.district();
    if (!district) return urls;
    for (const lot of district.lots) if (lot.spriteUrl) urls.push(lot.spriteUrl);
    for (const npc of district.npcs) urls.push(npc.spriteUrl);
    return urls;
  }

  private paint(): void {
    const canvas = this.canvasRef()?.nativeElement;
    if (!canvas || this.disposed) return;
    const cssWidth = Math.max(1, Math.floor(this.cssWidth()));
    const scale = this.scaleNow();
    const cssHeight = CHUNK_H * scale;
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    canvas.width = Math.round(cssWidth * dpr);
    canvas.height = Math.round(cssHeight * dpr);
    canvas.style.width = `${cssWidth}px`;
    canvas.style.height = `${cssHeight}px`;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
    const snap = this.view();
    const weeks = this.weeksOldest();
    if (!snap || weeks.length === 0) {
      if (this.painted) return;
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
    const meta = snap.meta;
    if (this.fogOn() && meta) {
      for (let index = start; index <= end; index += 1) {
        const loaded = byWeek.get(weeks[index].week);
        if (!loaded) continue;
        fogMask(loaded.chunk.lit ?? [], weeks[index].week, meta.current_week, meta.today).forEach((fog, day) => {
          if (!fog) return;
          for (let offset = 0; offset < BAND; offset += 1) fogTiles.push({ tile: tileOfDay(index, day) + offset });
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
      district: this.district(),
      districtOrigin: tileOfDay(weeks.length, 0),
      showPier: true,
      atlas: this.atlas,
    });
    this.painted = true;
  }

  private conceptAt(tile: number): number | null {
    const weeks = this.layout().weeks;
    const index = Math.floor(tile / CHUNK_W);
    if (index < 0 || index >= weeks.length) return null;
    const loaded = (this.view()?.chunks ?? []).find(chunk => chunk.week.week === weeks[index]);
    if (!loaded) return null;
    const local = tile - index * CHUNK_W;
    for (const prop of loaded.chunk.props) {
      if (prop.k === 'concept' && local >= prop.x && local < prop.x + 2) return prop.id;
    }
    return null;
  }

  private selectAt(clientX: number): void {
    const rect = this.canvasRef()?.nativeElement.getBoundingClientRect();
    const local = rect ? clientX - rect.left : 0;
    const tile = this.model.x + local / this.scaleNow();
    const concept = this.conceptAt(tile);
    if (concept != null) {
      this.openConcepts(concept);
      return;
    }
    const layout = this.layout();
    const index = Math.min(Math.max(layout.weeks.length - 1, 0), Math.max(0, Math.floor(tile / CHUNK_W)));
    const day = Math.min(6, Math.max(0, Math.floor((tile - index * CHUNK_W) / BAND)));
    this.selectedTile.set(layout.weeks.length ? tileOfDay(index, day) : null);
    this.focusPanel();
    this.paint();
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
    const wheel = (event: WheelEvent) => this.onWheel(event);
    stage.addEventListener('pointerdown', down);
    stage.addEventListener('pointermove', move);
    stage.addEventListener('pointerup', up);
    stage.addEventListener('pointercancel', up);
    stage.addEventListener('wheel', wheel, { passive: false });
    this.cleanups.push(() => {
      stage.removeEventListener('pointerdown', down);
      stage.removeEventListener('pointermove', move);
      stage.removeEventListener('pointerup', up);
      stage.removeEventListener('pointercancel', up);
      stage.removeEventListener('wheel', wheel);
    });
    if (typeof ResizeObserver !== 'undefined') {
      this.observer = new ResizeObserver(() => this.zone.run(() => this.paint()));
      this.observer.observe(stage);
    }
    this.paint();
  }

  private onPointerDown(event: PointerEvent): void {
    if (event.button !== 0) return;
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
      this.moving = true;
      active.lastX = event.clientX;
    }
    const dxTiles = -(event.clientX - active.lastX) / this.scaleNow();
    active.lastX = event.clientX;
    this.velocity = dxTiles;
    this.dragging = true;
    this.move({ type: 'drag', dxTiles });
  }

  private endPointer(event: PointerEvent): void {
    const active = this.pointer;
    if (!active || event.pointerId !== active.id) return;
    const distance = Math.hypot(event.clientX - active.x, event.clientY - active.y);
    const wasDragging = this.dragging;
    this.pointer = null;
    this.dragging = false;
    this.pendingDrag = false;
    if (!wasDragging && isTap(distance)) {
      this.velocity = 0;
      this.moving = false;
      this.selectAt(event.clientX);
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
    const delta = event.shiftKey ? event.deltaY : event.deltaX;
    if (!delta) return;
    event.preventDefault();
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
    cancelAnimationFrame(this.raf);
    this.observer?.disconnect();
    for (const cleanup of this.cleanups) cleanup();
    this.controller.dispose();
  }
}
