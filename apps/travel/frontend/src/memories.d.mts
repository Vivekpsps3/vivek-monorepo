export interface MemoryOverlap {
  trip_id: number;
  title: string;
  span_text: string;
}

export interface TripMemory {
  id: string;
  trip_id: number;
  title: string;
  status: string;
  mark: string;
  mark_label: string;
  span_start: string;
  span_end: string;
  span_days: number;
  span_text: string;
  destinations: string[];
  credit_date: string | null;
  credit_eligible: boolean;
  credit_text: string;
  pixels_text: string;
  world_text: string;
  logged_on: string | null;
  logged_text: string;
  overlaps: MemoryOverlap[];
  overlap_text: string;
  route: string;
}

export interface MemoryDifference {
  id: string;
  text: string;
}

export interface MemoryList {
  source: string;
  zone: string;
  cap: number;
  total: number;
  included: number;
  truncated: boolean;
  notice: string;
  differences: MemoryDifference[];
  memories: TripMemory[];
}

export interface MemoryDraft {
  tripId: number | null;
  start: string;
  end: string;
  note: string;
}

export function browserZone(zone?: string | null): string;

export function acceptMemoryLoad(input: {
  epoch: number;
  currentEpoch: number;
  sessionActive: boolean;
}): boolean;

export function settleMemoryWrite(input: {
  epoch: number;
  currentEpoch: number;
  sessionActive: boolean;
  tripId: number;
  editingTripId: number | null;
  start: string;
  end: string;
  sentStart: string;
  sentEnd: string;
}): "drop" | "reload" | "apply";

export function clearMemoryDraft(): MemoryDraft;
