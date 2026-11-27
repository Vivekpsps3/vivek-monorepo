import {
  frontObject,
  occludingIds,
  roomRect,
  sceneFrame,
  type SceneBounds,
  type ScenePlacement,
} from '../library-room.scene';

/** Selectable upstairs objects. The session floor stays downstairs. */
export const GYM_UP_IDS = ['wall', 'cabinet'] as const;
export type GymUpId = (typeof GYM_UP_IDS)[number];

export const GYM_UP_ROOM: SceneBounds = { width: 640, height: 360 };

export interface GymUpPiece extends ScenePlacement {
  readonly asset: ScenePlacement['asset'] & { readonly id: GymUpId };
  readonly label: string;
}

interface GymUpFrame {
  readonly id: GymUpId;
  readonly label: string;
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

function piece(
  id: GymUpId,
  layer: number,
  x: number,
  y: number,
  width: number,
  height: number,
  label: string,
): GymUpPiece {
  return {
    x,
    y,
    label,
    asset: { id, layer, bounds: { width, height }, anchor: { x: 0, y: 0 } },
  };
}

/** The wall sits back. The cabinet overlaps its lower corner and wins the pick. */
export const GYM_UP_PIECES: readonly GymUpPiece[] = [
  piece('wall', 1, 36, 40, 340, 180, 'Progress wall'),
  piece('cabinet', 2, 300, 150, 260, 160, 'Record cabinet'),
];

const DETAILS: Record<GymUpId | 'room', string> = {
  room: 'The progress wall charts an exercise. The record cabinet keeps records, trophies, and game medals apart.',
  wall: 'Choose an exercise and a date range. The chart and the table show the same points.',
  cabinet: 'Personal records stay editable here. Health trophies and game medals stay visually separate.',
};

export function gymUpId(value: string | null): GymUpId | null {
  return (GYM_UP_IDS as readonly string[]).includes(value ?? '') ? value as GymUpId : null;
}

export function gymUpHeading(id: GymUpId | null): string {
  return GYM_UP_PIECES.find(item => item.asset.id === id)?.label ?? 'Gym upstairs';
}

export function gymUpDetail(id: GymUpId | null): string {
  return DETAILS[id ?? 'room'];
}

export function gymUpFrames(): readonly GymUpFrame[] {
  return GYM_UP_PIECES.map(item => {
    const frame = sceneFrame(roomRect(item), GYM_UP_ROOM);
    return { id: item.asset.id, label: item.label, ...frame };
  });
}

/** Highest layer wins, matching the room frame. */
export function gymUpHit(point: { readonly x: number; readonly y: number }): GymUpId | null {
  return frontObject(GYM_UP_PIECES, point)?.asset.id ?? null;
}

export function gymUpFaded(selected: GymUpId | null): ReadonlySet<GymUpId> {
  const faded = new Set<GymUpId>();
  for (const id of occludingIds(GYM_UP_PIECES, selected)) {
    const upId = gymUpId(id);
    if (upId) faded.add(upId);
  }
  return faded;
}
