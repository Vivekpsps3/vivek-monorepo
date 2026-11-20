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

export type FactNamespace = 'habit_checkin' | 'episode_progress' | 'trip';
export type FactKind = 'checkin' | 'episode' | 'trip_span';

/** One existing source row. The score still comes from channel counts. */
export interface PixelFact {
  id: string;
  namespace: FactNamespace;
  occurrenceId: number;
  kind: FactKind;
  date: string;
  spanStart: string | null;
  spanEnd: string | null;
  coverage: 'complete' | 'truncated';
  provenance: string;
  title: string | null;
  route: string;
}

/** Active concept understanding. Archive, delete, or redate removes it. */
export interface PixelAnnotation {
  id: string;
  conceptId: number;
  name: string;
  understoodOn: string;
  provenance: string;
}

export interface SourceCoverage {
  status: SourceStatus;
  included: number;
  total: number;
  truncated: boolean;
}

export interface PixelFactCoverage {
  town: SourceCoverage;
  media: SourceCoverage;
  travel: SourceCoverage;
  concepts: SourceCoverage;
}

export interface PixelDifference {
  id: string;
  text: string;
}

export interface PixelDayFacts {
  date: string;
  facts: PixelFact[];
  annotations: PixelAnnotation[];
  coverage: PixelFactCoverage;
  differences: PixelDifference[];
  /** Same channel counts as the range response. The score path does not read these. */
  counts: { town?: number; media?: number; trip?: number };
}

export type DayFactsResult =
  | { status: 'ready'; facts: PixelDayFacts }
  | { status: 'expired' }
  | { status: 'unavailable' }
  | { status: 'dropped' };

export type AnnotationChange =
  | { kind: 'archive'; conceptId: number }
  | { kind: 'delete'; conceptId: number }
  | { kind: 'redate'; conceptId: number; understoodOn: string };

export type AnnotationChangeResult =
  | { status: 'ready' }
  | { status: 'dropped' }
  | { status: 'failed'; message: string };

export type DayFactsStatus = 'idle' | 'loading' | 'ready' | 'unavailable' | 'expired';
