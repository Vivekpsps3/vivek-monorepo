import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, afterNextRender, computed, inject, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { EMPTY, Subject, catchError, distinctUntilChanged, map, of, startWith, switchMap } from 'rxjs';
import { ThemeService, UiButtonComponent } from '@vivek/ui';
import { SessionService } from '../platform/session.service';
import { cosmeticById, variantSrc, type CosmeticPart } from './cosmetic-catalog';
import {
  HOME_NOTE_LIMIT,
  HOME_ROOMS,
  homeLayoutProblems,
  homeObjects,
  homeRoom,
  homeSceneObjects,
  wallSlotLine,
  type HomeRoom,
  type HomeSceneObject,
} from './home-rooms';
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
import { homeLayoutWrite, type HomePalette } from './home-layout';
import { TownApiService, type RoomLayout } from './town.api';
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

interface LayoutLoad {
  owner: number;
  roomId: string;
  epoch: number;
  data: RoomLayout | null;
  failed: boolean;
}

@Component({
  selector: 'app-town-home',
  imports: [RouterLink, UiButtonComponent, TownPlaceComponent],
  templateUrl: './home-room.component.html',
  styleUrls: ['./library-room.component.css', './home-room.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:keydown.escape)': 'onEscape()',
    '[attr.data-home-room]': 'room()?.id ?? "missing"',
  },
})
export class HomeRoomComponent {
  private readonly api = inject(TownApiService);
  private readonly session = inject(SessionService);
  private readonly router = inject(Router);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly themeService = inject(ThemeService);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly retry = new Subject<void>();
  private readonly layoutRequest = new Subject<void>();
  private readonly viewport = viewChild<ElementRef<HTMLElement>>('viewport');
  private readonly attempts = signal<Partial<Record<string, number>>>({});
  private readonly notes = new Map<number, string>();
  private readonly gardens = new Map<number, ReadonlySet<string>>();
  private resizeObserver: ResizeObserver | null = null;
  private gesture: SceneGesture | null = null;
  private owner: number | null = null;
  private alive = true;

  protected readonly rooms = HOME_ROOMS;
  protected readonly layoutReady = homeLayoutProblems().length === 0;
  protected readonly painted = signal<readonly string[]>([]);
  protected readonly failed = signal<readonly string[]>([]);
  protected readonly note = signal('');
  protected readonly signedIn = signal(false);
  protected readonly watered = signal<ReadonlySet<string>>(new Set());
  protected readonly town = signal<TownResponse | null>(null);
  protected readonly townState = signal<'loading' | 'ready' | 'unavailable'>('loading');
  protected readonly palettes = [0, 1, 2, 3] as const;
  protected readonly palette = signal<HomePalette>(0);
  protected readonly layoutRevision = signal(0);
  protected readonly layoutStatus = signal('');
  protected readonly layoutLoading = signal(false);
  protected readonly layoutBusy = signal(false);
  private layoutEpoch = 0;
  private loadedKey = '';
  protected readonly camera = signal<SceneCamera>(REST_CAMERA);
  private readonly narrow = signal(false);
  protected readonly lotSlots = [0, 1, 2, 3, 4, 5];
  protected readonly theme = toSignal(this.themeService.theme$, { requireSync: true });
  private readonly params = toSignal(this.route.paramMap, { requireSync: true });
  private readonly query = toSignal(this.route.queryParamMap, { requireSync: true });
  protected readonly room = computed(() => homeRoom(this.params().get('room')));
  protected readonly objects = computed(() => {
    const room = this.room();
    return room ? homeSceneObjects(room.id) : [];
  });
  protected readonly selected = computed(() => this.objects().find(object => object.id === this.query().get('object')) ?? null);
  protected readonly sheet = computed(() => this.narrow() && this.selected() != null);
  protected readonly occluded = computed(() => new Set(occludingIds(this.objects(), this.selected()?.id ?? null)));
  protected readonly cameraTransform = computed(() => {
    const camera = this.camera();
    return `translate(${camera.x}px, ${camera.y}px) scale(${camera.scale})`;
  });
  protected readonly crumbs = computed((): readonly PlaceCrumb[] => {
    const room = this.room();
    const object = this.selected();
    if (!room) return [{ label: 'Town', href: '/town' }, { label: 'Home' }];
    const roomCrumb: PlaceCrumb = object
      ? { label: room.label, href: `/town/home/${room.id}`, query: sceneQuery(null, this.camera()) }
      : { label: room.label };
    return object
      ? [{ label: 'Town', href: '/town' }, roomCrumb, { label: object.label }]
      : [{ label: 'Town', href: '/town' }, roomCrumb];
  });
  protected readonly noteWhen = computed(() => {
    const today = this.town()?.town.today;
    return today
      ? `Note for ${formatTownDay(today)}. Nothing is saved.`
      : 'Note for this visit. Nothing is saved.';
  });

  constructor() {
    this.camera.set(cameraFromQuery(this.route.snapshot.queryParamMap));
    const media = typeof matchMedia === 'function' ? matchMedia('(max-width: 799px)') : null;
    if (media) {
      this.narrow.set(media.matches);
      const onNarrow = (): void => this.narrow.set(media.matches);
      media.addEventListener('change', onNarrow);
      this.destroyRef.onDestroy(() => media.removeEventListener('change', onNarrow));
    }
    this.destroyRef.onDestroy(() => {
      this.alive = false;
      this.gesture = null;
      this.resizeObserver?.disconnect();
    });
    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe(params => this.syncQuery(params));
    this.layoutRequest.pipe(
      switchMap(() => {
        const owner = this.owner;
        const room = this.room();
        const epoch = this.layoutEpoch;
        if (owner == null || room == null) return EMPTY;
        this.layoutLoading.set(true);
        return this.api.getLayout(room.id).pipe(
          map(data => ({ owner, roomId: room.id, epoch, data, failed: false })),
          catchError(() => of({ owner, roomId: room.id, epoch, data: null, failed: true })),
        );
      }),
      takeUntilDestroyed(),
    ).subscribe(result => this.publishLayout(result));
    this.session.user$.pipe(
      map(user => user?.id ?? null),
      distinctUntilChanged(),
      switchMap(owner => {
        this.adoptOwner(owner);
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
    this.route.paramMap.pipe(takeUntilDestroyed()).subscribe(() => this.onRoomChange());
    afterNextRender(() => {
      this.host.nativeElement.querySelector<HTMLElement>('.objects [aria-current="true"]')?.focus({ preventScroll: true });
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

  protected heading(): string {
    return this.room()?.label ?? 'Home';
  }

  protected slots(room: HomeRoom): string {
    return wallSlotLine(room);
  }

  protected part(): CosmeticPart {
    return this.theme() === 'dark' ? 'night' : 'day';
  }

  protected roomSrc(room: HomeRoom): string {
    const attempt = this.attempts()[room.id] ?? 0;
    return attempt ? `${room.src}?retry=${attempt}` : room.src;
  }

  protected objectSrc(object: HomeSceneObject): string {
    const asset = cosmeticById(object.catalogId);
    if (!asset) return '';
    return variantSrc(asset, this.part(), this.attempts()[object.id] ?? 0);
  }

  protected faded(id: string): boolean {
    return this.occluded().has(id);
  }

  protected linkQuery(id: string): Record<string, string | null> {
    return sceneQuery(id, this.camera());
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

  protected onEscape(): void {
    if (!this.sheet() || document.querySelector('[role="dialog"][aria-modal="true"]')) return;
    this.closeSheet();
  }

  protected closeSheet(): void {
    const id = this.selected()?.id ?? null;
    this.publish(sceneQuery(null, this.camera()), () => this.focusObject(id));
  }

  protected onNote(event: Event): void {
    const owner = this.owner;
    const field = event.target;
    if (owner == null || !(field instanceof HTMLTextAreaElement)) return;
    const value = field.value.slice(0, HOME_NOTE_LIMIT);
    if (value !== field.value) field.value = value;
    this.notes.set(owner, value);
    this.note.set(value);
  }

  protected water(object: HomeSceneObject): void {
    const owner = this.owner;
    if (owner == null || object.action.kind !== 'garden' || this.watered().has(object.id)) return;
    const next = new Set(this.watered()).add(object.id);
    this.gardens.set(owner, next);
    this.watered.set(next);
  }

  protected lotLabel(data: TownResponse, slot: number): string {
    const lot = data.lots.find(item => item.slot === slot);
    if (!lot) return `Lot ${slot + 1} is not on this town.`;
    if (lot.state === 'locked') return `Lot ${slot + 1} unlocks at level ${lot.unlock_level}`;
    if (lot.state === 'empty' || lot.habit_id == null) return `Lot ${slot + 1} is an empty lot`;
    const habit = data.habits.find(item => item.id === lot.habit_id);
    return habit ? habit.name : `Lot ${slot + 1}`;
  }

  protected saveDisabled(): boolean {
    return !this.signedIn() || this.layoutLoading() || this.layoutBusy() || this.room() == null;
  }

  protected choosePalette(swatch: HomePalette): void {
    if (!this.signedIn()) return;
    this.palette.set(swatch);
  }

  protected saveCurrent(): void {
    this.writeLayout(this.layoutRevision());
  }

  protected saveOlder(): void {
    this.writeLayout(Math.max(0, this.layoutRevision() - 1));
  }

  protected retryTown(): void {
    this.host.nativeElement.querySelector<HTMLElement>('#garden-lots')?.focus();
    this.retry.next();
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
      // Synthetic events in tests have no active pointer.
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
    const room = this.room();
    const element = this.viewport()?.nativeElement;
    if (!room || !element) return;
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const point = screenToRoom(
      { x: event.clientX - rect.left, y: event.clientY - rect.top },
      this.camera(),
      { width: rect.width, height: rect.height },
      room.bounds,
    );
    const visible = this.objects().filter(object => this.painted().includes(object.id));
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

  protected artLoaded(id: string): void {
    this.painted.update(painted => painted.includes(id) ? painted : [...painted, id]);
  }

  protected artFailed(id: string): void {
    this.failed.update(failed => failed.includes(id) ? failed : [...failed, id]);
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

  private adoptOwner(owner: number | null): void {
    this.owner = owner;
    this.dropUncommittedGesture();
    this.town.set(null);
    this.townState.set(owner == null ? 'unavailable' : 'loading');
    this.signedIn.set(owner != null);
    this.palette.set(0);
    this.layoutBusy.set(false);
    this.layoutEpoch += 1;
    this.loadedKey = '';
    if (owner == null) {
      this.notes.clear();
      this.gardens.clear();
      this.note.set('');
      this.watered.set(new Set());
    } else {
      this.note.set(this.notes.get(owner) ?? '');
      this.watered.set(new Set(this.gardens.get(owner) ?? []));
    }
    this.requestLayout();
  }

  private onRoomChange(): void {
    this.layoutEpoch += 1;
    this.layoutBusy.set(false);
    this.loadedKey = '';
    this.requestLayout();
  }

  private requestLayout(): void {
    const room = this.room();
    if (this.owner == null) {
      this.layoutLoading.set(false);
      this.layoutRevision.set(0);
      this.layoutStatus.set(room ? 'Sign in to save this room.' : '');
      return;
    }
    if (room == null) {
      this.layoutLoading.set(false);
      this.layoutStatus.set('');
      return;
    }
    const key = `${this.owner}:${room.id}`;
    if (key === this.loadedKey) return;
    this.layoutRevision.set(0);
    this.layoutStatus.set('');
    this.layoutRequest.next();
  }

  private publishLayout(result: LayoutLoad): void {
    if (!this.alive || result.epoch !== this.layoutEpoch || result.owner !== this.owner) return;
    if (this.room()?.id !== result.roomId) return;
    this.layoutLoading.set(false);
    if (result.failed || result.data == null) {
      this.layoutStatus.set('The saved layout could not be loaded. Your palette choice is still here.');
      return;
    }
    this.loadedKey = `${result.owner}:${result.roomId}`;
    this.layoutRevision.set(result.data.revision);
    this.layoutStatus.set(result.data.revision === 0
      ? 'Nothing is saved yet. Revision 0.'
      : `Saved. Revision ${result.data.revision}.`);
  }

  private writeLayout(expected: number): void {
    const room = this.room();
    const owner = this.owner;
    if (owner == null || room == null || this.layoutLoading() || this.layoutBusy()) return;
    const epoch = this.layoutEpoch + 1;
    this.layoutEpoch = epoch;
    this.layoutBusy.set(true);
    const body = homeLayoutWrite(room.id, expected, this.palette());
    this.api.saveLayout(room.id, body).pipe(
      map(data => ({ ok: true as const, data })),
      catchError((error: { error?: { message?: unknown } }) => of({ ok: false as const, error })),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe(result => {
      if (!this.alive || epoch !== this.layoutEpoch || owner !== this.owner || this.room()?.id !== room.id) return;
      this.layoutBusy.set(false);
      if (!result.ok) {
        const message = result.error.error?.message;
        const match = typeof message === 'string' ? /^This room was saved at revision (\d+)\.$/.exec(message) : null;
        if (match) {
          const revision = Number(match[1]);
          this.layoutRevision.set(revision);
          this.layoutStatus.set(`This room was saved at revision ${revision}. The older revision was not written.`);
          return;
        }
        this.layoutStatus.set('The layout was not saved. Your palette choice is still here.');
        return;
      }
      this.loadedKey = `${owner}:${room.id}`;
      this.layoutRevision.set(result.data.revision);
      this.layoutStatus.set(result.data.revision === 0
        ? 'Nothing is saved yet. Revision 0.'
        : `Saved. Revision ${result.data.revision}.`);
    });
  }

  private publishTown(result: TownLoad): void {
    if (!this.alive || result.owner !== this.owner) return;
    if (result.failed || result.data == null) {
      this.town.set(null);
      this.townState.set('unavailable');
      return;
    }
    this.town.set(result.data);
    this.townState.set('ready');
  }

  private syncQuery(params: { get(name: string): string | null }): void {
    if (!this.alive) return;
    const camera = cameraFromQuery(params);
    if (!sameCamera(camera, this.camera())) this.camera.set(camera);
    const object = params.get('object');
    if (!object) return;
    const room = homeRoom(this.route.snapshot.paramMap.get('room'));
    const known = room != null && homeObjects(room.id).some(item => item.id === object);
    if (!known) this.publish(sceneQuery(null, camera));
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
    this.publish(sceneQuery(this.selected()?.id ?? null, camera));
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

  private selectObject(id: string): void {
    if (!this.alive) return;
    this.publish(sceneQuery(id, this.camera()), () => this.focusObject(id));
  }

  private viewportSize(): { width: number; height: number } {
    const element = this.viewport()?.nativeElement;
    if (!element) return { width: 0, height: 0 };
    const rect = element.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  }
}
