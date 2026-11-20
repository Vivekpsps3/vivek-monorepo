import type { Candidate } from "./flight-model.mjs";

export interface FlightReview {
  flight: Candidate;
  title: string;
  from: string;
  to: string;
  departLabel: string;
  arriveLabel: string;
  relation: string;
  status: string;
  notice: string;
  destination: string;
}
export interface FlightProposal {
  field: "destination_city";
  value: string;
  source: "inferred";
}
export interface AcceptedFlight {
  ok: true;
  helper: string;
  leg: Record<string, unknown>;
  start: string;
  end: "";
  proposal: FlightProposal | null;
  number: string;
}
export interface FlightStartState {
  ident: string;
  departOn: string;
  values: Record<string, unknown>;
  overrides: string[];
  filled: string[];
  manual: boolean;
  review: FlightReview | null;
}
export function blankFlightStart(): FlightStartState;
export function clearFlightStart(): FlightStartState;
export function lookupApplies(state: {
  epoch: number;
  currentEpoch: number;
  sessionActive: boolean;
  settingsOpen: boolean;
  query: { ident: string; depart_on: string } | null;
  currentQuery: { ident: string; depart_on: string } | null;
}): boolean;
export function reviewOf(flight: Candidate, fetchedAt: string): FlightReview;
export function reviewFromFlights(
  flights: Candidate[],
  departOn: string,
  options?: { incomplete?: boolean; fetchedAt?: string },
): { kind: string; note: string; flights: Candidate[]; review: FlightReview | null };
export function candidateLabel(flight: Candidate): string;
export function beginManual(
  values: Record<string, unknown>,
  flight: Candidate | null,
): { values: Record<string, unknown>; overrides: string[]; filled: string[]; manual: boolean };
export function editFlightField(
  values: Record<string, unknown>,
  overrides: string[],
  name: string,
  value: string,
): { values: Record<string, unknown>; overrides: string[]; manual: boolean };
export function reviseFlightQuery(state: Partial<FlightStartState> | null | undefined): FlightStartState;
export function canAccept(state: {
  review: FlightReview | null;
  manual: boolean;
  values: Record<string, unknown>;
}): boolean;
export function acceptFlight(state: {
  review: FlightReview | null;
  values: Record<string, unknown>;
  overrides: string[];
  manual: boolean;
  ident: string;
  fetchedAt?: string;
}): AcceptedFlight | { ok: false; helper: string };
export function existingTrips(home: {
  in_progress?: { id: number; title?: string; start_date?: string; end_date?: string }[];
  upcoming?: { id: number; title?: string; start_date?: string; end_date?: string }[];
  past?: { id: number; title?: string; start_date?: string; end_date?: string }[];
} | null): { id: number; title: string; start: string; end: string }[];
export function settleAttach(state: {
  epoch: number;
  currentEpoch: number;
  sessionActive: boolean;
  ok: boolean;
  submittedNumber: string;
  currentNumber: string;
}): { apply: boolean; keepForm: boolean; failed: boolean; notice: string };
export function stageStart(currentStart: string, stagedStart: string, nextStart: string): string;
export function destinationProposal(
  proposal: { field?: string; value?: string; source?: string } | null,
  confirmed: boolean,
): FlightProposal[];
export function flightSectionDirty(state: {
  ident: string;
  departOn: string;
  review: FlightReview | null;
  manualDirty: boolean;
  stagedNumber: string;
  stagedDate: string;
}): boolean;
