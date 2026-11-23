import { roomRect, sceneFrame } from './library-room.scene';

const palette = { light: 'light', dark: 'dark' } as const;
const source = { attribution: 'Original artwork for Terraria-on-Sea', license: 'No separate license published' };
const art = '/town/hall';

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

export const hallRoom = {
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
  rules: {
    id: 'rules', src: `${art}/rules.svg`,
    bounds: { width: 156, height: 161 }, anchor: { x: 79, y: 142 }, layer: 2,
    palette, source, motion: 'static',
  },
  progress: {
    id: 'progress', src: `${art}/progress.svg`,
    bounds: { width: 172, height: 130 }, anchor: { x: 84, y: 114 }, layer: 3,
    palette, source, motion: 'static',
  },
  archive: {
    id: 'archive', src: `${art}/archive.svg`,
    bounds: { width: 134, height: 108 }, anchor: { x: 67, y: 84 }, layer: 1,
    palette, source, motion: 'static',
  },
} as const satisfies Record<string, RoomAsset>;

export const hallObjects = [
  {
    asset: assets.rules, x: 160, y: 231, label: 'Rules board',
    detail: 'Town levels, XP awards, and daily caps from the current rules.',
  },
  {
    // The dial overlaps the rules board. Its higher layer is the front object.
    asset: assets.progress, x: 234, y: 319, label: 'Progress dial',
    detail: 'This town’s level and XP, and each active habit.',
  },
  {
    asset: assets.archive, x: 463, y: 157, label: 'Archive ledger',
    detail: 'Archived habits keep their level and XP, and open the existing history.',
  },
].map(object => ({
  ...object,
  ...sceneFrame(roomRect(object), hallRoom.bounds),
}));

export type HallRoomAsset = typeof hallRoom | typeof assets[keyof typeof assets];
