export interface ItineraryEntry {
  key: string;
  source: "plan" | "transport" | "parking";
  part: "activity" | "departure" | "arrival" | "transport" | "parking";
  id: number;
  date: string | null;
  time: string | null;
  rank: number;
  sortOrder: number;
  title: string;
  primary: boolean;
}

export interface ItineraryDay {
  onDate: string;
  label: string;
  kicker: string;
  busy: boolean;
  accessibleName: string;
  entries: ItineraryEntry[];
  unscheduled: ItineraryEntry[];
}

export interface ItineraryProjection {
  days: ItineraryDay[];
  unscheduled: ItineraryEntry[];
  outOfRange: ItineraryEntry[];
}

export interface ItineraryPlan {
  id: number;
  on_date?: string | null;
  start_time?: string | null;
  title?: string | null;
  sort_order?: number | null;
}

export interface ItineraryTransport {
  id: number;
  label?: string | null;
  depart_at?: string | null;
  arrive_at?: string | null;
  sort_order?: number | null;
}

export interface ItineraryParking {
  id: number;
  transport_id?: number | null;
  place_name?: string | null;
  arrangement?: string | null;
  start_at?: string | null;
}

export interface ItinerarySource {
  start_date: string;
  end_date: string;
  days?: { items?: ItineraryPlan[] }[];
  outside_plans?: ItineraryPlan[];
  plans?: ItineraryPlan[];
  transports?: ItineraryTransport[];
  parking?: ItineraryParking[];
}

export function projectItinerary(trip: ItinerarySource): ItineraryProjection;
