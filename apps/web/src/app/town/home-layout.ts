/** The public saved room layout and the editor's local geometry checks. */

import { COSMETIC_LAYOUT_CAP, cosmeticById, footprintAtTurn, type CosmeticPlacement } from './cosmetic-catalog';
import {
  HOME_DOORWAY, HOME_FLOOR_CELLS, HOME_WALL_CAP, HOME_WALL_SLOTS, type HomeRoomId,
} from './home-rooms';
import { homeMilestoneOption } from './home-milestones';

export type HomePalette = 0 | 1 | 2 | 3;
export type HomeTurn = CosmeticPlacement['orientation'];

export interface HomeLayoutItem {
  instance_id: string;
  catalog_id: string;
  anchor: string;
  column: number | null;
  row: number | null;
  slot: string | null;
  orientation: HomeTurn;
  palette: HomePalette;
}

export interface HomeLayoutWrite {
  expected_revision: number;
  items: HomeLayoutItem[];
}

export function withHomeItem(items: readonly HomeLayoutItem[], item: HomeLayoutItem): HomeLayoutItem[] {
  const previous = items.find(current => current.instance_id === item.instance_id);
  if (!previous) return [...items, item];
  const surface = cosmeticById(item.catalog_id);
  if (!surface?.surface || previous.column == null || previous.row == null || item.column == null || item.row == null) {
    return items.map(current => current.instance_id === item.instance_id ? item : current);
  }

  const { columns, rows } = footprintAtTurn(surface, previous.orientation);
  const oldColumn = previous.column;
  const oldRow = previous.row;
  const newColumn = item.column;
  const newRow = item.row;
  const turns = (item.orientation - previous.orientation + 4) % 4;
  return items.map(current => {
    if (current.instance_id === item.instance_id) return item;
    if (!cosmeticById(current.catalog_id)?.stackable || current.column == null || current.row == null) return current;
    let x = current.column - oldColumn;
    let y = current.row - oldRow;
    if (x < 0 || y < 0 || x >= columns || y >= rows) return current;
    let height = rows;
    let width = columns;
    for (let turn = 0; turn < turns; turn++) {
      [x, y] = [height - y - 1, x];
      [width, height] = [height, width];
    }
    return { ...current, column: newColumn + x, row: newRow + y };
  });
}

export function homeFloorPoint(column: number, row: number): boolean {
  return column >= 0 && row >= 0 && column < HOME_FLOOR_CELLS && row < HOME_FLOOR_CELLS;
}

/** Match the server's bounds, doorway, and separate surface/stack occupancy rules. */
export function homePlacementProblem(room: HomeRoomId, items: readonly HomeLayoutItem[]): string | null {
  if (items.length > COSMETIC_LAYOUT_CAP) return 'This room is full.';
  const walls = new Set<string>();
  const bases = new Map<number, HomeLayoutItem>();
  const stacks = new Map<number, HomeLayoutItem>();
  for (const item of items) {
    const asset = cosmeticById(item.catalog_id);
    const footprint = footprintAtTurn(asset, item.orientation);
    if (item.anchor === 'wall') {
      const wall = HOME_WALL_SLOTS.find(slot => slot.room === room && slot.id === item.slot);
      if (!wall || wall.column + footprint.columns > HOME_FLOOR_CELLS) return 'Choose a wall slot that fits.';
      if (walls.has(wall.id)) return 'That wall slot is occupied.';
      walls.add(wall.id);
      if (walls.size > HOME_WALL_CAP) return 'This wall is full.';
      continue;
    }
    const { column, row } = item;
    if (item.anchor !== 'floor' || column == null || row == null ||
      !homeFloorPoint(column, row) || !homeFloorPoint(column + footprint.columns - 1, row + footprint.rows - 1)) {
      return 'The item extends past the floor.';
    }
    const occupied = asset?.stackable && !asset.surface ? stacks : bases;
    for (let y = row; y < row + footprint.rows; y++) {
      for (let x = column; x < column + footprint.columns; x++) {
        if (x >= HOME_DOORWAY.column && x < HOME_DOORWAY.column + HOME_DOORWAY.columns &&
          y >= HOME_DOORWAY.row && y < HOME_DOORWAY.row + HOME_DOORWAY.rows) return 'Keep the doorway clear.';
        const cell = y * HOME_FLOOR_CELLS + x;
        if (occupied.has(cell)) return 'That space is occupied.';
        occupied.set(cell, item);
      }
    }
  }
  const holders = new Map<string, string>();
  for (const [cell, item] of stacks) {
    const base = bases.get(cell);
    const holder = holders.get(item.instance_id);
    if (!base || !cosmeticById(base.catalog_id)?.surface || (holder && holder !== base.instance_id)) {
      return 'A stackable item needs one clear surface.';
    }
    holders.set(item.instance_id, base.instance_id);
  }
  return null;
}

export function homeItemKnown(item: HomeLayoutItem): boolean {
  return !!(cosmeticById(item.catalog_id) || homeMilestoneOption(item.catalog_id, item.instance_id));
}

export function sameHomeItem(left: HomeLayoutItem, right: HomeLayoutItem | undefined): boolean {
  return right != null && left.instance_id === right.instance_id && left.catalog_id === right.catalog_id &&
    left.anchor === right.anchor && left.column === right.column && left.row === right.row &&
    left.slot === right.slot && left.orientation === right.orientation && left.palette === right.palette;
}

export function sameHomeLayout(left: readonly HomeLayoutItem[], right: readonly HomeLayoutItem[]): boolean {
  return left.length === right.length && left.every((item, index) => sameHomeItem(item, right[index]));
}

export function reapplyHomeChanges(
  base: readonly HomeLayoutItem[],
  draft: readonly HomeLayoutItem[],
  saved: readonly HomeLayoutItem[],
): HomeLayoutItem[] {
  const before = new Map(base.map(item => [item.instance_id, item]));
  const localIds = new Set(draft.map(item => item.instance_id));
  const changes = new Map(draft.filter(item => !sameHomeItem(item, before.get(item.instance_id)))
    .map(item => [item.instance_id, item]));
  const result = [];
  for (const item of saved) {
    const id = item.instance_id;
    if (before.has(id) && !localIds.has(id)) continue;
    result.push(changes.get(id) ?? item);
    changes.delete(id);
  }
  return [...result, ...changes.values()];
}

export function homeItemLabel(item: HomeLayoutItem): string {
  return cosmeticById(item.catalog_id)?.label ?? homeMilestoneOption(item.catalog_id, item.instance_id)?.label ?? 'Unavailable item';
}
