import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, afterNextRender, computed, inject, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subject, catchError, distinctUntilChanged, map, of, startWith, switchMap } from 'rxjs';
import { ThemeService, UiButtonComponent } from '@vivek/ui';
import { SessionService } from '../platform/session.service';
import { readingRoom, readingRoomObjects, type ReadingRoomAsset } from './library-room.assets';
import {
  REST_CAMERA,
  SCENE_SCALES,
  clampCamera,
  frontObject,
  movedPastSlop,
  panCamera,
  screenToRoom,
  zoomToward,
  type SceneCamera,
} from './library-room.scene';
import { TownApiService } from './town.api';

interface SceneGesture {
  id: number;
  startX: number;
  startY: number;
  origin: SceneCamera;
  owner: number | null;
  moved: boolean;
}

@Component({
  selector: 'app-town-library-room',
  imports: [RouterLink, UiButtonComponent],
  templateUrl: './library-room.component.html',
  styleUrl: './library-room.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LibraryRoomComponent {
  private readonly api = inject(TownApiService);
  private readonly session = inject(SessionService);
  private readonly router = inject(Router);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly themeService = inject(ThemeService);
  private readonly route = inject(ActivatedRoute);
  private readonly retry = new Subject<void>();
  private readonly viewport = viewChild<ElementRef<HTMLElement>>('viewport');
  private readonly attempts = signal<Partial<Record<ReadingRoomAsset['id'], number>>>({});
  private resizeObserver: ResizeObserver | null = null;
  private gesture: SceneGesture | null = null;
  private owner: number | null = null;
  private alive = true;
  protected readonly painted = signal<readonly ReadingRoomAsset['id'][]>([]);
  protected readonly failed = signal<readonly ReadingRoomAsset['id'][]>([]);
  protected readonly room = readingRoom;
  protected readonly objects = readingRoomObjects;
  protected readonly camera = signal<SceneCamera>(REST_CAMERA);
  protected readonly cameraTransform = computed(() => {
    const camera = this.camera();
    return `translate(${camera.x}px, ${camera.y}px) scale(${camera.scale})`;
  });
  protected readonly theme = toSignal(this.themeService.theme$, { requireSync: true });
  private readonly params = toSignal(this.route.queryParamMap, { requireSync: true });
  protected readonly selected = computed(() => this.objects.find(object => object.asset.id === this.params().get('object')));
  protected readonly progress = toSignal(this.session.user$.pipe(
    map(user => user?.id),
    distinctUntilChanged(),
    switchMap(owner => owner == null ? of(null) : this.retry.pipe(
      startWith(undefined),
      switchMap(() => this.api.getTown().pipe(
        map(data => data.buildings.library),
        catchError(() => of(null)),
        startWith('loading' as const),
      )),
    )),
  ), { requireSync: true });

  constructor() {
    const destroyRef = inject(DestroyRef);
    destroyRef.onDestroy(() => {
      this.alive = false;
      this.gesture = null;
      this.resizeObserver?.disconnect();
    });
    this.session.user$.pipe(
      map(user => user?.id ?? null),
      distinctUntilChanged(),
      takeUntilDestroyed(),
    ).subscribe(owner => {
      this.owner = owner;
      this.dropUncommittedGesture();
    });
    afterNextRender(() => {
      this.host.nativeElement.querySelector<HTMLElement>('.objects [aria-current="true"]')?.focus({ preventScroll: true });
      const element = this.viewport()?.nativeElement;
      if (!element || typeof ResizeObserver === 'undefined') return;
      this.resizeObserver = new ResizeObserver(() => {
        if (!this.alive) return;
        this.camera.set(clampCamera(this.camera(), this.viewportSize()));
      });
      this.resizeObserver.observe(element);
    });
  }

  protected atMaxZoom(): boolean {
    return this.camera().scale >= SCENE_SCALES[SCENE_SCALES.length - 1];
  }

  protected atMinZoom(): boolean {
    return this.camera().scale <= SCENE_SCALES[0];
  }

  protected zoomIn(): void {
    this.camera.set(zoomToward(this.camera(), this.viewportSize(), 1));
  }

  protected zoomOut(): void {
    this.camera.set(zoomToward(this.camera(), this.viewportSize(), -1));
  }

  protected resetView(): void {
    this.camera.set(REST_CAMERA);
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
    if (gesture.moved || !this.alive || this.owner !== gesture.owner) return;
    const element = this.viewport()?.nativeElement;
    if (!element) return;
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const point = screenToRoom(
      { x: event.clientX - rect.left, y: event.clientY - rect.top },
      this.camera(),
      { width: rect.width, height: rect.height },
      readingRoom.bounds,
    );
    const visible = this.objects.filter(object => this.painted().includes(object.asset.id));
    const hit = frontObject(visible, point);
    if (hit) this.selectObject(hit.asset.id);
  }

  protected cancelPointer(event: PointerEvent): void {
    const gesture = this.gesture;
    if (!gesture || event.pointerId !== gesture.id) return;
    this.camera.set(gesture.origin);
    this.gesture = null;
  }

  protected retryProgress(): void {
    this.host.nativeElement.querySelector<HTMLElement>('#library-progress')?.focus();
    this.retry.next();
  }

  protected artUrl(asset: ReadingRoomAsset): string {
    const attempt = this.attempts()[asset.id];
    return attempt ? `${asset.src}?retry=${attempt}` : asset.src;
  }

  protected artLoaded(asset: ReadingRoomAsset): void {
    this.painted.update(painted => painted.includes(asset.id) ? painted : [...painted, asset.id]);
  }

  protected artFailed(asset: ReadingRoomAsset): void {
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

  private dropUncommittedGesture(): void {
    const gesture = this.gesture;
    if (!gesture) return;
    this.camera.set(gesture.origin);
    this.gesture = null;
  }

  private selectObject(id: string): void {
    if (!this.alive) return;
    const owner = this.owner;
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { object: id },
      replaceUrl: true,
    }).then(() => {
      if (!this.alive || this.owner !== owner) return;
      const link = [...this.host.nativeElement.querySelectorAll<HTMLElement>('.objects [data-object]')]
        .find(item => item.dataset['object'] === id);
      link?.focus();
    });
  }

  private viewportSize(): { width: number; height: number } {
    const element = this.viewport()?.nativeElement;
    if (!element) return { width: 0, height: 0 };
    const rect = element.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  }
}
