import {
  frontObject,
  occludingIds,
  roomRect,
  sceneFrame,
  type SceneBounds,
  type ScenePlacement,
} from '../library-room.scene';
import type { HealthUnits } from './health-entry';

/** Reception, vital stations, lab folders, and the checkup book. */
export const CLINIC_OBJECT_IDS = ['reception', 'weight', 'rhr', 'bp', 'sleep', 'labs', 'checkups'] as const;
export type ClinicObjectId = (typeof CLINIC_OBJECT_IDS)[number];
export const CLINIC_VITALS = ['weight', 'rhr', 'bp', 'sleep'] as const;
export type ClinicVitalId = (typeof CLINIC_VITALS)[number];
export type ClinicGate = 'locked' | 'setup' | 'unavailable' | 'ready';

export const CLINIC_ROOM: SceneBounds = { width: 640, height: 360 };

export interface ClinicPiece extends ScenePlacement {
  readonly asset: ScenePlacement['asset'] & { readonly id: ClinicObjectId };
  readonly label: string;
}

interface ClinicFrame {
  readonly id: ClinicObjectId;
  readonly label: string;
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

function piece(
  id: ClinicObjectId,
  layer: number,
  x: number,
  y: number,
  width: number,
  height: number,
  label: string,
): ClinicPiece {
  return {
    x,
    y,
    label,
    asset: { id, layer, bounds: { width, height }, anchor: { x: 0, y: 0 } },
  };
}

/**
 * Reception sits back. Weight overlaps it, heart rate overlaps weight,
 * blood pressure overlaps weight, and sleep overlaps blood pressure.
 * The lab folders and checkup book sit clear of those stations.
 */
export const CLINIC_PIECES: readonly ClinicPiece[] = [
  piece('reception', 1, 24, 20, 280, 140, 'Reception'),
  piece('weight', 2, 200, 80, 200, 120, 'Weight station'),
  piece('rhr', 3, 360, 40, 200, 120, 'Heart rate station'),
  piece('bp', 4, 40, 180, 240, 130, 'Blood pressure station'),
  piece('sleep', 5, 240, 200, 260, 120, 'Sleep station'),
  piece('labs', 6, 508, 168, 120, 100, 'Lab folders'),
  piece('checkups', 7, 508, 276, 120, 72, 'Checkup book'),
];

const DETAILS: Record<ClinicObjectId | 'room', string> = {
  room: 'Reception, the vital stations, the lab folders, and the checkup book open the same records.',
  reception: 'Choose a station to see the latest reading, its date, and the history.',
  weight: 'The latest weight, its date, and the history are here. Correcting a reading uses the measurement editor.',
  rhr: 'The latest heart rate, its date, and the history are here. Correcting a reading uses the measurement editor.',
  bp: 'The latest blood pressure, its date, and the history are here. Correcting a reading uses the measurement editor.',
  sleep: 'The latest sleep, its date, and the history are here. Correcting a reading uses the measurement editor.',
  labs: 'Open a folder to see each result with its value, unit, date, and range.',
  checkups: 'The checkup book lists each visit with its measured date, including an older visit.',
};

const TITLES: Record<ClinicVitalId, string> = {
  weight: 'Weight',
  rhr: 'Resting heart rate',
  bp: 'Blood pressure',
  sleep: 'Sleep',
};

const NOUNS: Record<ClinicVitalId, string> = {
  weight: 'weight',
  rhr: 'resting heart rate',
  bp: 'blood pressure',
  sleep: 'sleep',
};

export function clinicObjectId(value: string | null): ClinicObjectId | null {
  return (CLINIC_OBJECT_IDS as readonly string[]).includes(value ?? '') ? value as ClinicObjectId : null;
}

export function isClinicVital(value: string | null): value is ClinicVitalId {
  return (CLINIC_VITALS as readonly string[]).includes(value ?? '');
}

export function clinicVitalTitle(id: ClinicVitalId): string {
  return TITLES[id];
}

export function clinicVitalNoun(id: ClinicVitalId): string {
  return NOUNS[id];
}

/** Display words only. This does not convert or store a measurement. */
export function clinicUnitLine(id: ClinicVitalId, units: HealthUnits): string {
  switch (id) {
    case 'weight':
      return units.weight === 'kg'
        ? 'Shown in kilograms. Stored in kilograms.'
        : 'Shown in pounds. Stored in kilograms.';
    case 'rhr':
      return 'Shown in beats per minute.';
    case 'bp':
      return 'Shown as systolic and diastolic, in millimetres of mercury.';
    case 'sleep':
      return 'Shown in hours.';
  }
}

export function clinicRoomHeading(id: ClinicObjectId | null): string {
  return CLINIC_PIECES.find(item => item.asset.id === id)?.label ?? 'Clinic';
}

export function clinicRoomDetail(id: ClinicObjectId | null): string {
  return DETAILS[id ?? 'room'];
}

export function clinicFrames(): readonly ClinicFrame[] {
  return CLINIC_PIECES.map(item => {
    const frame = sceneFrame(roomRect(item), CLINIC_ROOM);
    return { id: item.asset.id, label: item.label, ...frame };
  });
}

/** Highest layer wins, matching the room frame. */
export function clinicHit(point: { readonly x: number; readonly y: number }): ClinicObjectId | null {
  return frontObject(CLINIC_PIECES, point)?.asset.id ?? null;
}

export function clinicFaded(selected: ClinicObjectId | null): ReadonlySet<ClinicObjectId> {
  const faded = new Set<ClinicObjectId>();
  for (const id of occludingIds(CLINIC_PIECES, selected)) {
    const objectId = clinicObjectId(id);
    if (objectId) faded.add(objectId);
  }
  return faded;
}
