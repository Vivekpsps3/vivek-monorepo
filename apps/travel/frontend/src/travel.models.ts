export interface Stay {
  id: number;
  city: string;
  arrive_on: string;
  leave_on: string;
  lat: number | null;
  lng: number | null;
  lodging_name: string | null;
  lodging_address: string | null;
  notes: string | null;
}
export interface Transport {
  id: number;
  role: string;
  mode: string;
  label: string;
  number: string | null;
  carrier: string | null;
  depart_place: string | null;
  arrive_place: string | null;
  depart_at: string | null;
  arrive_at: string | null;
  depart_tz: string | null;
  arrive_tz: string | null;
  cost: string | null;
  currency: string;
  status: string;
  notes: string | null;
  confirmation: string | null;
  seat: string | null;
  paid: boolean;
}
export interface Plan {
  id: number;
  on_date: string;
  kind: string;
  title: string;
  place_name: string | null;
  start_time: string | null;
  end_time: string | null;
  notes: string | null;
  cost: string | null;
  currency: string;
  paid: boolean;
  lat: number | null;
  lng: number | null;
  address: string | null;
  url: string | null;
}
export interface PtoDate {
  on_date: string;
  amount: string;
  provenance: string;
}
export interface BucketState {
  bucket: "pto" | "sick";
  configured: boolean;
  start_balance_hours?: string;
  balance_as_of?: string;
  accrual_hours?: string;
  accrual_cadence?: string;
  cap_hours?: string | null;
  year_start?: string;
  carry_forward?: boolean;
  accrual_mode?: string;
  accrual_anchor?: string | null;
  accrual_version?: number;
  balance_today_hours?: string;
  balance_today_days?: string;
  at_cap?: boolean;
  today_before_balance_date?: boolean;
}
export interface PtoEntryRow {
  id: number;
  trip_id: number | null;
  start_date: string;
  end_date: string;
  days: string;
  label: string;
  kind: string;
  notes: string | null;
  bucket?: "pto" | "sick";
  hours?: string;
  charges?: {
    on_date: string;
    amount: string;
  }[];
}
export interface PtoBoard {
  hours_per_day: string;
  pto_sick_prompt_dismissed: boolean;
  buckets: {
    pto: BucketState | null;
    sick: BucketState | null;
  };
  entries: PtoEntryRow[];
  policy?: {
    configured?: boolean;
    balance_saved?: string | null;
    balance_as_of?: string | null;
    balance_today?: string | null;
    accrual_amount?: string | null;
    accrual_unit?: string;
    accrual_cadence?: string;
    hours_per_day?: string;
    annual_cap_days?: string | null;
    conflicts?: {
      on_date: string;
      amount: string;
      labels: string[];
    }[];
  };
}
export interface PtoSettings {
  hours_per_day: string;
  sick_prompt_dismissed: boolean;
}
export interface PtoPreview {
  balance_when_you_leave?: string | null;
  leftover_after?: string | null;
  note?: string;
  bucket?: string;
}
export interface CostBucket {
  bucket: "transport" | "stays_plans" | "parking" | "other";
  label: string;
  total_cents: number;
  paid_cents: number;
  unpaid_cents: number;
  total: string;
  paid: string;
  unpaid: string;
}
export interface Trip {
  id: number;
  title: string;
  start_date: string;
  end_date: string;
  status: string;
  origin_label: string | null;
  notes: string | null;
  cities: string[];
  phase: string;
  span_days: number;
  nights: number;
  counts_as_pto: boolean;
  pto_mode: string;
  pto_days_effective: string;
  pto_dates: PtoDate[];
  stays: Stay[];
  transports: Transport[];
  days: {
    on_date: string;
    city: string;
    items: Plan[];
    transports: Transport[];
  }[];
  outside_plans: Plan[];
  parking: {
    id: number;
    transport_id: number | null;
    place_name: string | null;
    necessary: string;
    booked: boolean;
    arrangement: string;
    address: string | null;
    start_at: string | null;
    end_at: string | null;
    cost: string | null;
    currency: string;
    confirmation: string | null;
    notes: string | null;
  }[];
  reminders: {
    id: number;
    title: string;
    due_at: string | null;
    done: boolean;
    kind: string;
    notes: string | null;
  }[];
  note_entries: {
    id: number;
    body: string;
    on_date: string | null;
  }[];
  budget: {
    currencies: {
      currency: string;
      total: string;
      paid: string;
      unpaid: string;
      total_cents: number;
      paid_cents: number;
      unpaid_cents: number;
      buckets: CostBucket[];
    }[];
    lines: {
      amount_cents: number;
      bucket: CostBucket["bucket"];
      currency: string;
      paid: boolean;
      [key: string]: unknown;
    }[];
    manual: {
      id: number;
      category: string;
      label: string;
      amount: string;
      amount_cents: number;
      currency: string;
      paid: boolean;
      notes: string | null;
    }[];
  };
  pto: {
    configured: boolean;
    days: string;
    balance_after?: string;
    balance_before?: string;
    negative?: boolean;
    conflicts: {
      on_date: string;
      amount: string;
      labels: string[];
    }[];
  };
}
export interface HomeNextPto {
  trip_id: number;
  title: string;
  start_date: string;
  days: string;
  hours: string;
  balance_when_you_leave: string;
  balance_when_you_leave_hours: string;
  leftover_after: string;
  leftover_after_hours: string;
}
export interface Home {
  in_progress: Trip[];
  upcoming: Trip[];
  past: Trip[];
  pto: {
    configured: boolean;
    balance_today: string | null;
  };
  next_pto: HomeNextPto | null;
  attention: {
    kind: string;
    trip_id: number;
    trip_title: string;
    text: string;
    due_at?: string | null;
  }[];
}
export function travelError(error: unknown): string {
  const body = (
    error as {
      error?: {
        message?: string;
        detail?:
          | string
          | {
              msg: string;
            }[];
        request_id?: string;
      };
    }
  ).error;
  const detail = body?.detail;
  return (
    (body?.message ||
      (typeof detail === "string"
        ? detail
        : Array.isArray(detail)
          ? detail
              .map((field) => field.msg.replace(/^Value error, /, ""))
              .join(" ")
          : "This could not finish. Your draft is still here. Try again.")) +
    (body?.request_id ? " Reference: " + body.request_id : "")
  );
}
