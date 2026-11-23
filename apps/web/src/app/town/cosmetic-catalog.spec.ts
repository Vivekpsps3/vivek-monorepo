import {
  COSMETIC_CELL_PX,
  COSMETIC_LAYOUT_CAP,
  MILESTONE_ORNAMENT_IDS,
  SAMPLE_COSMETIC_LAYOUT,
  cosmeticById,
  cosmeticCatalog,
  cosmeticPriceLabel,
  footprintFits,
  nextCosmeticLayout,
} from './cosmetic-catalog';

const STARTERS = [
  ['oak-seat', 'Oak seat', 1, 1, 3, 'floor', false, false],
  ['low-table', 'Low table', 2, 1, 2, 'floor', false, true],
  ['woven-rug', 'Woven rug', 2, 2, 1, 'floor', false, false],
  ['bookshelf', 'Bookshelf', 1, 2, 4, 'floor', false, false],
  ['desk', 'Desk', 2, 1, 3, 'floor', false, true],
  ['desk-lamp', 'Desk lamp', 1, 1, 5, 'floor', true, false],
  ['fern', 'Fern', 1, 1, 3, 'floor', false, false],
  ['floor-lantern', 'Floor lantern', 1, 1, 3, 'floor', false, false],
  ['plain-frame', 'Plain frame', 1, 1, 2, 'wall', false, false],
  ['record-stand', 'Record stand', 1, 1, 3, 'floor', false, false],
  ['bed', 'Bed', 2, 3, 2, 'floor', false, false],
  ['planter', 'Planter', 1, 1, 3, 'floor', false, false],
] as const;

const SHOP = [
  ['shell-stool', 'Shell stool', 5, 1, 1, 3, 'floor'],
  ['brass-sconce', 'Brass sconce', 5, 1, 1, 3, 'wall'],
  ['paper-screen', 'Paper screen', 5, 1, 2, 4, 'floor'],
  ['coral-cushion', 'Coral cushion', 5, 1, 1, 2, 'floor'],
  ['tile-fountain', 'Tile fountain', 10, 2, 2, 3, 'floor'],
  ['reading-chair', 'Reading chair', 10, 1, 1, 3, 'floor'],
  ['globe', 'Globe', 10, 1, 1, 4, 'floor'],
  ['hanging-ivy', 'Hanging ivy', 10, 1, 2, 2, 'wall'],
  ['glass-cabinet', 'Glass cabinet', 20, 1, 2, 4, 'floor'],
  ['skylight-panel', 'Skylight panel', 20, 2, 1, 1, 'wall'],
  ['model-ferry', 'Model ferry', 20, 2, 1, 3, 'floor'],
  ['moon-clock', 'Moon clock', 20, 1, 1, 3, 'wall'],
] as const;

const MILESTONES = [
  'stepping-stone', 'small-planter', 'wooden-lantern',
  'wind-vane', 'shell-marker', 'path-lamp',
  'bench', 'bird-bath', 'civic-pennant',
];

describe('cosmetic catalog', () => {
  it('lists twelve free starters and twelve priced shop items', () => {
    expect(COSMETIC_CELL_PX).toBe(56);
    expect(cosmeticCatalog).toHaveSize(24);
    expect(cosmeticCatalog.filter(item => item.group === 'starter')).toHaveSize(12);
    expect(cosmeticCatalog.filter(item => item.group === 'shop')).toHaveSize(12);
    expect(new Set(cosmeticCatalog.map(item => item.id)).size).toBe(24);

    STARTERS.forEach(([id, label, columns, rows, layer, anchor, stackable, surface], index) => {
      const item = cosmeticCatalog[index];
      expect(item.id).toBe(id);
      expect(item.label).toBe(label);
      expect(item.group).toBe('starter');
      expect(item.priceStamps).toBe(0);
      expect(cosmeticPriceLabel(item)).toBe('Free');
      expect(item.footprint).toEqual({ columns, rows });
      expect(item.layer).toBe(layer);
      expect(item.anchor).toBe(anchor);
      expect(item.stackable).toBe(stackable);
      expect(item.surface).toBe(surface);
      expect(item.bounds).toEqual({ width: columns * 56, height: rows * 56 });
      expect(item.anchorPoint).toEqual({ x: columns * 28, y: anchor === 'floor' ? rows * 56 : 0 });
      expect(item.variants.day).toBe(`/town/cosmetics/${id}-day.svg`);
      expect(item.variants.night).toBe(`/town/cosmetics/${id}-night.svg`);
      expect(item.attribution).toBe('Original artwork for Terraria-on-Sea');
      expect(item.license).toBe('No separate license published');
      expect(id).toMatch(/^[a-z0-9-]{1,40}$/);
    });

    SHOP.forEach(([id, label, price, columns, rows, layer, anchor], index) => {
      const item = cosmeticCatalog[STARTERS.length + index];
      expect(item.id).toBe(id);
      expect(item.label).toBe(label);
      expect(item.group).toBe('shop');
      expect(item.priceStamps).toBe(price);
      expect(cosmeticPriceLabel(item)).toBe(`${price} Stamps`);
      expect(item.footprint).toEqual({ columns, rows });
      expect(item.layer).toBe(layer);
      expect(item.anchor).toBe(anchor);
      expect(item.bounds).toEqual({ width: columns * 56, height: rows * 56 });
      expect(item.variants.day).not.toBe(item.variants.night);
    });
    expect(cosmeticCatalog.find(item => item.id === 'coral-cushion')?.stackable).toBeTrue();
    expect(cosmeticById('moon-clock')?.priceStamps).toBe(20);
    expect(cosmeticById('missing-keepsake')).toBeNull();
  });

  it('keeps the nine milestone ornaments outside the starter and shop catalog', () => {
    expect([...MILESTONE_ORNAMENT_IDS]).toEqual(MILESTONES);
    for (const id of MILESTONES) {
      expect(cosmeticById(id)).withContext(id).toBeNull();
      expect(cosmeticCatalog.some(item => item.id === id || item.label.toLowerCase() === id.replaceAll('-', ' '))).toBeFalse();
    }
  });

  it('keeps an unsupported placement when a layout grows or is already full', () => {
    const oak = cosmeticById('oak-seat');
    const bed = cosmeticById('bed');
    if (!oak || !bed) throw new Error('starter items missing');
    expect(footprintFits(oak, 0, 0)).toBeTrue();
    expect(footprintFits(bed, 11, 0)).toBeFalse();
    expect(footprintFits(bed, 10, 9)).toBeTrue();
    const added = nextCosmeticLayout(SAMPLE_COSMETIC_LAYOUT, {
      instanceId: 'placed-fern', catalogId: 'fern', column: 0, row: 0, orientation: 0,
    });
    expect(added?.map(item => item.catalogId)).toEqual(['oak-seat', 'missing-keepsake', 'fern']);
    expect(SAMPLE_COSMETIC_LAYOUT.map(item => item.catalogId)).toEqual(['oak-seat', 'missing-keepsake']);

    let full = [...SAMPLE_COSMETIC_LAYOUT];
    while (full.length < COSMETIC_LAYOUT_CAP) {
      const next = nextCosmeticLayout(full, {
        instanceId: `extra-${full.length}`, catalogId: 'planter', column: 0, row: 0, orientation: 0,
      });
      if (!next) throw new Error('layout rejected before the cap');
      full = [...next];
    }
    expect(full).toHaveSize(64);
    expect(nextCosmeticLayout(full, {
      instanceId: 'overflow', catalogId: 'fern', column: 0, row: 0, orientation: 0,
    })).toBeNull();
    expect(full.some(item => item.catalogId === 'missing-keepsake')).toBeTrue();
    expect(full).toHaveSize(64);
  });
});
