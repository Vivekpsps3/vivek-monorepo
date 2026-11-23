/** Four Home rooms. Floor cells and wall slots share the Town y-down frame. */

import {
  COSMETIC_LAYOUT_CAP,
  COSMETIC_ROOM_CELLS,
  LAYOUT_CELL_PX,
  cosmeticById,
  type CosmeticAsset,
} from './cosmetic-catalog';
import { roomRect, sceneFrame, type ScenePlacement } from './library-room.scene';

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
export const HOME_ART_SOURCE = Object.freeze({
  attribution: 'Original artwork for Terraria-on-Sea',
  license: 'No separate license published',
});

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
  readonly slotLabel: string;
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
  readonly slotLabel: string;
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export interface HomeRoom {
  readonly id: HomeRoomId;
  readonly label: string;
  readonly summary: string;
  readonly src: string;
  readonly bounds: typeof HOME_ROOM_BOUNDS;
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
  const slotLabel = floor
    ? `Floor column ${floor.column}, row ${floor.row}`
    : `Wall slot ${wallSlot}`;
  return Object.freeze({
    id: spec.id,
    room: spec.room,
    catalogId: spec.catalogId,
    label: asset.label,
    detail: spec.detail,
    primary: spec.primary === true,
    action: spec.action,
    slotLabel,
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
  summary: id === 'living'
    ? 'A furnished living room. The plain frame holds a sample print.'
    : id === 'study'
      ? 'A study with a desk, a lamp, and a bookshelf.'
      : id === 'bedroom'
        ? 'A bedroom with a bed and a record stand.'
        : 'A courtyard with a planter, a fern, and the existing garden lots.',
  src: `/town/home/${id}.svg`,
  bounds: HOME_ROOM_BOUNDS,
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

function footprint(asset: CosmeticAsset, column: number, row: number): readonly string[] {
  const cells: string[] = [];
  for (let y = 0; y < asset.footprint.rows; y += 1) {
    for (let x = 0; x < asset.footprint.columns; x += 1) cells.push(`${column + x},${row + y}`);
  }
  return cells;
}

function doorwayCells(): ReadonlySet<string> {
  const cells = new Set<string>();
  for (let y = 0; y < HOME_DOORWAY.rows; y += 1) {
    for (let x = 0; x < HOME_DOORWAY.columns; x += 1) cells.add(`${HOME_DOORWAY.column + x},${HOME_DOORWAY.row + y}`);
  }
  return cells;
}

/** Problems in the starter layout. An empty list is the furnished home. */
export function homeLayoutProblems(): readonly string[] {
  const problems: string[] = [];
  const door = doorwayCells();
  const seen = new Set<string>();
  for (const room of HOME_ROOM_IDS) {
    const objects = homeObjects(room);
    if (objects.length < 3) problems.push(`${room} has ${objects.length} objects`);
    if (objects.filter(object => object.primary).length !== 1) problems.push(`${room} primary`);
    const wallCount = objects.filter(object => object.wallSlot).length;
    const floorCount = objects.filter(object => object.floor).length;
    if (wallCount > HOME_WALL_CAP) problems.push(`${room} wall cap`);
    if (floorCount > COSMETIC_LAYOUT_CAP) problems.push(`${room} floor cap`);
    const cells = new Map<string, HomeObject>();
    for (const object of objects) {
      if (seen.has(object.id)) problems.push(`duplicate ${object.id}`);
      seen.add(object.id);
      const asset = cosmeticById(object.catalogId);
      if (!asset || asset.group !== 'starter' || asset.priceStamps !== 0) {
        problems.push(`${object.id} is not a free starter`);
        continue;
      }
      if (object.floor) {
        if (object.floor.column < 0 || object.floor.row < 0
          || object.floor.column + asset.footprint.columns > HOME_FLOOR_CELLS
          || object.floor.row + asset.footprint.rows > HOME_FLOOR_CELLS) {
          problems.push(`${object.id} leaves the floor`);
        }
        for (const cell of footprint(asset, object.floor.column, object.floor.row)) {
          if (door.has(cell)) problems.push(`${object.id} blocks the doorway`);
          const other = cells.get(cell);
          if (other) {
            const otherAsset = cosmeticById(other.catalogId);
            const stacked = otherAsset != null && (
              (asset.stackable && otherAsset.surface) || (otherAsset.stackable && asset.surface)
            );
            if (!stacked) problems.push(`${object.id} overlaps ${other.id}`);
          } else {
            cells.set(cell, object);
          }
        }
      }
      if (object.wallSlot) {
        const slot = slotById.get(object.wallSlot);
        if (!slot || slot.room !== room) problems.push(`${object.id} wall slot`);
        else if (slot.column < 0 || slot.column + asset.footprint.columns > HOME_FLOOR_CELLS) problems.push(`${object.id} wall column`);
        else if (slot.top < 0 || slot.top + asset.footprint.rows * HOME_CELL > HOME_WALL_PX) problems.push(`${object.id} wall height`);
      }
    }
  }
  for (const slot of HOME_WALL_SLOTS) {
    if (HOME_WALL_SLOTS.filter(item => item.id === slot.id).length !== 1) problems.push(`slot ${slot.id}`);
  }
  return problems;
}

function scenePlacement(object: HomeObject, asset: CosmeticAsset): HomeSceneObject {
  const width = asset.footprint.columns * HOME_CELL;
  const height = asset.footprint.rows * HOME_CELL;
  const anchor = { x: width / 2, y: asset.anchor === 'floor' ? height : 0 };
  const slot = object.wallSlot ? slotById.get(object.wallSlot) : null;
  const x = object.floor
    ? (object.floor.column + asset.footprint.columns / 2) * HOME_CELL
    : ((slot?.column ?? 0) + asset.footprint.columns / 2) * HOME_CELL;
  const y = object.floor
    ? HOME_WALL_PX + (object.floor.row + asset.footprint.rows) * HOME_CELL
    : slot?.top ?? 0;
  const placedObject = {
    id: object.id,
    room: object.room,
    catalogId: object.catalogId,
    label: object.label,
    detail: object.detail,
    primary: object.primary,
    action: object.action,
    slotLabel: object.slotLabel,
    x,
    y,
    asset: { id: object.id, layer: asset.layer, bounds: { width, height }, anchor },
  };
  return { ...placedObject, ...sceneFrame(roomRect(placedObject), HOME_ROOM_BOUNDS) };
}

export function homeSceneObjects(room: HomeRoomId): readonly HomeSceneObject[] {
  return homeObjects(room).flatMap(object => {
    const asset = cosmeticById(object.catalogId);
    return asset ? [scenePlacement(object, asset)] : [];
  }).sort((a, b) => a.asset.layer - b.asset.layer || a.id.localeCompare(b.id));
}

export function wallSlotLine(room: HomeRoom): string {
  const used = new Map(homeObjects(room.id).filter(object => object.wallSlot).map(object => [object.wallSlot, object.label]));
  return room.wallSlots.map(id => `${id} (${used.get(id) ?? 'open'})`).join(', ');
}
