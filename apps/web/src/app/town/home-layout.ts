/** Public layout fields for one authored home room. Notes stay in the session. */

import { homeObjects, type HomeRoomId } from './home-rooms';

export type HomePalette = 0 | 1 | 2 | 3;

export interface HomeLayoutItem {
  instance_id: string;
  catalog_id: string;
  anchor: 'floor' | 'wall';
  column: number | null;
  row: number | null;
  slot: string | null;
  orientation: 0;
  palette: HomePalette;
}

export interface HomeLayoutWrite {
  expected_revision: number;
  items: HomeLayoutItem[];
}

export function homeLayoutWrite(room: HomeRoomId, expectedRevision: number, palette: HomePalette): HomeLayoutWrite {
  return {
    expected_revision: expectedRevision,
    items: homeObjects(room).map(object => ({
      instance_id: object.id,
      catalog_id: object.catalogId,
      anchor: object.wallSlot ? 'wall' : 'floor',
      column: object.floor?.column ?? null,
      row: object.floor?.row ?? null,
      slot: object.wallSlot,
      orientation: 0,
      palette,
    })),
  };
}
