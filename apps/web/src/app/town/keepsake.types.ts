export type KeepsakeSource = 'ok' | 'absent' | 'unavailable';
export type KeepsakeMark = 'planned' | 'souvenir' | 'ineligible';

export interface KeepsakeCoverage {
  status: KeepsakeSource;
  included: number;
  total: number;
  truncated: boolean;
}

export interface KeepsakeTravel {
  status: KeepsakeSource;
  souvenirs: KeepsakeCoverage;
  planned: KeepsakeCoverage;
  ineligible: KeepsakeCoverage;
}

export interface KeepsakePlace {
  label: string;
  lat_e2: number | null;
}

export interface MediaKeepsake {
  id: string;
  entry_id: number;
  kind: 'movie' | 'tv' | 'book' | 'game';
  title: string;
  on: string;
  route: string;
  note: string;
  date_source: 'completed_on' | 'finished_on';
}

export interface TripKeepsake {
  id: string;
  trip_id: number;
  title: string;
  status: string;
  mark: KeepsakeMark;
  span_start: string;
  span_end: string;
  credit_date: string | null;
  credit_eligible: boolean;
  destinations: string[];
  place: KeepsakePlace | null;
  scenery: string;
  route: string;
  note: string;
}

export interface KeepsakeDifference {
  id: string;
  text: string;
}

export interface KeepsakeShelf {
  on: string | null;
  cap: number;
  media: KeepsakeCoverage;
  travel: KeepsakeTravel;
  keepsakes: MediaKeepsake[];
  souvenirs: TripKeepsake[];
  planned: TripKeepsake[];
  ineligible: TripKeepsake[];
  differences: KeepsakeDifference[];
}
