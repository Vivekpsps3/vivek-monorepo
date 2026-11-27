import {
  frontObject,
  occludingIds,
  roomRect,
  sceneFrame,
  type SceneBounds,
  type ScenePlacement,
} from '../library-room.scene';

/** Selectable gym-floor objects. Progress and trophies are the upstairs scene. */
export const GYM_FLOOR_IDS = ['desk', 'station', 'bench'] as const;
export type GymFloorId = (typeof GYM_FLOOR_IDS)[number];
export type GymGate = 'locked' | 'setup' | 'unavailable' | 'ready';

export const GYM_ROOM: SceneBounds = { width: 640, height: 360 };

export interface GymPiece extends ScenePlacement {
  readonly asset: ScenePlacement['asset'] & { readonly id: GymFloorId };
  readonly label: string;
}

interface GymFrame {
  readonly id: GymFloorId;
  readonly label: string;
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

function piece(
  id: GymFloorId,
  layer: number,
  x: number,
  y: number,
  width: number,
  height: number,
  label: string,
): GymPiece {
  return {
    x,
    y,
    label,
    asset: { id, layer, bounds: { width, height }, anchor: { x: 0, y: 0 } },
  };
}

/** Desk sits back, the bench overlaps it, and the station overlaps the bench. */
export const GYM_PIECES: readonly GymPiece[] = [
  piece('desk', 1, 40, 28, 230, 130, 'Routine desk'),
  piece('bench', 2, 210, 150, 250, 100, 'Session bench'),
  piece('station', 3, 400, 210, 200, 120, 'Exercise station'),
];

const DETAILS: Record<GymFloorId | 'room', string> = {
  room: 'Start a routine at the desk, record sets at a station, and finish on the bench.',
  desk: 'Start a workout from a saved routine.',
  station: 'Record sets on the open workout.',
  bench: 'Finish the open session here. That writes one session.',
};

export function gymFloorId(value: string | null): GymFloorId | null {
  return (GYM_FLOOR_IDS as readonly string[]).includes(value ?? '') ? value as GymFloorId : null;
}

export function gymFloorHeading(id: GymFloorId | null): string {
  return GYM_PIECES.find(item => item.asset.id === id)?.label ?? 'Gym floor';
}

export function gymFloorDetail(id: GymFloorId | null): string {
  return DETAILS[id ?? 'room'];
}

export function gymFrames(): readonly GymFrame[] {
  return GYM_PIECES.map(item => {
    const frame = sceneFrame(roomRect(item), GYM_ROOM);
    return { id: item.asset.id, label: item.label, ...frame };
  });
}

/** Highest layer wins, matching the room frame. */
export function gymHit(point: { readonly x: number; readonly y: number }): GymFloorId | null {
  return frontObject(GYM_PIECES, point)?.asset.id ?? null;
}

export function gymFaded(selected: GymFloorId | null): ReadonlySet<GymFloorId> {
  const faded = new Set<GymFloorId>();
  for (const id of occludingIds(GYM_PIECES, selected)) {
    const floorId = gymFloorId(id);
    if (floorId) faded.add(floorId);
  }
  return faded;
}
