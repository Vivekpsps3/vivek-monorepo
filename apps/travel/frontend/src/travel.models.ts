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
        place_name: string | null;
        necessary: string;
        booked: boolean;
        arrangement: string;
        address: string | null;
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
        }[];
        manual: {
            id: number;
            category: string;
            label: string;
            amount: string;
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
export interface Home {
    in_progress: Trip[];
    upcoming: Trip[];
    past: Trip[];
    pto: {
        configured: boolean;
        balance_today: string | null;
    };
    attention: {
        kind: string;
        trip_id: number;
        trip_title: string;
        text: string;
        due_at?: string | null;
    }[];
}
export function travelError(error: unknown): string {
    const body = (error as {
        error?: {
            message?: string;
            detail?: string | {
                msg: string;
            }[];
            request_id?: string;
        };
    }).error;
    const detail = body?.detail;
    return (body?.message || (typeof detail === 'string' ? detail : Array.isArray(detail) ? detail.map(field => field.msg.replace(/^Value error, /, '')).join(' ') : 'This could not finish. Your draft is still here. Try again.')) + (body?.request_id ? ' Reference: ' + body.request_id : '');
}
