import { afterNextRender, ChangeDetectionStrategy, Component, DestroyRef, ElementRef, computed, inject, input, output, signal, viewChild } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { distinctUntilChanged, map } from 'rxjs';
import { ReturnContext } from '@vivek/ui';
import { SessionService } from '../platform/session.service';
import {
  REST_CAMERA,
  SCENE_SCALES,
  movedPastSlop,
  panCamera,
  zoomToward,
  type SceneCamera,
} from './library-room.scene';
import {
  DISTRICTS,
  exteriorBuildings,
  frameDistrict,
  inspectedPlace,
  type DistrictId,
  type ExteriorBuilding,
  type ExteriorHealth,
  type InspectedPlace,
} from './town-exterior';
import type { TownResponse } from './town.types';
import type { TreasuryView } from './weeks-kept';
import { sceneAudio } from './scene-audio';
import { SceneAppearanceService } from '../platform/scene-appearance.service';
import { TownPlaceComponent, type PlaceCrumb } from './town-place.component';
import {
  EMPTY_FEEDBACK,
  feedbackAttr,
  feedbackLabel,
  responseKind,
  visibleMark,
  type FeedbackBook,
  type FeedbackMark,
} from './habit-feedback';

const QUIET_SOUND = 'Town sound stays quiet while the scene is hidden, offscreen, or motion is reduced.';

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
  imports: [NgTemplateOutlet, RouterLink, TownPlaceComponent],
  templateUrl: './town-exterior.component.html',
  styleUrl: './town-exterior.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown.escape)': 'onEscape()' },
})
export class TownExteriorComponent {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly returns = inject(ReturnContext);
  private readonly session = inject(SessionService);
  private readonly scene = inject(SceneAppearanceService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly viewport = viewChild<ElementRef<HTMLElement>>('viewport');
  private gesture: SceneGesture | null = null;
  private owner: number | null = null;
  private alive = true;
  private onScreen = false;
  private sceneObserver: IntersectionObserver | null = null;

  readonly data = input.required<TownResponse>();
  readonly treasury = input.required<TreasuryView>();
  readonly vaultPresent = input(false);
  readonly health = input<ExteriorHealth>({ state: 'locked' });
  readonly swaps = input<Readonly<Record<string, 1 | 2 | 3>>>({});
  readonly feedback = input<FeedbackBook>(EMPTY_FEEDBACK);
  readonly openHabit = output<{ slot: number | null; habitId: number | null }>();
  readonly openHistory = output<void>();

  private readonly params = toSignal(this.route.queryParamMap, { requireSync: true });
  private readonly narrow = signal(false);
  private readonly picked = signal<string | null>(null);
  protected readonly districts = DISTRICTS;
  protected readonly camera = signal<SceneCamera>(REST_CAMERA);
  protected readonly framed = signal<DistrictId | null>(null);
  protected readonly focusedBuilding = signal<string | null>(null);
  protected readonly inspected = computed(() => this.params().get('inspect') || this.picked());
  protected readonly place = computed((): InspectedPlace | null => inspectedPlace(this.data(), this.inspected()));
  protected readonly sheet = computed(() => this.narrow() && this.place() != null);
  protected readonly crumbs = computed((): readonly PlaceCrumb[] => {
    const place = this.place();
    const home = { ...this.visitQuery(), inspect: null };
    return place
      ? [{ label: 'Town', href: '/town', query: home }, { label: place.name }]
      : [{ label: 'Town' }];
  });
  protected readonly buildings = computed(() => exteriorBuildings({
    data: this.data(),
    treasury: this.treasury(),
    vaultPresent: this.vaultPresent(),
    health: this.health(),
    swaps: this.swaps(),
  }));
  protected readonly activeBuilding = computed(() => {
    const id = this.focusedBuilding() ?? this.inspected();
    return this.buildings().find(building => building.id === id);
  });
  protected readonly cameraTransform = computed(() => {
    const camera = this.camera();
    return `translate(${camera.x}px, ${camera.y}px) scale(${camera.scale})`;
  });
  protected readonly ambience = signal<'still' | 'live'>('still');
  private readonly soundOutcome = signal<string | null>(null);
  protected readonly presentation = this.scene.presentation;
  protected readonly seasonDirty = this.scene.dirty;
  protected readonly feedbackLabel = feedbackLabel;
  protected readonly feedbackAttr = feedbackAttr;
  protected readonly responseKind = responseKind;
  protected readonly soundStatus = computed(() => {
    if (!this.scene.effective().sound) return 'Town sound is off until you turn it on in Appearance.';
    return this.soundOutcome() ?? 'Town sound is on. Nothing plays until you choose Play Town sound.';
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
      this.sceneObserver?.disconnect();
      this.sceneObserver = null;
      this.onScreen = false;
      this.ambience.set('still');
    });
    afterNextRender(() => {
      this.watchScene(destroyRef);
      if (this.returns.view('/town')?.focus !== 'inn') return;
      this.showDistrict('harbor');
      this.focusInspected('inn');
    });
    this.session.user$.pipe(
      map(user => user?.id ?? null),
      distinctUntilChanged(),
      takeUntilDestroyed(),
    ).subscribe(owner => {
      const previous = this.owner;
      this.owner = owner;
      this.soundOutcome.set(null);
      this.dropUncommittedGesture();
      if (previous !== null && previous !== owner) {
        this.focusedBuilding.set(null);
        this.clearInspect();
      }
    });
  }

  protected habitMark(habitId: number | null): FeedbackMark | null {
    if (habitId == null || this.owner == null) return null;
    return visibleMark(this.feedback(), habitId, this.owner, this.data().town.today);
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
    if (!this.alive) return;
    if (building.control === 'locked' || building.control === 'habit') {
      this.picked.set(building.id);
      this.publishInspect(building.id);
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
    this.rememberHarbor(building);
    void this.router.navigate([building.path], {
      queryParams: building.query ?? undefined,
      state: this.harborSource(building),
    });
  }

  protected harborSource(building: ExteriorBuilding): Record<string, unknown> | undefined {
    return building.id === 'inn' ? this.returns.link('/town') : undefined;
  }

  protected rememberHarbor(building: ExteriorBuilding, event?: MouseEvent): void {
    if (building.id !== 'inn') return;
    if (event && (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey)) return;
    this.returns.saveView('/town', building.id);
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
    if (movedPastSlop(event.clientX - gesture.startX, event.clientY - gesture.startY)) return;
    const element = this.viewport()?.nativeElement;
    if (!element) return;
    // The SVG paint participates in native hit testing. Shadows, captions and
    // empty corners never claim a tap, even when a nearer landmark overlaps.
    const piece = document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-scene-object]');
    if (!piece || !element.contains(piece)) return;
    const building = this.buildings().find(item => item.id === piece.getAttribute('data-scene-object'));
    if (building) this.choose(building);
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

  protected inspectorState(): 'empty' | 'locked' | 'occupied' | 'archived' | 'error' {
    const state = this.place()?.state;
    if (!state) return 'empty';
    return state === 'missing' ? 'error' : state;
  }

  protected inspectArchived(id: number): void {
    if (!this.alive) return;
    const inspect = `archived-${id}`;
    this.picked.set(inspect);
    this.publishInspect(inspect);
  }

  protected invoke(place: InspectedPlace): void {
    if (!this.alive || !place.action) return;
    if (place.state === 'archived') {
      this.openHistory.emit();
      return;
    }
    this.openHabit.emit({ slot: place.slot, habitId: place.habitId });
  }

  protected onEscape(): void {
    if (!this.sheet() || document.querySelector('[role="dialog"][aria-modal="true"]')) return;
    this.closeSheet();
  }

  protected closeSheet(): void {
    const id = this.inspected();
    this.picked.set(null);
    this.publishInspect(null, () => this.focusInspected(id));
  }

  protected reducedMotion(): boolean {
    return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  protected playSound(): void {
    void this.playSoundNow();
  }

  private watchScene(destroyRef: DestroyRef): void {
    if (!this.alive || typeof document === 'undefined') return;
    const reduce = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
    const onReduce = (): void => this.syncAmbience();
    reduce?.addEventListener?.('change', onReduce);
    const onVisible = (): void => this.syncAmbience();
    document.addEventListener('visibilitychange', onVisible);
    const viewport = this.viewport()?.nativeElement;
    if (viewport && typeof IntersectionObserver === 'function') {
      this.sceneObserver = new IntersectionObserver(entries => {
        this.onScreen = entries.some(entry => entry.isIntersecting && entry.intersectionRatio > 0);
        this.syncAmbience();
      });
      this.sceneObserver.observe(viewport);
    }
    this.syncAmbience();
    destroyRef.onDestroy(() => {
      reduce?.removeEventListener?.('change', onReduce);
      document.removeEventListener('visibilitychange', onVisible);
    });
  }

  private syncAmbience(): void {
    const hidden = typeof document !== 'undefined' && document.visibilityState === 'hidden';
    const live = this.alive && this.onScreen && !hidden && !this.reducedMotion();
    this.ambience.set(live ? 'live' : 'still');
    if (live && this.soundOutcome() === QUIET_SOUND) this.soundOutcome.set(null);
  }

  private async playSoundNow(): Promise<void> {
    if (!this.alive) return;
    const owner = this.owner;
    if (!this.scene.effective().sound || this.ambience() !== 'live') {
      this.soundOutcome.set(this.scene.effective().sound ? QUIET_SOUND : null);
      return;
    }
    try {
      await sceneAudio.play();
    } catch {
      if (!this.alive || this.owner !== owner) return;
      this.soundOutcome.set('Town sound could not play. The scene is unchanged.');
      return;
    }
    if (!this.alive || this.owner !== owner || !this.scene.effective().sound || this.ambience() !== 'live') return;
    this.soundOutcome.set('Played one Town tone.');
  }

  private visitQuery(): Record<string, string> {
    const params = this.params();
    const query: Record<string, string> = {};
    for (const key of ['visit', 'from', 'year', 'span'] as const) {
      const value = params.get(key);
      if (value) query[key] = value;
    }
    return query;
  }

  private publishInspect(id: string | null, after?: () => void): void {
    if (!this.alive) return;
    const owner = this.owner;
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { inspect: id },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    }).then(() => {
      if (!this.alive || this.owner !== owner) return;
      after?.();
    });
  }

  private clearInspect(): void {
    this.picked.set(null);
    if (!this.params().get('inspect')) return;
    this.publishInspect(null);
  }

  private focusInspected(id: string | null): void {
    if (!id) return;
    const archived = id.startsWith('archived-') ? id.slice('archived-'.length) : null;
    const target = archived
      ? this.host.nativeElement.querySelector<HTMLElement>(`[data-archived="${archived}"]`)
      : this.host.nativeElement.querySelector<HTMLElement>(`[data-building="${id}"]`);
    const picker = target?.closest('details');
    if (picker) picker.open = true;
    target?.focus();
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
