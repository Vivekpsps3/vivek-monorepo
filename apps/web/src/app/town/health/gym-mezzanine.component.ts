import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, afterRenderEffect, computed, inject, input, output, signal, viewChild } from '@angular/core';
import {
  REST_CAMERA,
  SCENE_SCALES,
  movedPastSlop,
  panCamera,
  screenToRoom,
  zoomToward,
  type SceneCamera,
} from '../library-room.scene';
import {
  GYM_UP_ROOM,
  gymUpDetail,
  gymUpFaded,
  gymUpFrames,
  gymUpHeading,
  gymUpHit,
  type GymUpId,
} from './gym-mezzanine';

interface UpGesture {
  id: number;
  startX: number;
  startY: number;
  origin: SceneCamera;
  moved: boolean;
}

@Component({
  selector: 'app-gym-mezzanine',
  templateUrl: './gym-mezzanine.component.html',
  styleUrl: './gym-mezzanine.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:keydown.escape)': 'onEscape()',
    'data-gym-up': 'ready',
  },
})
export class GymMezzanineComponent {
  readonly selected = input<GymUpId | null>(null);
  readonly chosen = output<GymUpId | null>();

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly viewport = viewChild<ElementRef<HTMLElement>>('viewport');
  private readonly narrow = signal(false);
  private readonly camera = signal<SceneCamera>(REST_CAMERA);
  private gesture: UpGesture | null = null;
  private focusPending = false;
  private alive = true;

  protected readonly frames = gymUpFrames();
  protected readonly room = GYM_UP_ROOM;
  protected readonly heading = computed(() => gymUpHeading(this.selected()));
  protected readonly detail = computed(() => gymUpDetail(this.selected()));
  protected readonly faded = computed(() => gymUpFaded(this.selected()));
  protected readonly sheet = computed(() => this.narrow() && this.selected() !== null);
  protected readonly cameraTransform = computed(() => {
    const camera = this.camera();
    return `translate(${camera.x}px, ${camera.y}px) scale(${camera.scale})`;
  });

  constructor() {
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
    });
    afterRenderEffect(() => {
      this.selected();
      if (!this.focusPending) return;
      queueMicrotask(() => {
        if (!this.alive || !this.focusPending) return;
        this.focusPending = false;
        if (document.querySelector('[role="dialog"]')) return;
        this.host.nativeElement.querySelector<HTMLElement>('#gym-up-object-title')?.focus();
      });
    });
  }

  protected isFaded(id: GymUpId): boolean {
    return this.faded().has(id);
  }

  protected atMinZoom(): boolean {
    return this.camera().scale <= SCENE_SCALES[0];
  }

  protected atMaxZoom(): boolean {
    return this.camera().scale >= SCENE_SCALES[SCENE_SCALES.length - 1];
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

  protected choose(id: GymUpId | null): void {
    this.focusPending = id !== null;
    this.chosen.emit(id);
  }

  protected onEscape(): void {
    if (!this.sheet() || document.querySelector('[role="dialog"][aria-modal="true"]')) return;
    const id = this.selected();
    this.choose(null);
    queueMicrotask(() => {
      if (!this.alive) return;
      const link = id
        ? this.host.nativeElement.querySelector<HTMLElement>(`.up-objects [data-gym-up="${id}"]`)
        : null;
      link?.focus();
    });
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
      moved: false,
    };
    event.preventDefault();
    try {
      viewport.setPointerCapture(event.pointerId);
    } catch {
      // Synthetic events have no active pointer. The element still receives the gesture.
    }
  }

  protected movePointer(event: PointerEvent): void {
    const gesture = this.gesture;
    if (!gesture || event.pointerId !== gesture.id) return;
    const dx = event.clientX - gesture.startX;
    const dy = event.clientY - gesture.startY;
    if (!gesture.moved && !movedPastSlop(dx, dy)) return;
    gesture.moved = true;
    const size = this.viewportSize();
    if (size.width <= 0 || size.height <= 0) return;
    this.camera.set(panCamera(gesture.origin, size, dx, dy));
  }

  protected endPointer(event: PointerEvent): void {
    const gesture = this.gesture;
    if (!gesture || event.pointerId !== gesture.id) return;
    this.gesture = null;
    if (gesture.moved || !this.alive) return;
    const element = this.viewport()?.nativeElement;
    if (!element) return;
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const point = screenToRoom(
      { x: event.clientX - rect.left, y: event.clientY - rect.top },
      this.camera(),
      { width: rect.width, height: rect.height },
      GYM_UP_ROOM,
    );
    const hit = gymUpHit(point);
    if (hit) this.choose(hit);
  }

  protected cancelPointer(): void {
    if (!this.gesture) return;
    this.camera.set(this.gesture.origin);
    this.gesture = null;
  }

  private viewportSize(): { width: number; height: number } {
    const rect = this.viewport()?.nativeElement.getBoundingClientRect();
    return { width: rect?.width ?? 0, height: rect?.height ?? 0 };
  }
}
