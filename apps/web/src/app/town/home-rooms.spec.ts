import { returnPath } from '@vivek/ui';
import { cosmeticById, cosmeticCatalog } from './cosmetic-catalog';
import {
  HOME_DOORWAY,
  HOME_FLOOR_CELLS,
  HOME_OBJECTS,
  HOME_ROOM_BOUNDS,
  HOME_ROOM_IDS,
  HOME_ROOMS,
  HOME_WALL_CAP,
  HOME_WALL_SLOTS,
  homeLayoutProblems,
  homeObjects,
  homePrimary,
  homeSceneObjects,
} from './home-rooms';
import { frontObject, roomRect } from './library-room.scene';

describe('Home room layout', () => {
  it('fits four furnished rooms of free starters and leaves the doorway open', () => {
    expect(homeLayoutProblems()).toEqual([]);
    expect(HOME_ROOMS.map(room => room.id)).toEqual([...HOME_ROOM_IDS]);
    const starters = cosmeticCatalog.filter(item => item.group === 'starter');
    const shop = new Set(cosmeticCatalog.filter(item => item.group === 'shop').map(item => item.id));
    expect(starters).toHaveSize(12);
    expect(shop.size).toBe(12);
    expect(new Set(HOME_OBJECTS.map(object => object.catalogId))).toEqual(new Set(starters.map(item => item.id)));
    expect(starters.every(item => item.priceStamps === 0 && item.group === 'starter')).toBeTrue();
    expect(HOME_OBJECTS.some(object => shop.has(object.catalogId))).toBeFalse();
    expect(HOME_OBJECTS.filter(object => object.catalogId === 'oak-seat').length).toBeGreaterThan(1);

    const door = new Set<string>();
    for (let y = 0; y < HOME_DOORWAY.rows; y += 1) {
      for (let x = 0; x < HOME_DOORWAY.columns; x += 1) door.add(`${HOME_DOORWAY.column + x},${HOME_DOORWAY.row + y}`);
    }
    expect([...door].sort()).toEqual(['5,10', '5,11', '6,10', '6,11']);
    const overlaps: string[] = [];
    for (const room of HOME_ROOM_IDS) {
      const objects = homeObjects(room);
      expect(objects.length).toBeGreaterThanOrEqual(3);
      expect(objects.filter(object => object.primary)).toHaveSize(1);
      expect(homePrimary(room).id).toBe(objects.find(object => object.primary)?.id ?? '');
      expect(objects.filter(object => object.wallSlot).length).toBeLessThanOrEqual(HOME_WALL_CAP);
      expect(objects.filter(object => object.floor).length).toBeLessThanOrEqual(64);
      const cells = new Map<string, string>();
      for (const object of objects) {
        const asset = cosmeticById(object.catalogId);
        expect(asset).withContext(object.id).toBeTruthy();
        if (!asset || !object.floor) continue;
        expect(object.floor.column + asset.footprint.columns).toBeLessThanOrEqual(HOME_FLOOR_CELLS);
        expect(object.floor.row + asset.footprint.rows).toBeLessThanOrEqual(HOME_FLOOR_CELLS);
        for (let y = 0; y < asset.footprint.rows; y += 1) {
          for (let x = 0; x < asset.footprint.columns; x += 1) {
            const cell = `${object.floor.column + x},${object.floor.row + y}`;
            expect(door.has(cell)).withContext(object.id).toBeFalse();
            const other = cells.get(cell);
            if (other) overlaps.push(`${other}+${object.id}`);
            else cells.set(cell, object.id);
          }
        }
      }
      for (const object of homeSceneObjects(room)) {
        const rect = roomRect(object);
        expect(rect.left).withContext(object.id).toBeGreaterThanOrEqual(0);
        expect(rect.top).withContext(object.id).toBeGreaterThanOrEqual(0);
        expect(rect.left + rect.width).withContext(object.id).toBeLessThanOrEqual(HOME_ROOM_BOUNDS.width);
        expect(rect.top + rect.height).withContext(object.id).toBeLessThanOrEqual(HOME_ROOM_BOUNDS.height);
      }
    }
    expect(overlaps).toEqual(['study-desk+study-lamp']);
    const slotIds = HOME_WALL_SLOTS.map(slot => slot.id);
    expect(new Set(slotIds).size).toBe(slotIds.length);
    expect(HOME_ROOMS.every(room => room.wallSlots.length >= 2)).toBeTrue();
  });

  it('keeps the Town y-down frame and paints the lamp in front of the desk', () => {
    const living = homeSceneObjects('living');
    const rug = roomRect(living.find(object => object.id === 'living-rug')!);
    const lantern = roomRect(living.find(object => object.id === 'living-lantern')!);
    expect(rug.top).toBeLessThan(lantern.top);

    const study = homeSceneObjects('study');
    const lamp = study.find(object => object.id === 'study-lamp')!;
    const desk = study.find(object => object.id === 'study-desk')!;
    const lampRect = roomRect(lamp);
    const deskRect = roomRect(desk);
    expect(frontObject(study, {
      x: lampRect.left + lampRect.width / 2,
      y: lampRect.top + lampRect.height / 2,
    })?.id).toBe('study-lamp');
    expect(frontObject(study, {
      x: deskRect.left + 12,
      y: deskRect.top + 12,
    })?.id).toBe('study-desk');
    expect(lamp.asset.layer).toBeGreaterThan(desk.asset.layer);
  });

  it('keeps each room object on its return path and drops notes and camera', () => {
    for (const object of HOME_OBJECTS) {
      const path = `/town/home/${object.room}?object=${object.id}&note=secret&scale=1.5&x=1&y=2`;
      expect(returnPath(path)).withContext(object.id).toBe(`/town/home/${object.room}?object=${object.id}`);
    }
    expect(returnPath('/town/home?object=living-frame&note=secret')).toBe('/town/home');
    expect(returnPath('/town/home/study?object=living-frame')).toBe('/town/home/study');
    expect(returnPath('/town/home/living?object=study-desk')).toBe('/town/home/living');
  });
});
