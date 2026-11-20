export const UNREADABLE_CALENDAR: string;

export interface CalendarBooking {
  uid: string;
  number: string;
  origin: string;
  destination: string;
  depart_at: string;
  arrive_at: string;
  depart_tz: string;
  arrive_tz: string;
  depart_label: string;
  arrive_label: string;
}

export interface ExistingCalendarLeg {
  kind: "trip" | "draft";
  id: number;
  title: string;
  leg_id: number;
}

export interface CalendarPreview {
  ok: boolean;
  code: string;
  reason: string;
  booking: CalendarBooking | null;
  existing: ExistingCalendarLeg | null;
}

export interface CalendarLeg {
  role: "outbound";
  mode: "flight";
  number: string;
  depart_place: string;
  arrive_place: string;
  depart_at: string;
  arrive_at: string;
  depart_tz: string;
  arrive_tz: string;
  confirmation: string;
  currency: "USD";
  paid: false;
  status: "planned";
}

export function clearCalendarImport(): {
  fileName: string;
  text: string;
  settledText: string;
  notice: string;
  error: string;
};
export function calendarSectionDirty(state: { text?: string; settledText?: string }): boolean;
export function previewApplies(state: {
  epoch: number;
  currentEpoch: number;
  sessionActive: boolean;
  submittedText: string;
  currentText: string;
}): boolean;
export function settleImport(state: {
  epoch: number;
  currentEpoch: number;
  sessionActive: boolean;
  ok: boolean;
  submittedUid: string;
  currentUid: string;
}): { apply: boolean; keepInput: boolean; failed: boolean };
export function normalizePreview(body: unknown): CalendarPreview;
export function canSaveBooking(preview: CalendarPreview | null | undefined): boolean;
export function existingNotice(existing: Partial<ExistingCalendarLeg> | null | undefined): string;
export function legFromBooking(booking: CalendarBooking): CalendarLeg;
export function draftFromBooking(booking: CalendarBooking | null | undefined):
  | {
      ok: true;
      helper: string;
      body: {
        title: string;
        start_date: string;
        end_date: null;
        destination_label: null;
        origin_label: null;
        notes: null;
        legs: CalendarLeg[];
        proposals: [];
      };
    }
  | { ok: false; helper: string };
export function savedBookingNotice(): string;
