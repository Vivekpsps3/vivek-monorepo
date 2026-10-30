import type { ArtifactKind, Biome, DecorKind, MediaKind } from './constants';

export type HabitStyle = 'forge' | 'garden' | 'cottage';

export type HabitSpriteId = `${HabitStyle}-${1 | 2 | 3}`;

export interface ApiTrip {
  id: number;
  start: string;
  end: string;
  place: { label: string; lat_e2: number | null } | null;
  title?: string;
}

export interface ApiFinished {
  entry_id: number;
  kind: MediaKind;
  on: string;
  title?: string;
}

export interface ApiHabit {
  habit_id: number;
  style: HabitStyle;
  days: string[];
  name?: string;
  archived?: boolean;
}

export interface ApiConcept {
  id: number;
  on: string;
  name?: string;
}

export interface ApiWeek {
  week: string;
  trips: ApiTrip[];
  finished: ApiFinished[];
  habits: ApiHabit[];
  concepts: ApiConcept[];
  finished_more?: number;
}

export type Item =
  | { k: 'concept'; id: number }
  | { k: 'artifact'; kind: ArtifactKind; id: number };

export interface HabitInput {
  id: number;
  style: HabitStyle;
  n: number;
  first: number;
}

export interface DayInput {
  biome: Biome;
  trip: number | null;
  items: Item[];
  lit: boolean;
}

export interface WeekInput {
  v: number;
  week: string;
  days: DayInput[];
  habits: HabitInput[];
}

export interface Structure {
  x: number;
  sprite: HabitSpriteId;
  habit: number;
}

export type Prop = { x: number } & (Item | { k: 'pile'; n: number });

export interface Decor {
  x: number;
  kind: DecorKind;
}

export interface Chunk {
  v: number;
  week: string;
  heights: number[];
  biomes: Biome[];
  trips: (number | null)[];
  lit: boolean[];
  structures: Structure[];
  structuresOverflow: number;
  props: Prop[];
  decor: Decor[];
  chest: { x: number };
}
