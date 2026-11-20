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
