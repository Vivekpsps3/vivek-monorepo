import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, computed, inject, input, output, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { distinctUntilChanged, map } from 'rxjs';
import { SessionService } from '../platform/session.service';
import {
  REST_CAMERA,
  SCENE_SCALES,
  frontObject,
  movedPastSlop,
  panCamera,
  screenToRoom,
  zoomToward,
  type SceneCamera,
} from './library-room.scene';
import {
  DISTRICTS,
  EXTERIOR_ROOM,
  exteriorBuildings,
  exteriorPlates,
  frameDistrict,
  type DistrictId,
  type ExteriorBuilding,
  type ExteriorHealth,
} from './town-exterior';
import type { TownResponse } from './town.types';
import type { TreasuryView } from './weeks-kept';

interface SceneGesture {
  id: number;
  startX: number;
  startY: number;
  origin: SceneCamera;
  owner: number | null;
  moved: boolean;
}

@Component({
  selector: 'app-town-exterior',
  imports: [RouterLink],
  templateUrl: './town-exterior.component.html',
  styleUrl: './town-exterior.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TownExteriorComponent {
  private readonly router = inject(Router);
  private readonly session = inject(SessionService);
  private readonly viewport = viewChild<ElementRef<HTMLElement>>('viewport');
  private gesture: SceneGesture | null = null;
  private owner: number | null = null;
  private alive = true;

  readonly data = input.required<TownResponse>();
  readonly treasury = input.required<TreasuryView>();
  readonly vaultPresent = input(false);
  readonly health = input<ExteriorHealth>({ state: 'locked' });
  readonly swaps = input<Readonly<Record<string, 1 | 2 | 3>>>({});
  readonly openHabit = output<{ slot: number | null; habitId: number | null }>();

  protected readonly districts = DISTRICTS;
  protected readonly plates = exteriorPlates();
  protected readonly room = EXTERIOR_ROOM;
  protected readonly camera = signal<SceneCamera>(REST_CAMERA);
  protected readonly selected = signal<string | null>(null);
  protected readonly framed = signal<DistrictId | null>(null);
  protected readonly buildings = computed(() => exteriorBuildings({
    data: this.data(),
    treasury: this.treasury(),
    vaultPresent: this.vaultPresent(),
    health: this.health(),
    swaps: this.swaps(),
  }));
  protected readonly cameraTransform = computed(() => {
    const camera = this.camera();
    return `translate(${camera.x}px, ${camera.y}px) scale(${camera.scale})`;
  });

  constructor() {
    const destroyRef = inject(DestroyRef);
    destroyRef.onDestroy(() => {
      this.alive = false;
      this.gesture = null;
    });
    this.session.user$.pipe(
      map(user => user?.id ?? null),
      distinctUntilChanged(),
      takeUntilDestroyed(),
    ).subscribe(owner => {
      this.owner = owner;
      this.dropUncommittedGesture();
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
    this.framed.set(null);
  }

  protected showDistrict(id: DistrictId): void {
    const district = DISTRICTS.find(item => item.id === id);
    if (!district) return;
    this.framed.set(id);
    this.camera.set(frameDistrict(district.focus, this.viewportSize()));
  }

  protected choose(building: ExteriorBuilding): void {
    if (!this.alive || building.control === 'locked') return;
    this.selected.set(building.id);
    if (building.control === 'habit') {
      this.openHabit.emit({ slot: building.slot, habitId: building.habitId });
      return;
    }
    if (building.control === 'select') {
      this.showDistrict(building.district);
      return;
    }
    if (building.control === 'external') {
      void this.router.navigateByUrl(building.href);
      return;
    }
    void this.router.navigate([building.path], { queryParams: building.query ?? undefined });
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
      EXTERIOR_ROOM,
    );
    const hit = frontObject(this.buildings().map(building => ({
      building,
      x: building.rect.left,
      y: building.rect.top,
      asset: {
        id: building.id,
        layer: building.layer,
        bounds: { width: building.rect.width, height: building.rect.height },
        anchor: { x: 0, y: 0 },
      },
    })), point);
    if (hit) this.choose(hit.building);
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

  protected reducedMotion(): boolean {
    return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  private dropUncommittedGesture(): void {
    const gesture = this.gesture;
    if (!gesture) return;
    this.camera.set(gesture.origin);
    this.gesture = null;
  }

  private viewportSize(): { width: number; height: number } {
    const element = this.viewport()?.nativeElement;
    if (!element) return { width: 0, height: 0 };
    const rect = element.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  }
}
