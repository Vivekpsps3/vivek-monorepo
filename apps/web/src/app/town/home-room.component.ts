import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, Injector, afterNextRender, computed, inject, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { EMPTY, Subject, catchError, distinctUntilChanged, map, of, skip, startWith, switchMap } from 'rxjs';
import { ThemeService, UiButtonComponent } from '@vivek/ui';
import { bindLockNotices, bindLockSnapshots } from '../../../../finance/frontend/src/public-api';
import { SessionService } from '../platform/session.service';
import { cosmeticById, cosmeticCatalog, cosmeticPart, variantSrc, type CosmeticAsset, type CosmeticPart } from './cosmetic-catalog';
import {
  HOME_CELL,
  HOME_FLOOR_CELLS,
  HOME_NOTE_LIMIT,
  HOME_ROOMS,
  HOME_VIEW,
  HOME_VIEW_GRID,
  HOME_WALL_PX,
  HOME_WALL_SLOTS,
  homeObjects,
  homePlacementPoint,
  homeRoom,
  homeSceneItem,
  homeSceneObjects,
  homeViewFootprint,
  homeViewItem,
  starterHomeLayout,
  wallSlotLabel,
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
import {
  homeFloorPoint, homeItemKnown, homeItemLabel, homePlacementProblem, reapplyHomeChanges, sameHomeLayout,
  withHomeItem, type HomeLayoutItem,
} from './home-layout';
import { HOME_MILESTONES, homeMilestoneEligible, type HomeMilestone } from './home-milestones';
import { TownApiService, type RoomLayout } from './town.api';
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

type LayoutAction = 'save' | 'undo' | 'reset';

interface LayoutLoad {
  owner: number;
  roomId: string;
  epoch: number;
  data: RoomLayout | null;
  failed: boolean;
}

@Component({
  selector: 'app-town-home',
  imports: [RouterLink, UiButtonComponent],
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
  private readonly injector = inject(Injector);
  private readonly retry = new Subject<void>();
  private readonly layoutRequest = new Subject<void>();
  private readonly viewport = viewChild<ElementRef<HTMLElement>>('viewport');
  private readonly attempts = signal<Partial<Record<string, number>>>({});
  private resizeObserver: ResizeObserver | null = null;
  private gesture: SceneGesture | null = null;
  private owner: number | null = null;
  private alive = true;

  protected readonly rooms = HOME_ROOMS;
  protected readonly sceneSize = HOME_VIEW;
  protected readonly grid = HOME_VIEW_GRID;
  protected readonly painted = signal<readonly string[]>([]);
  protected readonly failed = signal<readonly string[]>([]);
  protected readonly note = signal('');
  protected readonly signedIn = signal(false);
  protected readonly watered = signal<ReadonlySet<string>>(new Set());
  protected readonly town = signal<TownResponse | null>(null);
  protected readonly townState = signal<'loading' | 'ready' | 'unavailable'>('loading');
  protected readonly palettes = ['Original', 'Coastal', 'Rose', 'Golden'];
  protected readonly cells = Array.from({ length: HOME_FLOOR_CELLS }, (_, index) => index);
  protected readonly milestones = HOME_MILESTONES;
  protected readonly milestoneEligible = (id: HomeMilestone['id']): boolean => homeMilestoneEligible(id, this.town());
  protected readonly itemLabel = homeItemLabel;
  protected readonly wallLabel = wallSlotLabel;
  protected readonly savedItems = signal<readonly HomeLayoutItem[] | null>(null);
  protected readonly draft = signal<readonly HomeLayoutItem[] | null>(null);
  protected readonly candidate = signal<HomeLayoutItem | null>(null);
  protected readonly unlocked = signal<ReadonlySet<string> | null>(null);
  protected readonly inventory = computed(() => cosmeticCatalog.filter(asset =>
    asset.group === 'starter' || this.unlocked()?.has(asset.id),
  ));
  protected readonly inventoryUnavailable = signal(false);
  private readonly conflictBase = signal<readonly HomeLayoutItem[] | null>(null);
  protected readonly layoutConflict = computed(() => this.conflictBase() != null);
  protected readonly conflictReady = signal(false);
  protected readonly recoveryRequired = signal(false);
  protected readonly resetPreview = signal(false);
  private readonly undo = signal<{ revision: number; items: readonly HomeLayoutItem[] } | null>(null);
  private returnObject: string | null = null;
  private editEpoch = 0;
  private pendingInventoryItem: string | null = null;
  protected readonly layoutRevision = signal(0);
  protected readonly layoutStatus = signal('');
  protected readonly layoutLoading = signal(false);
  protected readonly layoutBusy = signal(false);
  private layoutEpoch = 0;
  protected readonly camera = signal<SceneCamera>(REST_CAMERA);
  private readonly narrow = signal(false);
  protected readonly lotSlots = [0, 1, 2, 3, 4, 5];
  protected readonly theme = toSignal(this.themeService.theme$, { requireSync: true });
  private readonly params = toSignal(this.route.paramMap, { requireSync: true });
  private readonly query = toSignal(this.route.queryParamMap, { requireSync: true });
  protected readonly room = computed(() => homeRoom(this.params().get('room')));
  protected readonly linkedAsset = computed(() => cosmeticById(this.query().get('item') ?? ''));
  protected readonly furnitureQuery = computed(() => {
    const item = this.linkedAsset()?.id ?? null;
    return { item, part: item ? cosmeticPart(this.query().get('part')) : null };
  });
  protected readonly linkedShopLocked = computed(() => {
    const item = this.linkedAsset();
    const unlocked = this.unlocked();
    return item?.group === 'shop' && unlocked != null && !unlocked.has(item.id);
  });
  private readonly baseItems = computed(() => {
    const room = this.room();
    return room ? this.savedItems() ?? starterHomeLayout(room.id) : [];
  });
  protected readonly editableItems = computed(() => this.draft()?.filter(item =>
    cosmeticById(item.catalog_id) || this.milestones.some(milestone =>
      item.instance_id === milestone.id && this.milestoneEligible(milestone.id)),
  ) ?? []);
  protected readonly changed = computed(() => {
    const draft = this.draft();
    return !!draft && !sameHomeLayout(draft, this.baseItems());
  });
  protected readonly canUndo = computed(() => this.undo()?.revision === this.layoutRevision());
  protected readonly unavailableItems = computed(() => this.baseItems().filter(item => !homeItemKnown(item)).length);
  private readonly resetItems = computed(() => {
    const room = this.room();
    if (!room) return [];
    const preserved = (this.draft() ?? this.baseItems()).filter(item => !homeItemKnown(item) ||
      this.milestones.some(milestone => item.instance_id === milestone.id));
    const ids = new Set(preserved.map(item => item.instance_id));
    return [...starterHomeLayout(room.id).filter(item => !ids.has(item.instance_id)), ...preserved];
  });
  protected readonly resetProblem = computed(() => {
    const room = this.room();
    return room ? homePlacementProblem(room.id, this.resetItems()) : null;
  });
  protected readonly draftProblem = computed(() => {
    const room = this.room();
    const draft = this.draft();
    return room && draft ? homePlacementProblem(room.id, draft) : null;
  });
  protected readonly candidateProblem = computed(() => {
    const room = this.room();
    const draft = this.draft();
    const item = this.candidate();
    if (!room || !draft || !item) return null;
    const milestone = this.milestones.find(entry => entry.id === item.instance_id);
    if (milestone && !this.milestoneEligible(milestone.id)) return milestone.requirement;
    return homePlacementProblem(room.id, withHomeItem(draft, item));
  });
  protected readonly preview = computed(() => {
    const room = this.room();
    const item = this.candidate();
    const object = room && item ? homeSceneItem(room.id, item) : null;
    return object ? homeViewFootprint(object) : null;
  });
  private readonly sceneItems = computed(() => {
    if (this.layoutConflict() && this.conflictReady()) return this.baseItems();
    if (this.resetPreview()) return this.resetItems();
    return this.draft() ?? this.baseItems();
  });
  protected readonly objects = computed(() => {
    const room = this.room();
    if (!room) return [];
    const candidate = this.candidate();
    const visible = this.sceneItems().filter(item => !this.unavailableMilestone(item));
    const shown = candidate && !this.candidateProblem() ? withHomeItem(visible, candidate) : visible;
    return homeSceneObjects(room.id, shown).map(homeViewItem);
  });
  protected readonly dormantMilestones = computed(() => {
    if (this.room()?.id !== 'courtyard') return [];
    return this.sceneItems().filter(item => this.unavailableMilestone(item))
      .flatMap(item => homeSceneItem('courtyard', item) ?? [])
      .map(object => ({ id: object.id, ...homeViewFootprint(object) }));
  });
  protected readonly practical = computed(() => {
    const room = this.room();
    if (!room) return [];
    const visible = this.objects();
    const actions = homeSceneObjects(room.id).filter(object => object.action.kind !== 'placed' &&
      !visible.some(item => item.id === object.id && item.action.kind !== 'placed'));
    return [...visible.filter(item => !actions.some(action => action.id === item.id)), ...actions]
      .sort((a, b) => Number(b.primary) - Number(a.primary) || Number(a.action.kind === 'placed') - Number(b.action.kind === 'placed'));
  });
  protected readonly selected = computed(() => this.draft() ? null :
    this.practical().find(object => object.id === this.query().get('object')) ?? null);
  protected readonly sheet = computed(() => this.narrow() && this.selected() != null);
  protected readonly occluded = computed(() => new Set(occludingIds(this.objects(), this.selected()?.id ?? null)));
  protected readonly cameraTransform = computed(() => {
    const camera = this.camera();
    return `translate(${camera.x}px, ${camera.y}px) scale(${camera.scale})`;
  });
  protected readonly noteWhen = computed(() => {
    const today = this.town()?.town.today;
    return today
      ? `Note for ${formatTownDay(today)}.`
      : 'Note for this visit.';
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
    this.destroyRef.onDestroy(bindLockSnapshots(() => this.invalidateForLock()));
    this.destroyRef.onDestroy(bindLockNotices(() => this.invalidateForLock()));
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
    this.route.paramMap.pipe(skip(1), takeUntilDestroyed()).subscribe(() => this.onRoomChange());
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

  protected part(): CosmeticPart {
    return this.theme() === 'dark' ? 'night' : 'day';
  }

  protected roomSrc(room: HomeRoom): string {
    const attempt = this.attempts()[room.id] ?? 0;
    return attempt ? `${room.src}?retry=${attempt}` : room.src;
  }

  protected objectSrc(object: HomeSceneObject): string {
    const asset = cosmeticById(object.catalogId);
    if (!asset) return `/town/home/milestones.svg#${object.ornamentArt ?? ''}`;
    const linked = this.furnitureQuery();
    const part = this.candidate()?.instance_id === object.id && linked.item === asset.id ? linked.part : null;
    return variantSrc(asset, part ?? this.part(), this.attempts()[object.id] ?? 0);
  }

  protected faded(id: string): boolean {
    return this.occluded().has(id);
  }

  protected linkQuery(id: string): Record<string, string | null> {
    return { ...sceneQuery(id, this.camera()), ...this.furnitureQuery() };
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
    if (document.querySelector('[role="dialog"][aria-modal="true"]')) return;
    if (this.resetPreview() && !this.layoutBusy()) this.cancelReset();
    else if (this.candidate() && !this.layoutBusy()) this.cancelCandidate();
    else if (this.sheet()) this.closeSheet();
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
    this.note.set(value);
  }

  protected water(object: HomeSceneObject): void {
    const owner = this.owner;
    if (owner == null || object.action.kind !== 'garden' || this.watered().has(object.id)) return;
    const next = new Set(this.watered()).add(object.id);
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

  protected startEditing(): void {
    if (!this.signedIn() || !this.savedItems() || this.draft() || this.recoveryRequired() || this.layoutBusy()) return;
    this.returnObject = this.selected()?.id ?? null;
    this.draft.set(this.baseItems());
    const requested = this.linkedAsset();
    this.pendingInventoryItem = requested?.group === 'shop' ? requested.id : null;
    this.loadInventory();
    if (requested?.group === 'starter') this.pickInventory(requested.id);
    else if (!this.candidate()) this.focusLayout('#home-inventory');
  }

  protected loadInventory(): void {
    const epoch = ++this.editEpoch;
    this.inventoryUnavailable.set(false);
    this.api.getStamps().pipe(
      map(wallet => wallet.entitlements.filter(item => item.active).map(item => item.catalog_id)),
      catchError(() => of(null)),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe(ids => {
      if (!this.alive || epoch !== this.editEpoch || !this.draft()) return;
      this.unlocked.set(ids && new Set(ids));
      this.inventoryUnavailable.set(ids == null);
      const preselect = this.pendingInventoryItem;
      if (preselect && ids?.includes(preselect) && this.linkedAsset()?.id === preselect) this.pickInventory(preselect);
    });
  }

  protected pickInventory(id: string): void {
    const asset = this.inventory().find(item => item.id === id);
    if (!asset || !this.draft() || this.layoutBusy()) return;
    this.pendingInventoryItem = null;
    this.candidate.set(this.newItem(asset.id, asset));
    this.focusLayout('#home-preview');
  }

  protected pickPlaced(id: string): void {
    const item = this.editableItems().find(entry => entry.instance_id === id);
    if (!item || this.layoutBusy()) return;
    this.pendingInventoryItem = null;
    this.returnObject = id;
    this.candidate.set(item);
    this.focusLayout('#home-preview');
  }

  protected pickMilestone(milestone: HomeMilestone, id: string): void {
    const prior = this.milestoneChoice(milestone.id);
    if (!this.milestoneEligible(milestone.id) || !milestone.options.some(option => option.id === id) || this.layoutBusy()) return;
    this.pendingInventoryItem = null;
    this.candidate.set({ ...(prior ?? this.newItem(id, null)), catalog_id: id, instance_id: milestone.id });
    this.focusLayout('#home-preview');
  }

  protected milestoneChoice(id: string): HomeLayoutItem | undefined {
    return (this.draft() ?? this.baseItems()).find(item => item.instance_id === id);
  }

  protected placeOnAxis(axis: 'column' | 'row', value: string): void {
    const number = Number(value);
    if (Number.isInteger(number) && homeFloorPoint(number, number)) this.updateCandidate({ [axis]: number });
  }

  protected placeOnWall(slot: string): void {
    this.updateCandidate({ slot });
  }

  protected rotateCandidate(): void {
    const current = this.candidate();
    if (!current || current.anchor !== 'floor') return;
    const turns = [1, 2, 3, 0] as const;
    this.updateCandidate({ orientation: turns[current.orientation] });
  }

  protected recolorCandidate(palette: number): void {
    if (palette === 0 || palette === 1 || palette === 2 || palette === 3) this.updateCandidate({ palette });
  }

  protected applyCandidate(): void {
    const item = this.candidate();
    const draft = this.draft();
    if (!item || !draft || this.candidateProblem() || this.layoutBusy()) return;
    this.draft.set(withHomeItem(draft, item));
    this.returnObject = item.instance_id;
    this.candidate.set(null);
    this.focusLayout('#home-inventory');
  }

  protected removeCandidate(): void {
    const item = this.candidate();
    const draft = this.draft();
    if (!item || !draft || !this.removable(item) || this.layoutBusy()) return;
    this.draft.set(draft.filter(entry => entry.instance_id !== item.instance_id));
    this.cancelCandidate();
  }

  protected removable(item: HomeLayoutItem): boolean {
    const room = this.room();
    return room != null &&
      !homeObjects(room.id).some(entry => entry.id === item.instance_id && entry.action.kind !== 'placed') &&
      !!this.draft()?.some(entry => entry.instance_id === item.instance_id);
  }

  protected cancelCandidate(): void {
    this.candidate.set(null);
    this.focusLayout('#home-inventory');
  }

  protected cancelEditing(): void {
    if (this.layoutBusy()) return;
    const reload = this.layoutConflict() && !this.conflictReady();
    const target = this.returnObject;
    this.endEditing();
    if (reload) this.retryLayout();
    else this.showConfirmedStatus();
    this.focusRoomAction(target);
  }

  protected retryLayout(): void {
    this.layoutEpoch += 1;
    this.requestLayout();
  }

  protected reapplyDraft(): void {
    const base = this.conflictBase();
    const draft = this.draft();
    if (!base || !draft || !this.conflictReady() || this.recoveryRequired()) return;
    this.draft.set(reapplyHomeChanges(base, draft, this.baseItems()));
    this.conflictBase.set(null);
    this.conflictReady.set(false);
    this.layoutStatus.set('Review your reapplied changes before saving.');
    this.focusLayout('#home-editor-title');
  }

  protected previewReset(): void {
    if (!this.draft() || this.candidate() || this.layoutBusy() || this.layoutConflict()) return;
    this.resetPreview.set(true);
    this.focusLayout('#home-reset-title');
  }

  protected cancelReset(): void {
    if (this.layoutBusy()) return;
    this.resetPreview.set(false);
    this.showConfirmedStatus();
    this.focusLayout('#home-reset');
  }

  protected confirmReset(): void {
    if (!this.resetPreview() || this.resetProblem()) return;
    this.commitLayout('reset', this.resetItems());
  }

  protected undoLayout(): void {
    const prior = this.undo();
    if (!prior || !this.canUndo() || this.draft()) return;
    this.returnObject = this.selected()?.id ?? null;
    this.commitLayout('undo', prior.items);
  }

  protected saveDisabled(): boolean {
    return !this.draft() || !this.changed() || !!this.candidate() || !!this.draftProblem() ||
      this.layoutBusy() || this.layoutConflict() || this.resetPreview() || this.recoveryRequired();
  }

  protected saveCurrent(): void {
    const draft = this.draft();
    if (draft && !this.saveDisabled()) this.commitLayout('save', draft);
  }

  private commitLayout(action: LayoutAction, items: readonly HomeLayoutItem[]): void {
    const room = this.room();
    const owner = this.owner;
    if (!room || owner == null || this.layoutBusy() || this.layoutConflict() || this.recoveryRequired()) return;
    const previous = this.baseItems();
    const epoch = ++this.layoutEpoch;
    this.layoutBusy.set(true);
    this.layoutStatus.set(action === 'undo' ? 'Undoing last save…' : action === 'reset' ? 'Resetting room…' : 'Saving layout…');
    this.api.saveLayout(room.id, { expected_revision: this.layoutRevision(), items: [...items] }).pipe(
      map(data => ({ ok: true as const, data })),
      catchError((error: { error?: { code?: unknown } }) => of({ ok: false as const, error })),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe(result => {
      if (!this.alive || epoch !== this.layoutEpoch || owner !== this.owner || this.room()?.id !== room.id) return;
      this.layoutBusy.set(false);
      if (!result.ok) {
        const code = result.error.error?.code;
        if (code === 'layout_conflict' || code === 'layout_recovery') {
          this.draft.set(items);
          this.candidate.set(null);
          this.resetPreview.set(false);
          this.conflictBase.set(previous);
          this.conflictReady.set(false);
          this.undo.set(null);
          this.requestLayout();
          this.focusLayout('#home-conflict-title');
          return;
        }
        this.layoutStatus.set(action === 'undo' ? 'Undo failed. Your saved room is unchanged.' :
          action === 'reset' ? 'Reset failed. Your saved room and draft are unchanged.' :
          'The layout was not saved. Your changes are still here.');
        if (code === 'layout_entitlement' && this.draft()) {
          this.layoutStatus.set('An item is no longer unlocked. Your changes are still here.');
          this.retry.next();
          this.loadInventory();
        }
        if (action === 'undo') this.focusLayout('#home-undo', '#home-decorate');
        if (action === 'reset') this.focusLayout('#home-reset-cancel');
        return;
      }
      const target = this.returnObject;
      this.adoptLayout(result.data);
      this.undo.set({ revision: result.data.revision, items: previous });
      this.showConfirmedStatus();
      this.endEditing();
      if (action === 'save') this.focusLayout('#home-decorate');
      else this.focusRoomAction(target);
    });
  }

  private unavailableMilestone(item: HomeLayoutItem): boolean {
    const milestone = this.milestones.find(entry => entry.id === item.instance_id);
    return !!milestone && !this.milestoneEligible(milestone.id);
  }

  private newItem(id: string, asset: CosmeticAsset | null): HomeLayoutItem {
    const wallSlots = this.room()?.wallSlots ?? [];
    const instanceId = `piece-${globalThis.crypto.randomUUID()}`;
    const item: HomeLayoutItem = {
      instance_id: instanceId,
      catalog_id: id,
      anchor: asset?.anchor ?? 'floor',
      column: null, row: null, slot: null, orientation: 0, palette: 0,
    };
    if (item.anchor === 'wall') return { ...item, slot: wallSlots[0] ?? null };
    return { ...item, column: 0, row: 0 };
  }

  private updateCandidate(change: Partial<HomeLayoutItem>): void {
    const item = this.candidate();
    if (!item || this.layoutBusy()) return;
    this.candidate.set({ ...item, ...change });
  }

  private focusRoomAction(item: string | null): void {
    const decorate = '#home-decorate:not(:disabled)';
    this.focusLayout(item ? `[data-object="${CSS.escape(item)}"]` : decorate, item ? decorate : '.rooms [aria-current="page"]');
  }

  private focusLayout(selector: string, fallback?: string): void {
    const epoch = this.layoutEpoch;
    afterNextRender(() => {
      if (!this.alive || this.layoutEpoch !== epoch) return;
      const host = this.host.nativeElement;
      const control = host.querySelector<HTMLElement>(selector) ??
        (fallback ? host.querySelector<HTMLElement>(fallback) : null);
      control?.focus();
    }, { injector: this.injector });
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
      this.sceneSize,
    );
    const candidate = this.candidate();
    if (candidate && this.draft()) {
      const placement = homePlacementPoint(point);
      const column = Math.floor(placement.x / HOME_CELL);
      const row = Math.floor((placement.y - HOME_WALL_PX) / HOME_CELL);
      if (candidate.anchor === 'floor' && homeFloorPoint(column, row)) this.updateCandidate({ column, row });
      else if (candidate.anchor === 'wall' && placement.y < HOME_WALL_PX) {
        const slot = HOME_WALL_SLOTS.find(entry => entry.room === room.id && entry.column === column);
        if (slot) this.updateCandidate({ slot: slot.id });
      }
      return;
    }
    if (this.draft()) return;
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
    this.note.set('');
    this.watered.set(new Set());
    this.town.set(null);
    this.townState.set(owner == null ? 'unavailable' : 'loading');
    this.signedIn.set(owner != null);
    this.onRoomChange();
  }

  private invalidateForLock(): void {
    this.note.set('');
    this.dropUncommittedGesture();
    if (this.draft() || this.layoutBusy() || this.undo()) this.onRoomChange();
  }

  private endEditing(): void {
    this.editEpoch += 1;
    this.pendingInventoryItem = null;
    this.draft.set(null);
    this.candidate.set(null);
    this.unlocked.set(null);
    this.conflictBase.set(null);
    this.conflictReady.set(false);
    this.resetPreview.set(false);
    this.returnObject = null;
  }

  private onRoomChange(): void {
    this.layoutEpoch += 1;
    this.layoutBusy.set(false);
    this.undo.set(null);
    this.endEditing();
    this.requestLayout();
  }

  private requestLayout(): void {
    const room = this.room();
    if (!this.layoutConflict()) {
      this.savedItems.set(null);
      this.layoutRevision.set(0);
      this.recoveryRequired.set(false);
    }
    if (this.owner == null || room == null) {
      this.layoutLoading.set(false);
      this.layoutStatus.set(room ? 'Sign in to decorate this room.' : '');
      return;
    }
    this.layoutStatus.set(this.layoutConflict() ? 'Loading the latest saved room…' : 'Loading saved layout…');
    this.layoutRequest.next();
  }

  private adoptLayout(data: RoomLayout): void {
    const room = this.room();
    if (!room || room.id !== data.room_id) return;
    this.recoveryRequired.set(data.recovery_required === true);
    this.savedItems.set(data.revision > 0 && !this.recoveryRequired() ? data.items : starterHomeLayout(room.id));
    this.layoutRevision.set(data.revision);
  }

  private showConfirmedStatus(): void {
    const revision = this.layoutRevision();
    this.layoutStatus.set(this.recoveryRequired() ? 'This layout needs recovery. Starter furniture is shown. Your saved layout is kept.' :
      this.canUndo() ? `Layout saved · Revision ${revision}` : '');
  }

  private publishLayout(result: LayoutLoad): void {
    if (!this.alive || result.epoch !== this.layoutEpoch || result.owner !== this.owner) return;
    if (this.room()?.id !== result.roomId) return;
    this.layoutLoading.set(false);
    if (result.failed || result.data?.room_id !== result.roomId) {
      this.layoutStatus.set(this.layoutConflict() ? 'The latest layout could not be loaded. Your draft is kept.' :
        'The saved layout could not be loaded.');
      return;
    }
    this.adoptLayout(result.data);
    if (this.layoutConflict()) {
      this.conflictReady.set(true);
      if (!this.recoveryRequired()) {
        this.layoutStatus.set('The scene shows the latest saved room.');
        return;
      }
    }
    this.showConfirmedStatus();
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
    this.publish(sceneQuery(this.query().get('object'), camera));
  }

  private publish(query: Record<string, string | null>, after?: () => void): void {
    if (!this.alive) return;
    const owner = this.owner;
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { ...query, ...this.furnitureQuery() },
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
