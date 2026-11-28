import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, afterNextRender, computed, inject, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { EMPTY, Subject, catchError, distinctUntilChanged, map, of, startWith, switchMap } from 'rxjs';
import { ReturnContext, ThemeService, UiButtonComponent } from '@vivek/ui';
import { SessionService } from '../platform/session.service';
import { HabitDialogComponent } from './habit-dialog.component';
import { hallObjects, hallRoom, type HallRoomAsset } from './hall-room.assets';
import { HALL_RULES_VERSION, habitProgressLine, hallProgressLine, hallRules } from './hall-rules';
import { HistoryDialogComponent } from './history-dialog.component';
import {
  REST_CAMERA,
  SCENE_SCALES,
  cameraFromQuery,
  clampCamera,
  frontObject,
  movedPastSlop,
  occludingIds,
  panCamera,
  sameCamera,
  sceneQuery,
  screenToRoom,
  zoomToward,
  type SceneCamera,
} from './library-room.scene';
import { TownApiService } from './town.api';
import { TownPlaceComponent, type PlaceCrumb } from './town-place.component';
import { formatTownDay } from './town-text';
import type { TownResponse } from './town.types';

interface SceneGesture {
  id: number;
  startX: number;
  startY: number;
  origin: SceneCamera;
  owner: number | null;
  moved: boolean;
}

interface TownLoad {
  owner: number;
  data: TownResponse | null;
  failed: boolean;
}

function positiveId(value: string | null): number | null {
  if (value == null || !/^[1-9]\d{0,15}$/.test(value)) return null;
  return Number(value);
}

@Component({
  selector: 'app-town-hall',
  imports: [NgTemplateOutlet, RouterLink, UiButtonComponent, TownPlaceComponent, HabitDialogComponent, HistoryDialogComponent],
  templateUrl: './hall-room.component.html',
  styleUrls: ['./library-room.component.css', './hall-room.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown.escape)': 'onEscape()' },
})
export class HallRoomComponent {
  private readonly api = inject(TownApiService);
  private readonly session = inject(SessionService);
  private readonly router = inject(Router);
  private readonly returns = inject(ReturnContext);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly themeService = inject(ThemeService);
  private readonly route = inject(ActivatedRoute);
  private readonly retry = new Subject<void>();
  private readonly viewport = viewChild<ElementRef<HTMLElement>>('viewport');
  private readonly attempts = signal<Partial<Record<HallRoomAsset['id'], number>>>({});
  private resizeObserver: ResizeObserver | null = null;
  private gesture: SceneGesture | null = null;
  private owner: number | null = null;
  private alive = true;
  protected readonly painted = signal<readonly HallRoomAsset['id'][]>([]);
  protected readonly failed = signal<readonly HallRoomAsset['id'][]>([]);
  protected readonly room = hallRoom;
  protected readonly objects = hallObjects;
  protected readonly rules = hallRules();
  protected readonly rulesVersion = HALL_RULES_VERSION;
  protected readonly formatTownDay = formatTownDay;
  protected readonly habitProgressLine = habitProgressLine;
  protected readonly hallProgressLine = hallProgressLine;
  protected readonly camera = signal<SceneCamera>(REST_CAMERA);
  protected readonly narrow = signal(false);
  protected readonly data = signal<TownResponse | null>(null);
  protected readonly loadState = signal<'loading' | 'ready' | 'unavailable' | 'stale'>('loading');
  protected readonly cameraTransform = computed(() => {
    const camera = this.camera();
    return `translate(${camera.x}px, ${camera.y}px) scale(${camera.scale})`;
  });
  protected readonly theme = toSignal(this.themeService.theme$, { requireSync: true });
  private readonly params = toSignal(this.route.queryParamMap, { requireSync: true });
  protected readonly selected = computed(() => this.objects.find(object => object.asset.id === this.params().get('object')));
  protected readonly sheet = computed(() => this.narrow() && this.selected() != null);
  /** Desktop keeps the adjacent inspector. Phone renders it only after a selection. */
  protected readonly inspectorOpen = computed(() => !this.narrow() || this.selected() != null);
  protected readonly occluded = computed(() => new Set(occludingIds(this.objects, this.selected()?.asset.id ?? null)));
  protected readonly crumbs = computed((): readonly PlaceCrumb[] => {
    const object = this.selected();
    const roomCrumb: PlaceCrumb = object
      ? { label: 'Hall', href: '/town/hall', query: this.viewQuery(null) }
      : { label: 'Hall' };
    return object ? [roomCrumb, { label: object.label }] : [roomCrumb];
  });
  protected readonly editHabit = computed(() => {
    const data = this.data();
    const id = positiveId(this.params().get('edit'));
    if (!data || id == null) return null;
    return data.habits.find(habit => habit.id === id) ?? null;
  });
  protected readonly historyOpen = computed(() => {
    if (this.editHabit()) return false;
    const data = this.data();
    const id = positiveId(this.params().get('history'));
    if (!data || id == null) return false;
    return data.habits.some(habit => habit.id === id) || data.archived.some(habit => habit.id === id);
  });
  protected readonly statusText = computed(() => {
    const state = this.loadState();
    if (state === 'loading' && this.data() == null) return 'Loading Hall…';
    if (state === 'unavailable' || state === 'stale') return 'Town is unavailable right now.';
    return '';
  });

  protected reviewSource(): Record<string, unknown> {
    return this.returns.link(this.router.url);
  }

  constructor() {
    this.camera.set(cameraFromQuery(this.route.snapshot.queryParamMap));
    const destroyRef = inject(DestroyRef);
    const media = typeof matchMedia === 'function' ? matchMedia('(max-width: 799px)') : null;
    if (media) {
      this.narrow.set(media.matches);
      const onNarrow = (): void => this.narrow.set(media.matches);
      media.addEventListener('change', onNarrow);
      destroyRef.onDestroy(() => media.removeEventListener('change', onNarrow));
    }
    destroyRef.onDestroy(() => {
      this.alive = false;
      this.gesture = null;
      this.resizeObserver?.disconnect();
    });
    this.session.user$.pipe(
      map(user => user?.id ?? null),
      distinctUntilChanged(),
      switchMap(owner => {
        this.owner = owner;
        this.dropUncommittedGesture();
        // A previous owner's habits and an open draft leave with the owner.
        this.data.set(null);
        this.loadState.set(owner == null ? 'unavailable' : 'loading');
        if (owner == null) return EMPTY;
        return this.retry.pipe(
          startWith(undefined),
          switchMap(() => this.api.getTown().pipe(
            map(data => ({ owner, data, failed: false })),
            catchError(() => of({ owner, data: null, failed: true })),
          )),
        );
      }),
      takeUntilDestroyed(),
    ).subscribe(result => this.publishTown(result));
    afterNextRender(() => {
      if (!this.params().get('edit') && !this.params().get('history')) {
        this.host.nativeElement.querySelector<HTMLElement>('.objects [aria-current="true"]')?.focus({ preventScroll: true });
      }
      const element = this.viewport()?.nativeElement;
      if (!element || typeof ResizeObserver === 'undefined') return;
      this.resizeObserver = new ResizeObserver(() => {
        if (!this.alive) return;
        const size = this.viewportSize();
        if (size.width <= 0 || size.height <= 0) return;
        const next = clampCamera(this.camera(), size);
        if (!sameCamera(next, this.camera())) this.camera.set(next);
      });
      this.resizeObserver.observe(element);
    });
  }

  protected rulesNote(): string | null {
    const data = this.data();
    if (!data || data.constants_version === this.rulesVersion) return null;
    return `Town reported rules version ${data.constants_version}. This Hall explains version ${this.rulesVersion}.`;
  }

  protected danglingEdit(): boolean {
    return this.data() != null && this.params().get('edit') != null && this.editHabit() == null;
  }

  protected danglingHistory(): boolean {
    const history = this.params().get('history');
    return this.data() != null && history != null && !this.editHabit() && !this.historyOpen();
  }

  protected atMaxZoom(): boolean {
    return this.camera().scale >= SCENE_SCALES[SCENE_SCALES.length - 1];
  }

  protected atMinZoom(): boolean {
    return this.camera().scale <= SCENE_SCALES[0];
  }

  protected zoomIn(): void {
    this.applyCamera(zoomToward(this.camera(), this.viewportSize(), 1));
  }

  protected zoomOut(): void {
    this.applyCamera(zoomToward(this.camera(), this.viewportSize(), -1));
  }

  protected resetView(): void {
    this.applyCamera(REST_CAMERA);
  }

  protected faded(id: string): boolean {
    return this.occluded().has(id);
  }

  protected linkQuery(id: string): Record<string, string | null> {
    return this.viewQuery(id);
  }

  protected editQuery(id: number): Record<string, string | null> {
    return { ...sceneQuery(this.selected()?.asset.id ?? 'progress', this.camera()), edit: String(id), history: null };
  }

  protected historyQuery(id: number): Record<string, string | null> {
    return { ...sceneQuery(this.selected()?.asset.id ?? 'archive', this.camera()), edit: null, history: String(id) };
  }

  protected reload(): void {
    if (!this.alive || this.owner == null) return;
    if (this.data() == null) this.loadState.set('loading');
    this.retry.next();
  }

  protected closeEdit(changed: boolean): void {
    const id = this.params().get('edit');
    this.publish(this.closedQuery(), () => this.focusLink('edit', id));
    if (changed) this.reload();
  }

  protected closeHistory(changed: boolean): void {
    const id = this.params().get('history');
    this.publish(this.closedQuery(), () => this.focusLink('history', id));
    if (changed) this.reload();
  }

  protected closeSheet(): void {
    const id = this.selected()?.asset.id ?? null;
    this.publish(this.viewQuery(null), () => this.focusObject(id));
  }

  protected onEscape(): void {
    if (!this.sheet() || document.querySelector('[role="dialog"][aria-modal="true"]')) return;
    // A committed pan stays in the URL. Escape only undoes a drag that has not been published.
    if (this.gesture) this.cancelPointer();
    this.closeSheet();
  }

  protected beginPointer(event: PointerEvent): void {
    if (!this.alive || event.button !== 0 || this.gesture) return;
    const viewport = event.currentTarget;
    if (!(viewport instanceof HTMLElement)) return;
    this.gesture = {
      id: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      origin: this.camera(),
      owner: this.owner,
      moved: false,
    };
    event.preventDefault();
    try {
      viewport.setPointerCapture(event.pointerId);
    } catch {
      // Synthetic events in tests have no active pointer. The element still receives the gesture.
    }
  }

  protected movePointer(event: PointerEvent): void {
    const gesture = this.gesture;
    if (!gesture || event.pointerId !== gesture.id) return;
    const dx = event.clientX - gesture.startX;
    const dy = event.clientY - gesture.startY;
    if (!gesture.moved && !movedPastSlop(dx, dy)) return;
    gesture.moved = true;
    this.camera.set(panCamera(gesture.origin, this.viewportSize(), dx, dy));
  }

  protected endPointer(event: PointerEvent): void {
    const gesture = this.gesture;
    if (!gesture || event.pointerId !== gesture.id) return;
    this.gesture = null;
    if (gesture.moved) {
      if (this.alive && this.owner === gesture.owner) this.applyCamera(this.camera());
      return;
    }
    if (!this.alive || this.owner !== gesture.owner) return;
    const element = this.viewport()?.nativeElement;
    if (!element) return;
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const point = screenToRoom(
      { x: event.clientX - rect.left, y: event.clientY - rect.top },
      this.camera(),
      { width: rect.width, height: rect.height },
      hallRoom.bounds,
    );
    const visible = this.objects.filter(object => this.painted().includes(object.asset.id));
    const hit = frontObject(visible, point);
    if (hit) this.selectObject(hit.asset.id);
  }

  protected cancelPointer(): void {
    const gesture = this.gesture;
    if (!gesture) return;
    const viewport = this.viewport()?.nativeElement;
    try {
      if (viewport?.hasPointerCapture(gesture.id)) viewport.releasePointerCapture(gesture.id);
    } catch {
      // The cancelled pointer is already gone.
    }
    this.camera.set(gesture.origin);
    this.gesture = null;
  }

  protected artUrl(asset: HallRoomAsset): string {
    const attempt = this.attempts()[asset.id];
    return attempt ? `${asset.src}?retry=${attempt}` : asset.src;
  }

  protected artLoaded(asset: HallRoomAsset): void {
    this.painted.update(painted => painted.includes(asset.id) ? painted : [...painted, asset.id]);
  }

  protected artFailed(asset: HallRoomAsset): void {
    this.failed.update(failed => failed.includes(asset.id) ? failed : [...failed, asset.id]);
  }

  protected retryArt(): void {
    this.attempts.update(attempts => {
      const next = { ...attempts };
      for (const id of this.failed()) next[id] = (next[id] ?? 0) + 1;
      return next;
    });
    this.failed.set([]);
    const objects = this.host.nativeElement.querySelector('.objects');
    (objects?.querySelector<HTMLElement>('[aria-current="true"]') ?? objects?.querySelector('a'))?.focus();
  }

  private publishTown(result: TownLoad): void {
    if (!this.alive || result.owner !== this.owner) return;
    if (result.failed || result.data == null) {
      this.loadState.set(this.data() == null ? 'unavailable' : 'stale');
      return;
    }
    this.data.set(result.data);
    this.loadState.set('ready');
  }

  private dropUncommittedGesture(): void {
    const gesture = this.gesture;
    if (!gesture) return;
    this.camera.set(gesture.origin);
    this.gesture = null;
  }

  private applyCamera(next: SceneCamera): void {
    const size = this.viewportSize();
    const clamped = size.width > 0 && size.height > 0 ? clampCamera(next, size) : next;
    const camera = {
      scale: clamped.scale,
      x: Math.round(clamped.x * 100) / 100,
      y: Math.round(clamped.y * 100) / 100,
    };
    if (sameCamera(camera, this.camera())) return;
    this.camera.set(camera);
    this.publish(this.viewQuery(this.selected()?.asset.id ?? null, camera));
  }

  private viewQuery(objectId: string | null, camera = this.camera()): Record<string, string | null> {
    const params = this.params();
    return { ...sceneQuery(objectId, camera), edit: params.get('edit'), history: params.get('history') };
  }

  private closedQuery(): Record<string, string | null> {
    return { ...sceneQuery(this.selected()?.asset.id ?? null, this.camera()), edit: null, history: null };
  }

  private publish(query: Record<string, string | null>, after?: () => void): void {
    if (!this.alive) return;
    const owner = this.owner;
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: query,
      replaceUrl: true,
      scroll: 'manual',
    }).then(() => {
      if (!this.alive || this.owner !== owner) return;
      after?.();
    });
  }

  private focusObject(id: string | null): void {
    const link = id ? [...this.host.nativeElement.querySelectorAll<HTMLElement>('.objects [data-object]')]
      .find(item => item.dataset['object'] === id) : null;
    (link ?? this.host.nativeElement.querySelector<HTMLElement>('.objects a'))?.focus();
  }

  private focusLink(kind: 'edit' | 'history', id: string | null): void {
    const link = id ? this.host.nativeElement.querySelector<HTMLElement>(`[data-${kind}="${CSS.escape(id)}"]`) : null;
    (link ?? this.host.nativeElement.querySelector<HTMLElement>('.objects a'))?.focus();
  }

  private selectObject(id: string): void {
    if (!this.alive) return;
    this.publish(this.viewQuery(id), () => this.focusObject(id));
  }

  private viewportSize(): { width: number; height: number } {
    const element = this.viewport()?.nativeElement;
    if (!element) return { width: 0, height: 0 };
    const rect = element.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  }
}
