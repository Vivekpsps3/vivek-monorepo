/** Owner-keyed device preference for Town season and sound. Nothing here is a server record. */

export const SEASON_CHOICES = ['automatic', 'default', 'spring', 'summer', 'autumn', 'winter'] as const;
export type SeasonChoice = (typeof SEASON_CHOICES)[number];
export type ResolvedSeason = Exclude<SeasonChoice, 'automatic'>;
export type DayPart = 'day' | 'night';
export type WeatherId = 'clear' | 'rain' | 'sun' | 'leaves' | 'snow';

export interface ScenePreference {
  readonly season: SeasonChoice;
  readonly sound: boolean;
}

export const DEFAULT_SCENE_PREFERENCE: ScenePreference = Object.freeze({
  season: 'automatic',
  sound: false,
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
  return left.season === right.season && left.sound === right.sound;
}

function isChoice(value: unknown): value is SeasonChoice {
  return typeof value === 'string' && (SEASON_CHOICES as readonly string[]).includes(value);
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
    const parsed = JSON.parse(raw) as { season?: unknown; sound?: unknown };
    if (!parsed || typeof parsed !== 'object') return DEFAULT_SCENE_PREFERENCE;
    return {
      season: isChoice(parsed.season) ? parsed.season : 'automatic',
      sound: parsed.sound === true,
    };
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
  try {
    storage.setItem(scenePreferenceKey(ownerId), JSON.stringify({
      season: value.season,
      sound: value.sound === true,
    }));
    return true;
  } catch {
    return false;
  }
}
