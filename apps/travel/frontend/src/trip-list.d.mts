export const PAST_PREVIEW: number;

export interface TripCountdownSource {
  phase?: string;
  start_date: string;
  end_date: string;
}

export interface TripTotalsSource {
  budget?: {
    currencies?: readonly {
      currency: string;
      total_cents?: number;
    }[];
  } | null;
}

export interface HomeGroupsSource {
  in_progress?: readonly unknown[];
  upcoming?: readonly unknown[];
}

export function localToday(date?: Date): string;
export function dayOfTrip(
  startIso: string,
  endIso: string,
  todayIso: string,
): { day: number; of: number };
export function countdownText(
  trip: TripCountdownSource,
  todayIso: string,
): string | null;
export function totals(
  trip: TripTotalsSource,
): { currency: string; cents: number }[];
export function pastSlice<T>(past: readonly T[], expanded: boolean): T[];
export function isEmpty(home: HomeGroupsSource | null | undefined): boolean;
export function cardPtoText(trip: {
  pto_days_effective?: string | number | null;
}): string;
export function daysText(value: string | number | null | undefined): string;

export interface CardPlace {
  kind: "city" | "airport" | "lodging";
  kindLabel: string;
  label: string;
  lat: number | null;
  lng: number | null;
}

export interface CardPlaceSource {
  stays?: readonly {
    city?: string | null;
    lodging_name?: string | null;
    lat?: number | null;
    lng?: number | null;
  }[] | null;
  transports?: readonly {
    mode?: string | null;
    depart_place?: string | null;
    arrive_place?: string | null;
  }[] | null;
}

export function cardPlaces(trip: CardPlaceSource | null | undefined): CardPlace[];
export function cardStatus(trip: { phase?: string | null } | null | undefined): string;
export function cardNextAction(
  trip: { phase?: string | null; next_action?: string | null } | null | undefined,
): string;
export function acceptListedLoad(
  epoch: number,
  currentEpoch: number,
  sessionActive?: boolean,
): boolean;
export function placeSearchCurrent(input: {
  sessionActive?: boolean;
  editor?: string;
  stayId?: number;
  currentStayId?: number;
  query?: string;
  currentQuery?: string;
}): boolean;
