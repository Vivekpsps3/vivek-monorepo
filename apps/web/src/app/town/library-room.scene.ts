/** Room space is y-down, with the origin at the room's top left. Rectangles are half-open. */

export interface SceneBounds {
  readonly width: number;
  readonly height: number;
}

export interface ScenePlacement {
  readonly x: number;
  readonly y: number;
  readonly asset: {
    readonly id: string;
    readonly layer: number;
    readonly bounds: SceneBounds;
    readonly anchor: { readonly x: number; readonly y: number };
  };
}

export interface RoomRect {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export interface SceneCamera {
  readonly x: number;
  readonly y: number;
  readonly scale: number;
}

export interface SceneSize {
  readonly width: number;
  readonly height: number;
}

export const SCENE_SCALES = [1, 1.5, 2, 2.5] as const;
export const SCENE_TAP_SLOP_PX = 8;
export const REST_CAMERA: SceneCamera = { x: 0, y: 0, scale: 1 };

export function roomRect(object: ScenePlacement): RoomRect {
  return {
    left: object.x - object.asset.anchor.x,
    top: object.y - object.asset.anchor.y,
    width: object.asset.bounds.width,
    height: object.asset.bounds.height,
  };
}

/** Percent of the room. Painting and hit testing both start from `roomRect`. */
export function sceneFrame(rect: RoomRect, room: SceneBounds): RoomRect {
  return {
    left: 100 * rect.left / room.width,
    top: 100 * rect.top / room.height,
    width: 100 * rect.width / room.width,
    height: 100 * rect.height / room.height,
  };
}

export function screenToRoom(
  point: { readonly x: number; readonly y: number },
  camera: SceneCamera,
  viewport: SceneSize,
  room: SceneBounds,
): { x: number; y: number } {
  const localX = (point.x - camera.x) / camera.scale;
  const localY = (point.y - camera.y) / camera.scale;
  return {
    x: localX / viewport.width * room.width,
    y: localY / viewport.height * room.height,
  };
}

export function roomToScreen(
  point: { readonly x: number; readonly y: number },
  camera: SceneCamera,
  viewport: SceneSize,
  room: SceneBounds,
): { x: number; y: number } {
  return {
    x: camera.x + point.x / room.width * viewport.width * camera.scale,
    y: camera.y + point.y / room.height * viewport.height * camera.scale,
  };
}

function contains(rect: RoomRect, point: { readonly x: number; readonly y: number }): boolean {
  return point.x >= rect.left && point.x < rect.left + rect.width
    && point.y >= rect.top && point.y < rect.top + rect.height;
}

/** The highest layer wins. The later object wins a tie, matching paint order. */
export function frontObject<T extends ScenePlacement>(
  objects: readonly T[],
  point: { readonly x: number; readonly y: number },
): T | null {
  let best: T | null = null;
  let bestLayer = Number.NEGATIVE_INFINITY;
  let bestIndex = -1;
  objects.forEach((object, index) => {
    if (!contains(roomRect(object), point)) return;
    const layer = object.asset.layer;
    if (best == null || layer > bestLayer || (layer === bestLayer && index > bestIndex)) {
      best = object;
      bestLayer = layer;
      bestIndex = index;
    }
  });
  return best;
}

export function nearestScale(scale: number): number {
  return SCENE_SCALES.reduce((best, item) => Math.abs(item - scale) < Math.abs(best - scale) ? item : best);
}

export function clampCamera(camera: SceneCamera, viewport: SceneSize): SceneCamera {
  const scale = nearestScale(camera.scale);
  if (viewport.width <= 0 || viewport.height <= 0) return { x: 0, y: 0, scale };
  return {
    scale,
    x: Math.min(0, Math.max(viewport.width * (1 - scale), camera.x)),
    y: Math.min(0, Math.max(viewport.height * (1 - scale), camera.y)),
  };
}

export function zoomToward(camera: SceneCamera, viewport: SceneSize, direction: 1 | -1): SceneCamera {
  const current = nearestScale(camera.scale);
  const index = SCENE_SCALES.findIndex(item => item === current);
  const next = SCENE_SCALES[Math.min(SCENE_SCALES.length - 1, Math.max(0, index + direction))];
  const focusX = viewport.width / 2;
  const focusY = viewport.height / 2;
  const localX = (focusX - camera.x) / camera.scale;
  const localY = (focusY - camera.y) / camera.scale;
  return clampCamera({ scale: next, x: focusX - localX * next, y: focusY - localY * next }, viewport);
}

export function panCamera(camera: SceneCamera, viewport: SceneSize, dx: number, dy: number): SceneCamera {
  return clampCamera({ ...camera, x: camera.x + dx, y: camera.y + dy }, viewport);
}

export function movedPastSlop(dx: number, dy: number): boolean {
  return dx * dx + dy * dy > SCENE_TAP_SLOP_PX * SCENE_TAP_SLOP_PX;
}

export function rectsOverlap(a: RoomRect, b: RoomRect): boolean {
  return a.left < b.left + b.width && b.left < a.left + a.width
    && a.top < b.top + b.height && b.top < a.top + a.height;
}

/** Higher layer, or the later object on a tie, fades when it covers the selection. */
export function occludingIds(objects: readonly ScenePlacement[], selectedId: string | null): readonly string[] {
  if (!selectedId) return [];
  const selectedIndex = objects.findIndex(object => object.asset.id === selectedId);
  if (selectedIndex < 0) return [];
  const selected = objects[selectedIndex];
  const target = roomRect(selected);
  const ids: string[] = [];
  objects.forEach((object, index) => {
    if (index === selectedIndex) return;
    const inFront = object.asset.layer > selected.asset.layer
      || (object.asset.layer === selected.asset.layer && index > selectedIndex);
    if (inFront && rectsOverlap(roomRect(object), target)) ids.push(object.asset.id);
  });
  return ids;
}

function viewCoord(value: number): string {
  return String(Math.round(value * 100) / 100);
}

/** Direct room route. A resting camera omits its keys so the object link stays stable. */
export function sceneQuery(objectId: string | null, camera: SceneCamera): Record<string, string | null> {
  const query: Record<string, string | null> = { object: objectId };
  if (camera.scale === REST_CAMERA.scale && camera.x === REST_CAMERA.x && camera.y === REST_CAMERA.y) return query;
  return { ...query, scale: viewCoord(camera.scale), x: viewCoord(camera.x), y: viewCoord(camera.y) };
}

export function cameraFromQuery(params: { get(name: string): string | null }): SceneCamera {
  const scale = params.get('scale');
  const x = params.get('x');
  const y = params.get('y');
  if (scale == null && x == null && y == null) return REST_CAMERA;
  const camera = { scale: Number(scale), x: Number(x), y: Number(y) };
  if (!Number.isFinite(camera.scale) || !Number.isFinite(camera.x) || !Number.isFinite(camera.y)) return REST_CAMERA;
  return camera;
}

export function sameCamera(a: SceneCamera, b: SceneCamera): boolean {
  return a.scale === b.scale && a.x === b.x && a.y === b.y;
}
