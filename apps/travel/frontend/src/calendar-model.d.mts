export interface ItineraryEntry {
  key: string;
  source: "plan" | "transport" | "parking" | "stay" | "note" | "reminder";
  part: "activity" | "departure" | "arrival" | "transport" | "parking" | "stay" | "check-in" | "check-out" | "note" | "reminder";
  id: number;
  date: string | null;
  time: string | null;
  rank: number;
  sortOrder: number;
  title: string;
  primary: boolean;
  dateLine?: boolean;
  overnight?: boolean;
}

export interface ItineraryDay {
  onDate: string;
  label: string;
  kicker: string;
  busy: boolean;
  accessibleName: string;
  entries: ItineraryEntry[];
  lodging: ItineraryEntry[];
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

export interface ItineraryStay {
  id: number;
  city?: string | null;
  arrive_on?: string | null;
  leave_on?: string | null;
  lodging_name?: string | null;
  sort_order?: number | null;
}

export interface ItineraryNote {
  id: number;
  body?: string | null;
  on_date?: string | null;
}

export interface ItineraryReminder {
  id: number;
  title?: string | null;
  due_at?: string | null;
}

export interface ItinerarySource {
  start_date: string;
  end_date: string;
  days?: { items?: ItineraryPlan[] }[];
  outside_plans?: ItineraryPlan[];
  plans?: ItineraryPlan[];
  transports?: ItineraryTransport[];
  parking?: ItineraryParking[];
  stays?: ItineraryStay[];
  note_entries?: ItineraryNote[];
  reminders?: ItineraryReminder[];
}

export function projectItinerary(trip: ItinerarySource): ItineraryProjection;

export function settleItineraryWrite(input: {
  epoch: number;
  currentEpoch: number;
  sessionActive: boolean;
  tripId: number;
  currentTripId: number;
}): boolean;

export function itineraryDayOpen(
  day: { onDate: string; entries?: unknown[]; unscheduled?: unknown[] } | null | undefined,
  selectedDay: string,
): boolean;

export function clearItineraryDraft(): {
  editor: string;
  noteBody: string;
  noteDate: string;
  reminderTitle: string;
  reminderDue: string;
  reminderNotes: string;
  activityTitle: string;
  activityNotes: string;
  lodgingNotes: string;
  parkingNotes: string;
  placeQuery: string;
};

export function restoredLocalDate(kind: string, body: Record<string, unknown> | null): string;
