import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, afterRenderEffect, computed, effect, inject, input, output, signal, viewChild } from '@angular/core';
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
  CLINIC_ROOM,
  clinicFaded,
  clinicFrames,
  clinicHit,
  clinicRoomDetail,
  clinicRoomHeading,
  type ClinicGate,
  type ClinicObjectId,
} from './clinic-room';

interface ClinicGesture {
  id: number;
  startX: number;
  startY: number;
  origin: SceneCamera;
  moved: boolean;
}

@Component({
  selector: 'app-clinic-room',
  templateUrl: './clinic-room.component.html',
  styleUrl: './clinic-room.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:keydown.escape)': 'onEscape()',
    '[attr.data-clinic-room]': 'gate()',
  },
})
export class ClinicRoomComponent {
  readonly selected = input<ClinicObjectId | null>(null);
  readonly gate = input<ClinicGate>('ready');
  readonly chosen = output<ClinicObjectId | null>();

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly viewport = viewChild<ElementRef<HTMLElement>>('viewport');
  private readonly narrow = signal(false);
  private readonly camera = signal<SceneCamera>(REST_CAMERA);
  private gesture: ClinicGesture | null = null;
  private focusPending = false;
  private seenGate: ClinicGate | null = null;
  private alive = true;

  protected readonly frames = clinicFrames();
  protected readonly room = CLINIC_ROOM;
  protected readonly heading = computed(() => clinicRoomHeading(this.selected()));
  protected readonly detail = computed(() => clinicRoomDetail(this.selected(), this.gate()));
  protected readonly faded = computed(() => clinicFaded(this.selected()));
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
    effect(() => {
      const gate = this.gate();
      if (this.seenGate !== null && this.seenGate !== gate) this.cancelPointer();
      this.seenGate = gate;
    });
    afterRenderEffect(() => {
      this.selected();
      if (!this.focusPending) return;
      queueMicrotask(() => {
        if (!this.alive || !this.focusPending) return;
        this.focusPending = false;
        if (document.querySelector('[role="dialog"]')) return;
        this.host.nativeElement.querySelector<HTMLElement>('#clinic-object-title')?.focus();
      });
    });
  }

  protected isFaded(id: ClinicObjectId): boolean {
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

  protected choose(id: ClinicObjectId | null): void {
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
        ? this.host.nativeElement.querySelector<HTMLElement>(`.clinic-objects [data-clinic-object="${id}"]`)
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
      CLINIC_ROOM,
    );
    const hit = clinicHit(point);
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
