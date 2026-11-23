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

const DETAILS: Record<GymGate, Record<GymFloorId | 'room', string>> = {
  locked: {
    room: 'Choose the routine desk, an exercise station, or the session bench. Unlock to log a workout.',
    desk: 'The routine desk starts a saved plan. Routines stay hidden until Finance is unlocked.',
    station: 'The exercise station records sets. Digits stay hidden until Finance is unlocked.',
    bench: 'The session bench finishes the workout. Only an encrypted draft can remain.',
  },
  setup: {
    room: 'Set up Finance before this floor can log a workout.',
    desk: 'The routine desk is here. Set up Finance to start a plan.',
    station: 'The exercise station is here. Set up Finance to record sets.',
    bench: 'The session bench is here. Set up Finance to finish a workout.',
  },
  unavailable: {
    room: 'This floor is here, and workouts are unavailable right now.',
    desk: 'The routine desk is here. Workouts are unavailable right now.',
    station: 'The exercise station is here. Workouts are unavailable right now.',
    bench: 'The session bench is here. Workouts are unavailable right now.',
  },
  ready: {
    room: 'Start a routine at the desk, record sets at a station, and finish on the bench.',
    desk: 'Start a saved routine here. Add routine below still opens the same dialog.',
    station: 'Record sets on the open session. Add session below still opens the same dialog.',
    bench: 'Finish the open session here. That writes one session.',
  },
};

export function gymFloorId(value: string | null): GymFloorId | null {
  return (GYM_FLOOR_IDS as readonly string[]).includes(value ?? '') ? value as GymFloorId : null;
}

export function gymFloorHeading(id: GymFloorId | null): string {
  return GYM_PIECES.find(item => item.asset.id === id)?.label ?? 'Gym floor';
}

export function gymFloorDetail(id: GymFloorId | null, gate: GymGate): string {
  return DETAILS[gate][id ?? 'room'];
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
