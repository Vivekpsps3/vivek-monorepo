export interface HallLeg {
  tripId: number;
  transportId: number;
  title: string;
  role: string;
  roleLabel: string;
  mode: string;
  number: string;
  from: string;
  to: string;
  departAt: string;
  arriveAt: string;
  day: string;
}
export interface HallDay {
  tripId: number;
  title: string;
  day: string;
  city: string;
}
export interface HallQuery {
  object: "" | "board" | "desk" | "table";
  trip: number | null;
  leg: number | null;
  day: string;
}
export function hallDate(value: unknown): string;
export function hallTrips(home: { in_progress?: unknown[]; upcoming?: unknown[]; past?: unknown[] } | null): unknown[];
export function hallIsEmpty(home: { in_progress?: unknown[]; upcoming?: unknown[]; past?: unknown[] } | null): boolean;
export function departureRows(home: unknown): HallLeg[];
export function itineraryRows(home: unknown): HallDay[];
export function legActionLabel(row: HallLeg): string;
export function dayActionLabel(row: HallDay): string;
export function readHallQuery(params: { get(name: string): string | null } | null | undefined): HallQuery;
export function hallReturnPath(input: {
  object?: string;
  trip?: number | null;
  leg?: number | null;
  day?: string;
} | null): string;
export function matchingLeg(rows: readonly HallLeg[], query: HallQuery | null): HallLeg | null;
export function matchingDay(rows: readonly HallDay[], query: HallQuery | null): HallDay | null;
export function legTarget(row: HallLeg | null): {
  tripId: number;
  transportId: number;
  day: string;
  createsTrip: false;
} | null;
export function acceptHallLoad(state: {
  epoch: number;
  currentEpoch: number;
  sessionActive: boolean;
}): boolean;
export function clearHallDesk(): {
  ident: string;
  departOn: string;
  actionError: string;
  home: null;
};
