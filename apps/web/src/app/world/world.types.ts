import type { Chunk, WeekInput } from './engine';

/** Shared World contract for issue 102. Engine types stay in ./engine. */

export type WorldTheme = 'light' | 'dark';

export interface WorldMeta {
  today: string;
  current_week: string;
  start_week: string;
  version: number;
}

export interface WorldPlace {
  label: string;
  lat_e2: number | null;
}

export interface WorldTrip {
  id: number;
  title: string;
  start: string;
  end: string;
  place: WorldPlace | null;
}

export interface WorldFinished {
  entry_id: number;
  kind: 'movie' | 'tv' | 'book' | 'game';
  title: string;
  on: string;
}

export interface WorldConceptRef {
  id: number;
  name: string;
  on: string;
}

export interface WorldHabit {
  habit_id: number;
  name: string;
  style: 'forge' | 'garden' | 'cottage';
  archived: boolean;
  days: string[];
}

export interface WorldWeek {
  week: string;
  trips: WorldTrip[];
  finished: WorldFinished[];
  finished_more?: number;
  habits: WorldHabit[];
  concepts: WorldConceptRef[];
}

export interface WorldResponse {
  meta: WorldMeta;
  weeks: WorldWeek[];
}

export interface ConceptRecord {
  id: number;
  name: string;
  note: string | null;
  source: string | null;
  understood_on: string | null;
  archived: boolean;
  created_at: string;
  updated_at: string;
}

export interface ConceptDraft {
  name: string;
  note: string;
  source: string;
  understood_on: string;
}

export interface ConceptFieldErrors {
  name?: string;
  note?: string;
  source?: string;
  understood_on?: string;
}

export interface LoadedChunk {
  input: WeekInput;
  inputKey: string;
  chunk: Chunk;
  week: WorldWeek;
}

export interface CameraState {
  /** Left edge of the viewport, in world tiles. Week 0 is the oldest loaded week. */
  x: number;
  /** ISO Monday of the band under the viewport center. */
  week: string;
  /** 0–6 day inside that week. */
  day: number;
  moving: boolean;
}

export type CameraCommand =
  | { type: 'band'; delta: number }
  | { type: 'week'; delta: number }
  | { type: 'home' }
  | { type: 'end' }
  | { type: 'jump'; week: string; day?: number }
  | { type: 'drag'; dxTiles: number }
  | { type: 'select-center' };

export interface ReadingItem {
  kind: 'trip' | 'finished' | 'habit' | 'concept' | 'lit' | 'budget';
  id: string;
  title: string;
  detail: string;
  date: string;
}

export interface ReadingWeek {
  week: string;
  label: string;
  items: ReadingItem[];
  budgetLine: string | null;
}

export type ChestVisual = 'sealed' | 'gold' | 'none';

export interface WeekChest {
  week: string;
  visual: ChestVisual;
  line: string | null;
}

export interface ChestOverlay {
  weeks: WeekChest[];
  toolbar: { href: string; label: string } | null;
  retry: boolean;
}

export interface FogPreference {
  enabled: boolean;
}

export interface LitSummary {
  lit: number;
  total: number;
  since: string;
  partial: boolean;
}

export interface TownLayoutLot {
  id: string;
  x: number;
  w: number;
}

export interface TownNpc {
  id: 'guide' | 'vivekbot' | 'terrarian' | 'manager';
  label: string;
  x: number;
  /** Guide is always present. The other three move in once Town is founded. */
  when: 'always' | 'founded';
}

export const WORLD_COPY = Object.freeze({
  explore: 'Explore the world',
  weekBack: 'Week',
  weekForward: 'Week',
  today: 'Today',
  town: 'Town',
  jump: 'Jump to date',
  hint: 'Arrow keys move a day. Shift moves a week. Home jumps to the oldest week and End jumps to Town.',
  loading: 'Loading…',
  before: (date: string) => `Before ${date}`,
  townUnavailable: 'Town is unavailable right now.',
  retry: 'Retry',
  emptyTitle: 'Nothing in this stretch of World yet',
  emptyMessage: 'Town is where habits, trips, and finished media start. You can also add a concept.',
  addConcept: 'Add a concept',
  concepts: 'Concepts',
  litMap: 'Lit Map',
  litSummary: (lit: number, total: number, since: string) => `Lit days: ${lit} of ${total} since ${since}`,
  loadedWeeks: '(loaded weeks)',
  withinPlan: 'Within your spending plan',
  overPlan: 'Over your spending plan',
  unlock: 'Unlock',
  unlockHref: '/finance/vault/unlock?next=%2Ftown%2Fworld',
  setPlan: 'Set a spending plan',
  setPlanHref: '/finance/planning',
  reviewSpending: 'Review spending',
  reviewSpendingHref: '/finance/spending',
  sourceHelper: 'Stored as text. Never opened or fetched.',
  nameBounds: 'Enter a name of 1 to 80 characters, without control characters.',
  noteBounds: 'Notes can be at most 2,000 characters.',
  sourceBounds: 'Source must be a single line of at most 500 characters.',
  dateBounds: "That date isn't available for a concept.",
  copySource: 'Copy',
  copyFailed: 'Could not copy that source.',
  copied: 'Copied.',
  deleteTitle: 'Delete this concept?',
  deleteMessage: 'This removes the concept. Its beacon disappears.',
  deleteConfirm: 'Delete concept',
  notYet: 'Not yet',
  understood: 'Understood',
  archived: 'Archived',
  markUnderstood: 'Mark understood',
  undoUnderstood: 'Undo',
  changeDate: 'Change date',
  archive: 'Archive',
  unarchive: 'Unarchive',
  edit: 'Edit',
  listView: 'List',
  mapView: 'Map',
  reducedMotionNote: 'Reduced motion is on, so World opens on the list. The map stays still until you move it.',
  loadOlder: 'Load older',
  weekPanel: 'This week',
} as const);
