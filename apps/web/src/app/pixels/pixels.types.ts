import type { DayChannels, PixelApp } from '@vivek/ui';

/** Mirrors BudgetKeptDaysResult status, plus locked when the vault was never opened. */
export type FinanceJoinStatus =
  | 'locked'
  | 'no_plan'
  | 'no_data'
  | 'ready'
  | 'unavailable'
  | 'expired'
  | 'cancelled';

export type SourceStatus = 'ok' | 'absent' | 'unavailable';

export interface PixelSources {
  town: SourceStatus;
  media: SourceStatus;
  travel: SourceStatus;
}

export interface TripSpan {
  id: number;
  title: string;
  start: string;
  end: string;
}

export interface PixelsProfile {
  birthday: string | null;
  showAge: boolean;
}

export interface PixelDayView {
  date: string;
  channels: DayChannels;
  score: number;
  level: number;
  dominant: PixelApp | null;
  trip: TripSpan | null;
  future: boolean;
  planned: boolean;
  today: boolean;
}

export interface PixelsSnapshot {
  from: string;
  to: string;
  days: PixelDayView[];
  sources: PixelSources;
  firstActivityOn: string | null;
  profile: PixelsProfile | null;
  financeStatus: FinanceJoinStatus;
  trips: TripSpan[];
  fetchedAt: number;
}

export interface PixelsLoadRequest {
  from: string;
  to: string;
  /** Life is the only caller that may set this. Hub and Year leave it false. */
  profile: boolean;
  /** Year and Life attach trip titles. Hub leaves this false. */
  includeTrips: boolean;
  today: string;
}

export type PixelsLoadResult =
  | { status: 'ready'; snapshot: PixelsSnapshot }
  | { status: 'expired' }
  | { status: 'unavailable' }
  | { status: 'dropped' };
