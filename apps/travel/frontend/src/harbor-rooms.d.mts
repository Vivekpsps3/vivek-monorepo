export interface RoomQuery {
  room: "" | "map" | "gallery";
  trip: number | null;
  place: string;
  card: "" | "planned" | "completed" | "souvenir";
}

export interface TripSpan {
  start: string;
  end: string;
  text: string;
  inventedReturn: false;
}

export interface TripPtoDate {
  on_date: string;
  amount: string;
}

export interface TripPtoView {
  charged: string;
  counts: boolean;
  note: string;
  text: string;
  dates: TripPtoDate[];
}

export interface MapDestination {
  tripId: number;
  title: string;
  kind: string;
  kindLabel: string;
  label: string;
  lat: number | null;
  lng: number | null;
  span: TripSpan;
  missing: boolean;
}

export interface RoomTransport {
  id: number;
  mode: string;
  number: string;
  role: string;
}

export interface PostcardFacts {
  status: string;
  markLabel: string;
  spanStart: string;
  spanEnd: string;
  spanText: string;
  agrees: boolean;
}

export interface RoomSouvenir {
  id: string;
  trip_id: number;
  title: string;
  status: string;
  mark: string;
  mark_label: string;
  span_start: string;
  span_end: string;
  span_text: string;
}

export interface RoomTrip {
  id: number;
  title: string;
  start_date: string;
  end_date: string;
  status: string;
  counts_as_pto?: boolean;
  pto?: {
    days?: string;
    counts?: boolean;
    note?: string | null;
  };
  pto_dates?: { on_date?: string; amount?: string }[];
  budget?: { lines?: unknown[] };
  transports?: unknown[];
}

export interface FerryRing {
  rung: true;
  decorative: true;
  completesTrip: false;
  ptoCharge: false;
  inventedReturn: false;
  status: string;
  end: string;
}

export interface RoomDraft {
  note: string;
  ferry: null;
}

export function readRoomQuery(params: { get(name: string): string | null } | null | undefined): RoomQuery;
export function tripById(home: unknown, tripId: number | null): RoomTrip | null;
export function tripSpan(trip: unknown): TripSpan;
export function tripPto(trip: unknown): TripPtoView;
export function mapDestinations(home: unknown): MapDestination[];
export function destinationLabel(row: MapDestination | null | undefined): string;
export function roomDayLabel(row: { day?: string; title?: string; city?: string } | null | undefined): string;
export function visibleItinerary(
  home: unknown,
  tripId: number | null,
): { tripId: number; title: string; day: string; city: string }[];
export function tripTransports(trip: unknown): RoomTransport[];
export function ordinarySouvenirs(memories: unknown): RoomSouvenir[];
export function plannedPostcards(memories: unknown): RoomSouvenir[];
export function completedPostcards(memories: unknown): RoomSouvenir[];
export function cardKind(memory: unknown): "" | "planned" | "completed" | "souvenir";
export function postcardLabel(memory: RoomSouvenir | null | undefined): string;
export function souvenirLabel(memory: RoomSouvenir | null | undefined): string;
export function matchingPostcard(
  memories: unknown,
  query: { trip?: number | null; card?: string } | null,
): RoomSouvenir | null;
export function matchingDestination(rows: readonly MapDestination[], query: { trip?: number | null; place?: string } | null): MapDestination | null;
export function postcardFacts(memory: unknown, trip: unknown): PostcardFacts;
export function roomStages(
  trip: unknown,
  lookup: unknown,
  links: readonly unknown[],
): {
  currency: string;
  planned: number;
  booked: number;
  posted: number | null;
  countedOnce: number;
  locked: boolean;
}[];
export function ferryRing(trip: unknown): FerryRing;
export function acceptRoomLoad(input: { epoch: number; currentEpoch: number; sessionActive: boolean }): boolean;
export function settleRoomLoad(input: {
  epoch: number;
  currentEpoch: number;
  sessionActive: boolean;
  ok: boolean;
}): "drop" | "keep" | "apply";
export function clearRoomDraft(): RoomDraft;
