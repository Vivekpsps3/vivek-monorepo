import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { distinctUntilChanged, map } from 'rxjs';
import { ThemeService, UiButtonComponent } from '@vivek/ui';
import { SessionService } from '../platform/session.service';
import {
  COSMETIC_ROOM_CELLS,
  LAYOUT_CELL_PX,
  SAMPLE_COSMETIC_LAYOUT,
  cosmeticById,
  cosmeticCatalog,
  cosmeticPriceLabel,
  copyCosmeticLayout,
  footprintFits,
  nextCosmeticLayout,
  variantSrc,
  type CosmeticAsset,
  type CosmeticPart,
  type CosmeticPlacement,
} from './cosmetic-catalog';
import { TownPlaceComponent, type PlaceCrumb } from './town-place.component';

interface LayoutPiece {
  readonly placement: CosmeticPlacement;
  readonly asset: CosmeticAsset | null;
  readonly label: string;
  readonly unsupported: boolean;
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
  readonly layer: number;
  readonly src: string | null;
}

@Component({
  selector: 'app-town-cosmetic-catalog',
  imports: [RouterLink, UiButtonComponent, TownPlaceComponent],
  templateUrl: './cosmetic-catalog.component.html',
  styleUrl: './cosmetic-catalog.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CosmeticCatalogComponent {
  private readonly session = inject(SessionService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly themeService = inject(ThemeService);
  private readonly layouts = new Map<number, CosmeticPlacement[]>();
  private owner: number | null = null;
  private alive = true;

  protected readonly catalog = cosmeticCatalog;
  protected readonly starters = cosmeticCatalog.filter(item => item.group === 'starter');
  protected readonly shopItems = cosmeticCatalog.filter(item => item.group === 'shop');
  protected readonly cells = Array.from({ length: COSMETIC_ROOM_CELLS }, (_, index) => index);
  protected readonly stageSize = COSMETIC_ROOM_CELLS * LAYOUT_CELL_PX;
  protected readonly priceLabel = cosmeticPriceLabel;
  protected readonly theme = toSignal(this.themeService.theme$, { requireSync: true });
  private readonly params = toSignal(this.route.queryParamMap, { requireSync: true });
  protected readonly paintToken = signal(0);
  protected readonly draftColumn = signal(0);
  protected readonly draftRow = signal(0);
  protected readonly layoutNote = signal('');
  protected readonly layout = signal<readonly CosmeticPlacement[]>(copyCosmeticLayout(SAMPLE_COSMETIC_LAYOUT));
  private readonly loadedSrc = signal<ReadonlySet<string>>(new Set());
  private readonly failedSrc = signal<ReadonlySet<string>>(new Set());

  protected readonly part = computed<CosmeticPart>(() => this.params().get('part') === 'night' ? 'night' : 'day');
  protected readonly selectedId = computed(() => this.params().get('item') ?? 'oak-seat');
  protected readonly selectedAsset = computed(() => cosmeticById(this.selectedId()));
  protected readonly previewSrc = computed(() => {
    const asset = this.selectedAsset();
    return asset ? variantSrc(asset, this.part(), this.paintToken()) : null;
  });
  protected readonly previewPainted = computed(() => {
    const src = this.previewSrc();
    return src != null && this.loadedSrc().has(src);
  });
  protected readonly previewFailed = computed(() => {
    const src = this.previewSrc();
    return src != null && this.failedSrc().has(src);
  });
  protected readonly pieces = computed<readonly LayoutPiece[]>(() => this.layout().map(placement => {
    const asset = cosmeticById(placement.catalogId);
    const columns = asset?.footprint.columns ?? 1;
    const rows = asset?.footprint.rows ?? 1;
    return {
      placement,
      asset,
      label: asset?.label ?? 'Unsupported item',
      unsupported: asset == null,
      left: placement.column * LAYOUT_CELL_PX,
      top: placement.row * LAYOUT_CELL_PX,
      width: columns * LAYOUT_CELL_PX,
      height: rows * LAYOUT_CELL_PX,
      layer: asset?.layer ?? 0,
      src: asset ? variantSrc(asset, this.part(), this.paintToken()) : null,
    };
  }));
  protected readonly crumbs = computed((): readonly PlaceCrumb[] => {
    const asset = this.selectedAsset();
    return [
      { label: 'Town', href: '/town' },
      { label: 'Cosmetic catalog', href: '/town/cosmetics', query: { part: this.part() } },
      { label: asset?.label ?? 'Unsupported item' },
    ];
  });
  protected readonly fits = computed(() => {
    const asset = this.selectedAsset();
    return asset != null && asset.group === 'starter' && asset.priceStamps === 0
      && footprintFits(asset, this.draftColumn(), this.draftRow());
  });

  constructor() {
    const destroyRef = inject(DestroyRef);
    destroyRef.onDestroy(() => { this.alive = false; });
    this.session.user$.pipe(
      map(user => user?.id ?? null),
      distinctUntilChanged(),
      takeUntilDestroyed(),
    ).subscribe(owner => this.adoptOwner(owner));
  }

  protected query(item: string): { item: string; part: CosmeticPart } {
    return { item, part: this.part() };
  }

  protected artFor(asset: CosmeticAsset): string {
    return variantSrc(asset, this.part(), this.paintToken());
  }

  protected setPart(part: CosmeticPart): void {
    if (!this.alive) return;
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { item: this.selectedId(), part },
      replaceUrl: true,
    });
  }

  protected setColumn(event: Event): void {
    this.draftColumn.set(this.cellFrom(event));
  }

  protected setRow(event: Event): void {
    this.draftRow.set(this.cellFrom(event));
  }

  protected placeFreeItem(): void {
    const owner = this.owner;
    const asset = this.selectedAsset();
    if (owner == null || !asset || asset.group !== 'starter' || asset.priceStamps !== 0) return;
    if (!footprintFits(asset, this.draftColumn(), this.draftRow())) {
      this.layoutNote.set(`${asset.label} does not fit at column ${this.draftColumn()}, row ${this.draftRow()}.`);
      return;
    }
    const stored = this.layouts.get(owner);
    if (!stored) return;
    const placement: CosmeticPlacement = {
      instanceId: `placed-${asset.id}-${this.draftColumn()}-${this.draftRow()}-${stored.length}`,
      catalogId: asset.id,
      column: this.draftColumn(),
      row: this.draftRow(),
      orientation: 0,
    };
    const next = nextCosmeticLayout(stored, placement);
    if (!next) {
      this.layoutNote.set('This layout already holds 64 items.');
      return;
    }
    stored.push(placement);
    this.layout.set(copyCosmeticLayout(stored));
    this.layoutNote.set('');
  }

  protected retryArt(): void {
    this.paintToken.update(token => token + 1);
    this.failedSrc.set(new Set());
    this.focusSelected();
  }

  protected artLoaded(event: Event): void {
    if (!this.alive) return;
    const src = this.eventSrc(event);
    if (!src) return;
    this.loadedSrc.update(loaded => loaded.has(src) ? loaded : new Set(loaded).add(src));
  }

  protected artFailed(event: Event): void {
    if (!this.alive) return;
    const src = this.eventSrc(event);
    if (!src) return;
    this.failedSrc.update(failed => failed.has(src) ? failed : new Set(failed).add(src));
  }

  protected shown(src: string | null): boolean {
    return src != null && this.loadedSrc().has(src);
  }

  private adoptOwner(owner: number | null): void {
    this.owner = owner;
    this.paintToken.update(token => token + 1);
    this.loadedSrc.set(new Set());
    this.failedSrc.set(new Set());
    this.draftColumn.set(0);
    this.draftRow.set(0);
    this.layoutNote.set('');
    if (owner == null) {
      this.layouts.clear();
      this.layout.set(copyCosmeticLayout(SAMPLE_COSMETIC_LAYOUT));
      return;
    }
    this.layout.set(copyCosmeticLayout(this.remember(owner)));
  }

  private remember(owner: number): CosmeticPlacement[] {
    let found = this.layouts.get(owner);
    if (!found) {
      found = copyCosmeticLayout(SAMPLE_COSMETIC_LAYOUT);
      this.layouts.set(owner, found);
    }
    return found;
  }

  private cellFrom(event: Event): number {
    const value = event.target instanceof HTMLSelectElement ? Number(event.target.value) : Number.NaN;
    return Number.isInteger(value) && value >= 0 && value < COSMETIC_ROOM_CELLS ? value : 0;
  }

  private eventSrc(event: Event): string | null {
    const img = event.currentTarget;
    if (!(img instanceof HTMLImageElement)) return null;
    const src = img.getAttribute('src');
    if (!src || !src.includes(`paint=${this.paintToken()}`)) return null;
    return src;
  }

  private focusSelected(): void {
    const id = this.selectedId();
    const link = /^[a-z0-9-]{1,40}$/.test(id)
      ? this.host.nativeElement.querySelector<HTMLElement>(`[data-catalog-id="${id}"]`)
      : null;
    (link ?? this.host.nativeElement.querySelector<HTMLElement>('.choices a'))?.focus();
  }
}
