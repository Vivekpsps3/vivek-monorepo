import { readingRoom, readingRoomObjects } from './library-room.assets';
import {
  REST_CAMERA,
  frontObject,
  movedPastSlop,
  panCamera,
  roomRect,
  roomToScreen,
  sceneFrame,
  screenToRoom,
  zoomToward,
} from './library-room.scene';

const room = readingRoom.bounds;
const byId = (id: string) => readingRoomObjects.find(object => object.asset.id === id)!;

function overlap(firstId: string, secondId: string): { x: number; y: number; width: number; height: number } {
  const first = roomRect(byId(firstId));
  const second = roomRect(byId(secondId));
  const left = Math.max(first.left, second.left);
  const top = Math.max(first.top, second.top);
  const right = Math.min(first.left + first.width, second.left + second.width);
  const bottom = Math.min(first.top + first.height, second.top + second.height);
  return { x: (left + right) / 2, y: (top + bottom) / 2, width: right - left, height: bottom - top };
}

describe('Reading Hall scene geometry', () => {
  const viewport = { width: 390, height: 260 };

  it('picks the front object from one rectangle after the camera moves', () => {
    const shared = overlap('shelves', 'desk');
    expect(shared.width).toBeGreaterThan(40);
    expect(shared.height).toBeGreaterThan(40);
    const point = { x: shared.x, y: shared.y };
    expect(frontObject(readingRoomObjects, point)?.asset.id).toBe('desk');
    expect(frontObject(readingRoomObjects, { x: roomRect(byId('shelves')).left + 4, y: roomRect(byId('shelves')).top + 4 })?.asset.id).toBe('shelves');
    expect(frontObject(readingRoomObjects, { x: 1, y: 1 })).toBeNull();

    const frame = sceneFrame(roomRect(byId('desk')), room);
    expect(frame.left).toBe(100 * roomRect(byId('desk')).left / room.width);

    const camera = { x: -48, y: -30, scale: 2 };
    const screen = roomToScreen(point, camera, viewport, room);
    expect(screenToRoom(screen, camera, viewport, room).x).toBeCloseTo(point.x, 5);
    expect(screenToRoom(screen, camera, viewport, room).y).toBeCloseTo(point.y, 5);
    expect(frontObject(readingRoomObjects, screenToRoom(screen, camera, viewport, room))?.asset.id).toBe('desk');
    const stayed = screenToRoom(roomToScreen(point, REST_CAMERA, viewport, room), camera, viewport, room);
    expect(frontObject(readingRoomObjects, stayed)?.asset.id).not.toBe('desk');
  });

  it('keeps the viewed point while zooming and refuses a pan that leaves the room', () => {
    const next = zoomToward(REST_CAMERA, viewport, 1);
    expect(next.scale).toBe(1.5);
    const center = { x: viewport.width / 2, y: viewport.height / 2 };
    const before = screenToRoom(center, REST_CAMERA, viewport, room);
    const after = screenToRoom(center, next, viewport, room);
    expect(after.x).toBeCloseTo(before.x, 5);
    expect(after.y).toBeCloseTo(before.y, 5);
    expect(zoomToward(next, viewport, -1).scale).toBe(1);
    expect(zoomToward({ ...next, scale: 2.5 }, viewport, 1).scale).toBe(2.5);

    const panned = panCamera(next, viewport, -5000, 4000);
    expect(panned.x).toBeCloseTo(viewport.width * (1 - next.scale), 5);
    expect(panned.y).toBe(0);
    expect(movedPastSlop(8, 0)).toBeFalse();
    expect(movedPastSlop(9, 0)).toBeTrue();
  });

  it('uses paint order when two objects share a layer', () => {
    const back = { x: 10, y: 10, asset: { id: 'back', layer: 4, bounds: { width: 20, height: 20 }, anchor: { x: 0, y: 0 } } };
    const front = { x: 12, y: 12, asset: { id: 'front', layer: 4, bounds: { width: 20, height: 20 }, anchor: { x: 0, y: 0 } } };
    expect(frontObject([back, front], { x: 15, y: 15 })?.asset.id).toBe('front');
    expect(frontObject([front, back], { x: 15, y: 15 })?.asset.id).toBe('back');
  });
});
