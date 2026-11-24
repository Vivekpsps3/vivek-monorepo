/** Four Home rooms. Floor cells and wall slots share the Town y-down frame. */

import {
  COSMETIC_ROOM_CELLS,
  LAYOUT_CELL_PX,
  cosmeticById,
  footprintAtTurn,
  type CosmeticAsset,
} from './cosmetic-catalog';
import type { HomeLayoutItem, HomePalette, HomeTurn } from './home-layout';
import { homeMilestoneOption } from './home-milestones';
import { roomRect, sceneFrame, type RoomRect, type ScenePlacement } from './library-room.scene';

export const HOME_CELL = LAYOUT_CELL_PX;
export const HOME_FLOOR_CELLS = COSMETIC_ROOM_CELLS;
export const HOME_WALL_PX = HOME_CELL * 3;
export const HOME_WALL_CAP = 16;
export const HOME_NOTE_LIMIT = 500;
export const HOME_ROOM_BOUNDS = Object.freeze({
  width: HOME_FLOOR_CELLS * HOME_CELL,
  height: HOME_WALL_PX + HOME_FLOOR_CELLS * HOME_CELL,
});
export const HOME_DOORWAY = Object.freeze({ column: 5, row: 10, columns: 2, rows: 2 });

export const HOME_VIEW = { width: 288, height: 228 };
// The four cutaway artworks share these back edge, floor and threshold coordinates.
const viewFloor = { left: 12, top: 64, width: 228, height: 144 };
const floorWidthScale = viewFloor.width / HOME_ROOM_BOUNDS.width;
const floorHeightScale = viewFloor.height / (HOME_FLOOR_CELLS * HOME_CELL);
const floorSkew = 0.25;
const wallHeightScale = 0.7;

export const HOME_VIEW_GRID = {
  ...sceneFrame(viewFloor, HOME_VIEW),
  skew: `${Math.atan(floorSkew)}rad`,
};

function homeViewLeft(x: number, viewY: number): number {
  return viewFloor.left + x * floorWidthScale + Math.max(0, viewY - viewFloor.top) * floorSkew;
}

export function homePlacementPoint(view: { x: number; y: number }): { x: number; y: number } {
  const depth = view.y - viewFloor.top;
  return {
    x: (view.x - homeViewLeft(0, view.y)) / floorWidthScale,
    y: HOME_WALL_PX + depth / (depth < 0 ? wallHeightScale : floorHeightScale),
  };
}

/** Project the anchor and leave the furniture upright. The same rect paints and picks the sprite. */
export function homeViewItem(object: HomeSceneObject): HomeSceneObject {
  const wall = object.asset.anchor.y === 0;
  const depth = (object.y - HOME_WALL_PX) * (wall ? wallHeightScale : floorHeightScale);
  const y = viewFloor.top + depth;
  const x = homeViewLeft(object.x, y);
  const { width, height } = object.asset.bounds;
  const bounds = { width, height: height * 1.16 };
  const anchor = { x: bounds.width / 2, y: wall ? 0 : bounds.height };
  const projected = { ...object, x, y, asset: { ...object.asset, bounds, anchor } };
  return { ...projected, ...sceneFrame(roomRect(projected), HOME_VIEW) };
}

export function homeViewFootprint(object: HomeSceneObject): RoomRect {
  if (object.asset.anchor.y === 0) return homeViewItem(object);
  const rect = roomRect(object);
  const top = viewFloor.top + (rect.top - HOME_WALL_PX) * floorHeightScale;
  return sceneFrame({
    left: homeViewLeft(rect.left, top),
    top,
    width: rect.width * floorWidthScale,
    height: rect.height * floorHeightScale,
  }, HOME_VIEW);
}


export const HOME_ROOM_IDS = ['living', 'study', 'bedroom', 'courtyard'] as const;
export type HomeRoomId = (typeof HOME_ROOM_IDS)[number];

export type HomeAction =
  | { readonly kind: 'sample'; readonly title: string; readonly caption: string }
  | { readonly kind: 'media'; readonly label: string; readonly href: '/media/library'; readonly query: { readonly kind: 'book' | 'artist' } }
  | { readonly kind: 'note' }
  | { readonly kind: 'garden'; readonly verb: string; readonly done: string }
  | { readonly kind: 'placed' };

export interface HomeWallSlot {
  readonly id: string;
  readonly room: HomeRoomId;
  readonly column: number;
  readonly top: number;
}

export interface HomeObject {
  readonly id: string;
  readonly room: HomeRoomId;
  readonly catalogId: string;
  readonly label: string;
  readonly detail: string;
  readonly primary: boolean;
  readonly action: HomeAction;
  readonly floor: { readonly column: number; readonly row: number } | null;
  readonly wallSlot: string | null;
}

export interface HomeSceneObject extends ScenePlacement {
  readonly id: string;
  readonly room: HomeRoomId;
  readonly catalogId: string;
  readonly label: string;
  readonly detail: string;
  readonly primary: boolean;
  readonly action: HomeAction;
  readonly orientation: HomeTurn;
  readonly palette: HomePalette;
  readonly ornamentArt: string | null;
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export interface HomeRoom {
  readonly id: HomeRoomId;
  readonly label: string;
  readonly src: string;
  readonly wallSlots: readonly string[];
}

export const HOME_WALL_SLOTS: readonly HomeWallSlot[] = Object.freeze([
  Object.freeze({ id: 'living-north', room: 'living', column: 6, top: 16 }),
  Object.freeze({ id: 'living-west', room: 'living', column: 1, top: 16 }),
  Object.freeze({ id: 'study-north', room: 'study', column: 4, top: 16 }),
  Object.freeze({ id: 'study-east', room: 'study', column: 10, top: 16 }),
  Object.freeze({ id: 'bedroom-north', room: 'bedroom', column: 8, top: 16 }),
  Object.freeze({ id: 'bedroom-west', room: 'bedroom', column: 1, top: 16 }),
  Object.freeze({ id: 'courtyard-north', room: 'courtyard', column: 4, top: 8 }),
  Object.freeze({ id: 'courtyard-east', room: 'courtyard', column: 10, top: 8 }),
]);

const slotById = new Map(HOME_WALL_SLOTS.map(slot => [slot.id, slot]));

interface ObjectSpec {
  readonly id: string;
  readonly room: HomeRoomId;
  readonly catalogId: string;
  readonly detail: string;
  readonly primary?: boolean;
  readonly action: HomeAction;
  readonly floor?: { readonly column: number; readonly row: number };
  readonly wallSlot?: string;
}

function place(spec: ObjectSpec): HomeObject {
  const asset = cosmeticById(spec.catalogId);
  if (!asset) throw new Error(`Missing starter ${spec.catalogId}`);
  const floor = spec.floor ?? null;
  const wallSlot = spec.wallSlot ?? null;
  if ((floor == null) === (wallSlot == null)) throw new Error(`${spec.id} needs one floor cell or one wall slot`);
  return Object.freeze({
    id: spec.id,
    room: spec.room,
    catalogId: spec.catalogId,
    label: asset.label,
    detail: spec.detail,
    primary: spec.primary === true,
    action: spec.action,
    floor,
    wallSlot,
  });
}

const sample = (title: string): HomeAction => Object.freeze({
  kind: 'sample',
  title,
  caption: 'A labeled sample. No photo is saved.',
});

const HOME_OBJECT_SPECS: readonly ObjectSpec[] = [
  {
    id: 'living-rug', room: 'living', catalogId: 'woven-rug', floor: { column: 1, row: 2 },
    detail: 'The starter rug marks the floor and leaves the doorway open.',
    action: { kind: 'placed' },
  },
  {
    id: 'living-table', room: 'living', catalogId: 'low-table', floor: { column: 4, row: 4 },
    detail: 'A low table beside the rug.',
    action: { kind: 'placed' },
  },
  {
    id: 'living-seat', room: 'living', catalogId: 'oak-seat', floor: { column: 4, row: 6 },
    detail: 'An oak seat beside the table.',
    action: { kind: 'placed' },
  },
  {
    id: 'living-lantern', room: 'living', catalogId: 'floor-lantern', floor: { column: 9, row: 7 },
    detail: 'A floor lantern for the living room.',
    action: { kind: 'placed' },
  },
  {
    id: 'living-frame', room: 'living', catalogId: 'plain-frame', wallSlot: 'living-north', primary: true,
    detail: 'This wall slot holds a labeled sample print.',
    action: sample('Sample coastal print'),
  },
  {
    id: 'study-desk', room: 'study', catalogId: 'desk', floor: { column: 2, row: 5 }, primary: true,
    detail: 'The desk opens a dated note for this visit. Nothing is saved.',
    action: { kind: 'note' },
  },
  {
    // The lamp is stackable and the desk is a surface, so this overlap is allowed.
    id: 'study-lamp', room: 'study', catalogId: 'desk-lamp', floor: { column: 3, row: 5 },
    detail: 'The desk lamp sits on the desk.',
    action: { kind: 'placed' },
  },
  {
    id: 'study-shelf', room: 'study', catalogId: 'bookshelf', floor: { column: 8, row: 2 },
    detail: 'The shelf opens a saved book.',
    action: { kind: 'media', label: 'Open saved books', href: '/media/library', query: { kind: 'book' } },
  },
  {
    id: 'bedroom-bed', room: 'bedroom', catalogId: 'bed', floor: { column: 1, row: 2 },
    detail: 'The starter bed is already placed.',
    action: { kind: 'placed' },
  },
  {
    id: 'bedroom-record', room: 'bedroom', catalogId: 'record-stand', floor: { column: 6, row: 6 }, primary: true,
    detail: 'The record stand opens saved music.',
    action: { kind: 'media', label: 'Open saved music', href: '/media/library', query: { kind: 'artist' } },
  },
  {
    id: 'bedroom-frame', room: 'bedroom', catalogId: 'plain-frame', wallSlot: 'bedroom-north',
    detail: 'This wall slot holds a labeled sample print.',
    action: sample('Sample night window'),
  },
  {
    id: 'courtyard-planter', room: 'courtyard', catalogId: 'planter', floor: { column: 2, row: 3 }, primary: true,
    detail: 'Watering the planter is a courtyard action.',
    action: { kind: 'garden', verb: 'Water the planter', done: 'Watered for this visit. No habit was checked.' },
  },
  {
    id: 'courtyard-fern', room: 'courtyard', catalogId: 'fern', floor: { column: 5, row: 4 },
    detail: 'Misting the fern is a courtyard action.',
    action: { kind: 'garden', verb: 'Mist the fern', done: 'Misted for this visit. No habit was checked.' },
  },
  {
    id: 'courtyard-seat', room: 'courtyard', catalogId: 'oak-seat', floor: { column: 8, row: 6 },
    detail: 'An oak seat in the garden.',
    action: { kind: 'placed' },
  },
  {
    id: 'courtyard-lantern', room: 'courtyard', catalogId: 'floor-lantern', floor: { column: 10, row: 8 },
    detail: 'A lantern by the garden path.',
    action: { kind: 'placed' },
  },
];

export const HOME_OBJECTS: readonly HomeObject[] = Object.freeze(HOME_OBJECT_SPECS.map(place));

const objectsByRoom = new Map<HomeRoomId, HomeObject[]>();
for (const object of HOME_OBJECTS) {
  const list = objectsByRoom.get(object.room) ?? [];
  list.push(object);
  objectsByRoom.set(object.room, list);
}

export const HOME_ROOMS: readonly HomeRoom[] = Object.freeze(HOME_ROOM_IDS.map(id => Object.freeze({
  id,
  label: id === 'living' ? 'Living room' : id === 'study' ? 'Study' : id === 'bedroom' ? 'Bedroom' : 'Courtyard',
  src: `/town/home/${id}.svg`,
  wallSlots: HOME_WALL_SLOTS.filter(slot => slot.room === id).map(slot => slot.id),
})));

export function homeRoom(id: string | null): HomeRoom | null {
  return HOME_ROOMS.find(room => room.id === id) ?? null;
}

export function homeObjects(room: HomeRoomId): readonly HomeObject[] {
  return objectsByRoom.get(room) ?? [];
}

export function homePrimary(room: HomeRoomId): HomeObject {
  const primary = homeObjects(room).find(object => object.primary);
  if (!primary) throw new Error(`Missing primary object for ${room}`);
  return primary;
}

export function homeSceneItem(room: HomeRoomId, item: HomeLayoutItem): HomeSceneObject | null {
  const catalog = cosmeticById(item.catalog_id);
  const ornament = homeMilestoneOption(item.catalog_id, item.instance_id);
  if (!catalog && !ornament) return null;
  const authored = homeObjects(room).find(object => object.id === item.instance_id && object.catalogId === item.catalog_id);
  return scenePlacement(room, item, catalog, authored, ornament?.label, ornament?.art);
}

function scenePlacement(
  room: HomeRoomId,
  item: HomeLayoutItem,
  asset: CosmeticAsset | null,
  authored?: HomeObject,
  ornamentLabel?: string,
  ornamentArt?: string,
): HomeSceneObject | null {
  const dimensions = footprintAtTurn(asset, item.orientation);
  const width = dimensions.columns * HOME_CELL;
  const height = dimensions.rows * HOME_CELL;
  const anchor = { x: width / 2, y: item.anchor === 'floor' ? height : 0 };
  const wall = item.slot ? slotById.get(item.slot) : null;
  const column = item.column ?? wall?.column;
  const top = item.row != null ? HOME_WALL_PX + item.row * HOME_CELL : wall?.top;
  if (column == null || top == null) return null;
  const placedObject = {
    id: item.instance_id,
    room,
    catalogId: item.catalog_id,
    label: authored?.label ?? asset?.label ?? ornamentLabel ?? '',
    detail: authored?.detail ?? 'A decoration for this room.',
    primary: authored?.primary ?? false,
    action: authored?.action ?? { kind: 'placed' as const },
    x: column * HOME_CELL + anchor.x,
    y: top + anchor.y,
    asset: { id: item.instance_id, layer: asset?.layer ?? 3, bounds: { width, height }, anchor },
    orientation: item.orientation,
    palette: item.palette,
    ornamentArt: ornamentArt ?? null,
  };
  return { ...placedObject, ...sceneFrame(roomRect(placedObject), HOME_ROOM_BOUNDS) };
}

export function starterHomeLayout(room: HomeRoomId): HomeLayoutItem[] {
  return homeObjects(room).map(object => ({
    instance_id: object.id,
    catalog_id: object.catalogId,
    anchor: object.wallSlot ? 'wall' : 'floor',
    column: object.floor?.column ?? null,
    row: object.floor?.row ?? null,
    slot: object.wallSlot,
    orientation: 0,
    palette: 0,
  }));
}

export function homeSceneObjects(room: HomeRoomId, items?: readonly HomeLayoutItem[]): readonly HomeSceneObject[] {
  return (items ?? starterHomeLayout(room)).flatMap(item => homeSceneItem(room, item) ?? [])
    .sort((a, b) => a.asset.layer - b.asset.layer || a.id.localeCompare(b.id));
}


export function wallSlotLabel(slot: string): string {
  const direction = slot.split('-').at(-1) ?? slot;
  return `${direction[0]?.toUpperCase() ?? ''}${direction.slice(1)} wall`;
}
