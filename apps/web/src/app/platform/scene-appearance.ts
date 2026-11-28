/** Owner-keyed device preference for Town season, audio, motion, and decoration. Nothing here is a server record. */

export const SEASON_CHOICES = ['automatic', 'default', 'spring', 'summer', 'autumn', 'winter'] as const;
export type SeasonChoice = (typeof SEASON_CHOICES)[number];
export type ResolvedSeason = Exclude<SeasonChoice, 'automatic'>;
export type DayPart = 'day' | 'night';
export type WeatherId = 'clear' | 'rain' | 'sun' | 'leaves' | 'snow';
export const MOTION_CHOICES = ['system', 'reduce'] as const;
export type MotionChoice = (typeof MOTION_CHOICES)[number];

export interface ScenePreference {
  readonly season: SeasonChoice;
  /** Unmuted. Sound stays off until the owner turns mute off. */
  readonly sound: boolean;
  /** Linear gain from 0 to 1. Mute does not erase it. Zero stays silent. */
  readonly volume: number;
  readonly motion: MotionChoice;
  /** Optional scene marks and celebratory feedback. Rooms and objects stay available when this is off. */
  readonly decoration: boolean;
}

export const DEFAULT_SCENE_PREFERENCE: ScenePreference = Object.freeze({
  season: 'automatic',
  sound: false,
  volume: 0.7,
  motion: 'system',
  decoration: true,
});

export interface ScenePresentation {
  readonly choice: SeasonChoice;
  readonly season: ResolvedSeason;
  readonly dayPart: DayPart;
  readonly weather: WeatherId;
  readonly weatherLabel: string;
  readonly idleLabel: string;
  readonly label: string;
}

const SEASON_LABEL: Record<ResolvedSeason, string> = {
  default: 'Default',
  spring: 'Spring',
  summer: 'Summer',
  autumn: 'Autumn',
  winter: 'Winter',
};

interface AmbienceCopy {
  readonly weather: WeatherId;
  readonly weatherLabel: string;
  readonly idleLabel: string;
}

/** Authored presentation. It does not describe the user's habits, location, or the server day. */
const AUTHORED: Record<ResolvedSeason, Record<DayPart, AmbienceCopy>> = {
  default: {
    day: { weather: 'clear', weatherLabel: 'Clear sky', idleLabel: 'The town in its usual light' },
    night: { weather: 'clear', weatherLabel: 'Clear night', idleLabel: 'The town in its usual night' },
  },
  spring: {
    day: { weather: 'rain', weatherLabel: 'Light rain', idleLabel: 'Blossoms along the garden path' },
    night: { weather: 'rain', weatherLabel: 'Soft rain', idleLabel: 'A quiet harbor light' },
  },
  summer: {
    day: { weather: 'sun', weatherLabel: 'Bright sun', idleLabel: 'Bright sun over the harbor' },
    night: { weather: 'clear', weatherLabel: 'Warm air', idleLabel: 'Warm still air' },
  },
  autumn: {
    day: { weather: 'leaves', weatherLabel: 'Falling leaves', idleLabel: 'Leaves along the civic path' },
    night: { weather: 'leaves', weatherLabel: 'Dry leaves', idleLabel: 'Early lamps in the windows' },
  },
  winter: {
    day: { weather: 'snow', weatherLabel: 'Light snow', idleLabel: 'Light snow on the roofs' },
    night: { weather: 'snow', weatherLabel: 'Quiet snow', idleLabel: 'Snow under the lamps' },
  },
};

export function scenePreferenceKey(ownerId: number): string {
  return `town.scene.v1.${ownerId}`;
}

/** March–May spring, June–August summer, September–November autumn, December–February winter. */
export function seasonForMonth(month: number): ResolvedSeason {
  if (month >= 3 && month <= 5) return 'spring';
  if (month >= 6 && month <= 8) return 'summer';
  if (month >= 9 && month <= 11) return 'autumn';
  if (month === 12 || month === 1 || month === 2) return 'winter';
  return 'default';
}

export function resolveSeason(choice: SeasonChoice, month: number): ResolvedSeason {
  return choice === 'automatic' ? seasonForMonth(month) : choice;
}

/** Local clock hours 6 through 17 are day. This does not move the authoritative Town date. */
export function dayPartForHour(hour: number): DayPart {
  return hour >= 6 && hour < 18 ? 'day' : 'night';
}

export function presentScene(choice: SeasonChoice, date: Date): ScenePresentation {
  const season = resolveSeason(choice, date.getMonth() + 1);
  const dayPart = dayPartForHour(date.getHours());
  const copy = AUTHORED[season][dayPart];
  const mode = choice === 'automatic' ? `Automatic, ${SEASON_LABEL[season]}` : SEASON_LABEL[season];
  const dayLabel = dayPart === 'day' ? 'Day' : 'Night';
  return {
    choice,
    season,
    dayPart,
    weather: copy.weather,
    weatherLabel: copy.weatherLabel,
    idleLabel: copy.idleLabel,
    label: `${mode}. ${dayLabel}. ${copy.weatherLabel}. ${copy.idleLabel}.`,
  };
}

export function preferencesEqual(left: ScenePreference, right: ScenePreference): boolean {
  return left.season === right.season
    && left.sound === right.sound
    && left.volume === right.volume
    && left.motion === right.motion
    && left.decoration === right.decoration;
}

function isChoice(value: unknown): value is SeasonChoice {
  return typeof value === 'string' && (SEASON_CHOICES as readonly string[]).includes(value);
}

function isMotion(value: unknown): value is MotionChoice {
  return value === 'system' || value === 'reduce';
}

export function normalizeVolume(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_SCENE_PREFERENCE.volume;
  return Math.round(Math.min(1, Math.max(0, value)) * 100) / 100;
}

/** Stored reduce wins. The device query still reduces when the stored choice is system. */
export function motionReduced(motion: MotionChoice, systemReduced: boolean): boolean {
  return motion === 'reduce' || systemReduced;
}

export function scenePreference(value: Partial<ScenePreference>): ScenePreference {
  return {
    season: isChoice(value.season) ? value.season : DEFAULT_SCENE_PREFERENCE.season,
    sound: value.sound === true,
    volume: normalizeVolume(value.volume),
    motion: isMotion(value.motion) ? value.motion : 'system',
    decoration: value.decoration !== false,
  };
}

export function browserSceneStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function readScenePreference(storage: Pick<Storage, 'getItem'> | null, ownerId: number): ScenePreference {
  if (!storage) return DEFAULT_SCENE_PREFERENCE;
  try {
    const raw = storage.getItem(scenePreferenceKey(ownerId));
    if (!raw) return DEFAULT_SCENE_PREFERENCE;
    const parsed = JSON.parse(raw) as Partial<ScenePreference> | null;
    if (!parsed || typeof parsed !== 'object') return DEFAULT_SCENE_PREFERENCE;
    return scenePreference(parsed);
  } catch {
    return DEFAULT_SCENE_PREFERENCE;
  }
}

export function writeScenePreference(
  storage: Pick<Storage, 'setItem'> | null,
  ownerId: number,
  value: ScenePreference,
): boolean {
  if (!storage || !isChoice(value.season)) return false;
  const stored = scenePreference(value);
  try {
    storage.setItem(scenePreferenceKey(ownerId), JSON.stringify({
      season: stored.season,
      sound: stored.sound,
      volume: stored.volume,
      motion: stored.motion,
      decoration: stored.decoration,
    }));
    return true;
  } catch {
    return false;
  }
}
