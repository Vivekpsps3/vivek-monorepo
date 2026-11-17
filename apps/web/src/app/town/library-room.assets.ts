const palette = { light: 'light', dark: 'dark' } as const;
const source = { attribution: 'Original artwork for Terraria-on-Sea', license: 'No separate license published' };
const art = '/town/library';

interface RoomAsset {
  readonly id: string;
  readonly src: string;
  readonly bounds: { width: number; height: number };
  readonly anchor: { x: number; y: number };
  readonly layer: number;
  readonly palette: typeof palette;
  readonly source: typeof source;
  readonly motion: 'static';
}

export const readingRoom = {
  id: 'room',
  src: `${art}/room.svg`,
  bounds: { width: 600, height: 400 },
  anchor: { x: 0, y: 0 },
  layer: 0,
  palette,
  source,
  motion: 'static',
} as const satisfies RoomAsset;

const assets = {
  shelves: {
    id: 'shelves', src: `${art}/shelves.svg`,
    bounds: { width: 156, height: 161 }, anchor: { x: 79, y: 142 }, layer: 2,
    palette, source, motion: 'static',
  },
  desk: {
    id: 'desk', src: `${art}/desk.svg`,
    bounds: { width: 172, height: 130 }, anchor: { x: 84, y: 114 }, layer: 3,
    palette, source, motion: 'static',
  },
  calendar: {
    id: 'calendar', src: `${art}/calendar.svg`,
    bounds: { width: 134, height: 108 }, anchor: { x: 67, y: 84 }, layer: 1,
    palette, source, motion: 'static',
  },
} as const satisfies Record<string, RoomAsset>;

export const readingRoomObjects = [
  {
    asset: assets.shelves, x: 160, y: 231, label: 'Bookshelves',
    detail: 'Browse the books saved in your Media library.',
    action: 'Browse saved books', link: '/media/library', query: { kind: 'book' },
  },
  {
    asset: assets.desk, x: 320, y: 315, label: 'Reading desk',
    detail: 'Pick up the titles you have in progress in Media.',
    action: 'Open Media Now', link: '/media', query: undefined,
  },
  {
    asset: assets.calendar, x: 463, y: 157, label: 'Wall calendar',
    detail: 'See upcoming releases and air dates in your Media calendar.',
    action: 'Open Media calendar', link: '/media/calendar', query: undefined,
  },
].map(object => ({
  ...object,
  // Place the painted image and its link in the same rectangle.
  left: 100 * (object.x - object.asset.anchor.x) / readingRoom.bounds.width,
  top: 100 * (object.y - object.asset.anchor.y) / readingRoom.bounds.height,
  width: 100 * object.asset.bounds.width / readingRoom.bounds.width,
  height: 100 * object.asset.bounds.height / readingRoom.bounds.height,
}));

export type ReadingRoomAsset = typeof readingRoom | typeof assets[keyof typeof assets];
