import {
  BUILDING_LV,
  DAILY_CAP,
  LOT_UNLOCK_LV,
  MEDIA_FINISHED_KINDS,
  TOWN_CONSTANTS_VERSION,
  TOWN_LV,
  TREASURY_WEEKS,
  XP,
} from './town.constants';

export interface HallRule {
  readonly id: string;
  readonly label: string;
  readonly text: string;
}

export interface HallProgress {
  readonly level: number;
  readonly xp: number;
  readonly next_level_xp: number | null;
}

const FINISHED_LABEL: Record<(typeof MEDIA_FINISHED_KINDS)[number], string> = {
  movie: 'movie',
  tv: 'series',
  book: 'book',
  game: 'game',
};

function levels(table: readonly number[]): string {
  return table.map((xp, index) => `Level ${index + 1} starts at ${xp} XP`).join('. ') + '.';
}

/** Public copy of the canonical Town tables. Progress numbers come from the API. */
export function hallRules(): readonly HallRule[] {
  const finished = MEDIA_FINISHED_KINDS.map(kind => FINISHED_LABEL[kind]).join(', ');
  return [
    { id: 'check-in', label: 'Habit check-in', text: `${XP.manual} XP` },
    { id: 'streak', label: 'Seven-day streak', text: `${XP.streak7} XP` },
    { id: 'episode', label: 'Media episode', text: `${XP.mediaEpisode} XP, capped at ${DAILY_CAP.library} Library XP a day` },
    { id: 'finished', label: 'Finished media', text: `${finished}: ${XP.mediaFinished} XP, inside the Library cap` },
    { id: 'reminder', label: 'Travel reminder', text: `${XP.travelReminder} XP, capped at ${DAILY_CAP.inn} Inn XP a day` },
    { id: 'trip', label: 'Finished trip', text: `${XP.tripDone} XP, inside the Inn cap` },
    { id: 'town-levels', label: 'Town levels', text: levels(TOWN_LV) },
    { id: 'building-levels', label: 'Habit and building levels', text: levels(BUILDING_LV) },
    { id: 'lots', label: 'Lot unlocks', text: LOT_UNLOCK_LV.map((level, slot) => `Lot ${slot + 1} at town level ${level}`).join('. ') + '.' },
    { id: 'treasury', label: 'Treasury tiers', text: `Kept budget weeks: ${TREASURY_WEEKS.join(', ')}. Balances stay in Finance and are not shown here.` },
    { id: 'health', label: 'Health', text: 'Measurements stay in the Clinic and Gym. The Hall does not list them.' },
  ];
}

export const HALL_RULES_VERSION = TOWN_CONSTANTS_VERSION;

/** The Town response already carries level and XP. This only prints those fields. */
export function hallProgressLine(town: HallProgress): string {
  if (town.next_level_xp == null) return `Level ${town.level} · ${town.xp} XP · Max`;
  return `Level ${town.level} · ${town.xp} / ${town.next_level_xp} XP`;
}

export function habitProgressLine(habit: { readonly name: string; readonly level: number; readonly xp: number }): string {
  return `${habit.name} · Level ${habit.level} · ${habit.xp} XP`;
}
