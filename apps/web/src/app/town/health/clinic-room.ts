import {
  frontObject,
  occludingIds,
  roomRect,
  sceneFrame,
  type SceneBounds,
  type ScenePlacement,
} from '../library-room.scene';
import type { HealthUnits } from './health-entry';

/** Reception plus the four vital stations. Labs and checkups stay on the room list. */
export const CLINIC_OBJECT_IDS = ['reception', 'weight', 'rhr', 'bp', 'sleep'] as const;
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
 */
export const CLINIC_PIECES: readonly ClinicPiece[] = [
  piece('reception', 1, 24, 20, 280, 140, 'Reception'),
  piece('weight', 2, 200, 80, 200, 120, 'Weight station'),
  piece('rhr', 3, 360, 40, 200, 120, 'Heart rate station'),
  piece('bp', 4, 40, 180, 240, 130, 'Blood pressure station'),
  piece('sleep', 5, 240, 200, 260, 120, 'Sleep station'),
];

const DETAILS: Record<ClinicGate, Record<ClinicObjectId | 'room', string>> = {
  locked: {
    room: 'Choose reception or a vital station. Unlock to see a measurement.',
    reception: 'Reception keeps the stations. Digits stay hidden until Finance is unlocked.',
    weight: 'The weight station shows the latest reading and its history. Digits stay hidden until Finance is unlocked.',
    rhr: 'The heart rate station shows the latest reading and its history. Digits stay hidden until Finance is unlocked.',
    bp: 'The blood pressure station shows the latest reading and its history. Digits stay hidden until Finance is unlocked.',
    sleep: 'The sleep station shows the latest reading and its history. Digits stay hidden until Finance is unlocked.',
  },
  setup: {
    room: 'Set up Finance before this clinic can open.',
    reception: 'Reception is here. Set up Finance to see a measurement.',
    weight: 'The weight station is here. Set up Finance to record a weight.',
    rhr: 'The heart rate station is here. Set up Finance to record a heart rate.',
    bp: 'The blood pressure station is here. Set up Finance to record a blood pressure.',
    sleep: 'The sleep station is here. Set up Finance to record sleep.',
  },
  unavailable: {
    room: 'This clinic is here, and measurements are unavailable right now.',
    reception: 'Reception is here. Measurements are unavailable right now.',
    weight: 'The weight station is here. Measurements are unavailable right now.',
    rhr: 'The heart rate station is here. Measurements are unavailable right now.',
    bp: 'The blood pressure station is here. Measurements are unavailable right now.',
    sleep: 'The sleep station is here. Measurements are unavailable right now.',
  },
  ready: {
    room: 'Reception and the vital stations open the same measurement editor.',
    reception: 'Choose a station to see the latest reading, its date, and the history.',
    weight: 'The latest weight, its date, and the history are here. Correcting a reading uses the measurement editor.',
    rhr: 'The latest heart rate, its date, and the history are here. Correcting a reading uses the measurement editor.',
    bp: 'The latest blood pressure, its date, and the history are here. Correcting a reading uses the measurement editor.',
    sleep: 'The latest sleep, its date, and the history are here. Correcting a reading uses the measurement editor.',
  },
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

export function clinicRoomDetail(id: ClinicObjectId | null, gate: ClinicGate): string {
  return DETAILS[gate][id ?? 'room'];
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
