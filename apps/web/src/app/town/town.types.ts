interface LevelProgress {
  xp: number;
  level: number;
  level_xp_start: number;
  next_level_xp: number | null;
}

export interface Habit extends LevelProgress {
  id: number;
  name: string;
  slot: number | null;
  building_style: 'forge' | 'garden' | 'cottage';
  cadence: {
    per_week: number;
    kind: 'daily' | 'weekly';
    pending: { per_week: number; effective_from: string } | null;
  };
  created_on: string;
  archived_on: string | null;
  stage: 1 | 2 | 3;
  streak: {
    unit: 'days' | 'weeks';
    current: number;
    best: number;
    best_days: number;
    best_weeks: number;
    rest_day_available: boolean | null;
    rest_used_on: string | null;
  };
  week: { done: number; target: number } | null;
  checked_today: boolean;
  checked_yesterday: boolean;
  can_check_yesterday: boolean;
  last7: ('done' | 'rest' | 'miss' | 'pending' | 'none' | 'off')[];
}

export interface Building extends LevelProgress {
  stage: 1 | 2 | 3;
  today_xp: number;
  today_cap: number;
  source: 'ok' | 'unavailable';
}

export interface TownResponse {
  town: LevelProgress & {
    name: string;
    founded_on: string | null;
    today: string;
    tz: string;
  };
  buildings: { library: Building; inn: Building };
  lots: {
    slot: number;
    unlock_level: number;
    state: 'occupied' | 'empty' | 'locked';
    habit_id: number | null;
  }[];
  habits: Habit[];
  archived: {
    id: number;
    name: string;
    xp: number;
    level: number;
    best_days: number;
    best_weeks: number;
    created_on: string;
    archived_on: string;
  }[];
  today: { done: number; total: number };
  constants_version: number;
}
