export interface DraftLeg { role: string; mode?: string; [key: string]: unknown }
export interface DraftProposal { field: string; value: string; source: "inferred" }
export interface DraftInput {
  start?: string;
  end?: string;
  title?: string;
  destination?: string;
  origin?: string;
  notes?: string;
  transports?: Record<string, unknown>[];
  proposals?: { field?: string; value?: string; source?: string }[];
}
export interface DraftBody {
  title: string;
  start_date: string;
  end_date: string | null;
  destination_label: string | null;
  origin_label: string | null;
  notes: string | null;
  legs: DraftLeg[];
  proposals: DraftProposal[];
}
export function draftRequest(input: DraftInput): { ok: true; field: string; helper: string; body: DraftBody } | { ok: false; helper: string; field: string };
export function clearPrivateTripDraft(): {
  start: string;
  end: string;
  transports: Record<string, unknown>[];
  charges: Record<string, string>;
  changeDate: string;
  tripName: string;
  cities: Record<string, string>;
  notice: string;
  error: string;
  draftId: number | null;
  revision: number | null;
};
export function sameDraftInput(submitted: unknown, current: unknown): boolean;
export function draftSavedNotice(end: string | null | undefined, newer: boolean): string;
export function settleDraftResponse(state: {
  epoch: number;
  currentEpoch: number;
  sessionActive: boolean;
  ok: boolean;
  submitted?: DraftInput;
  current?: DraftInput;
}): { apply: boolean; keepForm: boolean; failed: boolean; notice: string };
