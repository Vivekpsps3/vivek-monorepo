/** One cosmetic catalog: twelve free starters and twelve priced shop items. */

export const COSMETIC_CATALOG_VERSION = 1;
export const COSMETIC_CELL_PX = 56;
export const COSMETIC_ROOM_CELLS = 12;
export const COSMETIC_LAYOUT_CAP = 64;
export const LAYOUT_CELL_PX = 24;

const ATTRIBUTION = 'Original artwork for Terraria-on-Sea';
const LICENSE = 'No separate license published';

export type CosmeticGroup = 'starter' | 'shop';
export type CosmeticPart = 'day' | 'night';
export type CosmeticAnchor = 'floor' | 'wall';

export interface CosmeticAsset {
  readonly id: string;
  readonly label: string;
  readonly group: CosmeticGroup;
  readonly priceStamps: number;
  readonly footprint: { readonly columns: number; readonly rows: number };
  readonly layer: number;
  readonly anchor: CosmeticAnchor;
  /** Baseline the later room editor shares. Floor sits on the bottom edge; wall hangs from the top. */
  readonly anchorPoint: { readonly x: number; readonly y: number };
  readonly bounds: { readonly width: number; readonly height: number };
  /** May overlap a declared surface. */
  readonly stackable: boolean;
  /** Other items may stack on this footprint. */
  readonly surface: boolean;
  readonly variants: { readonly day: string; readonly night: string };
  readonly attribution: string;
  readonly license: string;
}

export interface CosmeticPlacement {
  readonly instanceId: string;
  readonly catalogId: string;
  readonly column: number;
  readonly row: number;
  readonly orientation: 0 | 1 | 2 | 3;
}

interface ItemSpec {
  readonly id: string;
  readonly label: string;
  readonly group: CosmeticGroup;
  readonly priceStamps: number;
  readonly columns: number;
  readonly rows: number;
  readonly layer: number;
  readonly anchor: CosmeticAnchor;
  readonly stackable: boolean;
  readonly surface: boolean;
}

function define(spec: ItemSpec): CosmeticAsset {
  const width = spec.columns * COSMETIC_CELL_PX;
  const height = spec.rows * COSMETIC_CELL_PX;
  return Object.freeze({
    id: spec.id,
    label: spec.label,
    group: spec.group,
    priceStamps: spec.priceStamps,
    footprint: Object.freeze({ columns: spec.columns, rows: spec.rows }),
    layer: spec.layer,
    anchor: spec.anchor,
    anchorPoint: Object.freeze({ x: width / 2, y: spec.anchor === 'floor' ? height : 0 }),
    bounds: Object.freeze({ width, height }),
    stackable: spec.stackable,
    surface: spec.surface,
    variants: Object.freeze({
      day: `/town/cosmetics/${spec.id}-day.svg`,
      night: `/town/cosmetics/${spec.id}-night.svg`,
    }),
    attribution: ATTRIBUTION,
    license: LICENSE,
  });
}

const starter = (
  id: string, label: string, columns: number, rows: number, layer: number, anchor: CosmeticAnchor,
  stackable = false, surface = false,
): ItemSpec => ({ id, label, group: 'starter', priceStamps: 0, columns, rows, layer, anchor, stackable, surface });

const shop = (
  id: string, label: string, priceStamps: number, columns: number, rows: number, layer: number, anchor: CosmeticAnchor,
  stackable = false, surface = false,
): ItemSpec => ({ id, label, group: 'shop', priceStamps, columns, rows, layer, anchor, stackable, surface });

export const cosmeticCatalog: readonly CosmeticAsset[] = Object.freeze([
  starter('oak-seat', 'Oak seat', 1, 1, 3, 'floor'),
  starter('low-table', 'Low table', 2, 1, 2, 'floor', false, true),
  starter('woven-rug', 'Woven rug', 2, 2, 1, 'floor'),
  starter('bookshelf', 'Bookshelf', 1, 2, 4, 'floor'),
  starter('desk', 'Desk', 2, 1, 3, 'floor', false, true),
  starter('desk-lamp', 'Desk lamp', 1, 1, 5, 'floor', true),
  starter('fern', 'Fern', 1, 1, 3, 'floor'),
  starter('floor-lantern', 'Floor lantern', 1, 1, 3, 'floor'),
  starter('plain-frame', 'Plain frame', 1, 1, 2, 'wall'),
  starter('record-stand', 'Record stand', 1, 1, 3, 'floor'),
  starter('bed', 'Bed', 2, 3, 2, 'floor'),
  starter('planter', 'Planter', 1, 1, 3, 'floor'),
  shop('shell-stool', 'Shell stool', 5, 1, 1, 3, 'floor'),
  shop('brass-sconce', 'Brass sconce', 5, 1, 1, 3, 'wall'),
  shop('paper-screen', 'Paper screen', 5, 1, 2, 4, 'floor'),
  shop('coral-cushion', 'Coral cushion', 5, 1, 1, 2, 'floor', true),
  shop('tile-fountain', 'Tile fountain', 10, 2, 2, 3, 'floor'),
  shop('reading-chair', 'Reading chair', 10, 1, 1, 3, 'floor'),
  shop('globe', 'Globe', 10, 1, 1, 4, 'floor'),
  shop('hanging-ivy', 'Hanging ivy', 10, 1, 2, 2, 'wall'),
  shop('glass-cabinet', 'Glass cabinet', 20, 1, 2, 4, 'floor'),
  shop('skylight-panel', 'Skylight panel', 20, 2, 1, 1, 'wall'),
  shop('model-ferry', 'Model ferry', 20, 2, 1, 3, 'floor'),
  shop('moon-clock', 'Moon clock', 20, 1, 1, 3, 'wall'),
].map(define));

const catalogById = new Map(cosmeticCatalog.map(item => [item.id, item]));

/**
 * The nine existing milestone ornament identities. They stay outside this catalog:
 * no price, no artwork, and no starter or shop group.
 */
export const MILESTONE_ORNAMENT_IDS: readonly string[] = Object.freeze([
  'stepping-stone', 'small-planter', 'wooden-lantern',
  'wind-vane', 'shell-marker', 'path-lamp',
  'bench', 'bird-bath', 'civic-pennant',
]);

export const SAMPLE_COSMETIC_LAYOUT: readonly CosmeticPlacement[] = Object.freeze([
  Object.freeze({ instanceId: 'sample-oak-seat', catalogId: 'oak-seat', column: 1, row: 2, orientation: 0 as const }),
  Object.freeze({ instanceId: 'sample-missing', catalogId: 'missing-keepsake', column: 4, row: 3, orientation: 0 as const }),
]);

export function cosmeticById(id: string): CosmeticAsset | null {
  return catalogById.get(id) ?? null;
}

export function cosmeticPriceLabel(item: CosmeticAsset): string {
  return item.group === 'starter' && item.priceStamps === 0 ? 'Free' : `${item.priceStamps} Stamps`;
}

export function copyCosmeticLayout(layout: readonly CosmeticPlacement[]): CosmeticPlacement[] {
  return layout.map(item => ({
    instanceId: item.instanceId,
    catalogId: item.catalogId,
    column: item.column,
    row: item.row,
    orientation: item.orientation,
  }));
}

export function footprintFits(asset: CosmeticAsset, column: number, row: number): boolean {
  return Number.isInteger(column) && Number.isInteger(row)
    && column >= 0 && row >= 0
    && column + asset.footprint.columns <= COSMETIC_ROOM_CELLS
    && row + asset.footprint.rows <= COSMETIC_ROOM_CELLS;
}

/** Append a placement. A full layout or an unknown call returns null and leaves the previous entries untouched. */
export function nextCosmeticLayout(
  layout: readonly CosmeticPlacement[],
  placement: CosmeticPlacement,
): readonly CosmeticPlacement[] | null {
  if (layout.length >= COSMETIC_LAYOUT_CAP) return null;
  return [...layout, placement];
}

export function variantSrc(asset: CosmeticAsset, part: CosmeticPart, paint: number): string {
  return `${asset.variants[part]}?paint=${paint}`;
}
