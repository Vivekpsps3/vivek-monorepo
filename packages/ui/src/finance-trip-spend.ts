import { Injectable, signal } from "@angular/core";

export interface TripSpendTotal {
  currency: string;
  cents: number;
  count: number;
}

export type TripSpendLookup = (tripId: number) => TripSpendTotal[];

/**
 * Same-tab hand-off for Finance's per-trip spend totals.
 *
 * Finance (F15) registers a lookup after unlock; Travel (T2) reads it for its
 * "Spent in Finance" row. The totals are computed from the decrypted store in
 * this tab only: totals only, never rows. The registry stays in memory only —
 * never localStorage, sessionStorage, the URL or the network — so a locked or
 * never-opened Finance means `lookup` is null.
 */
@Injectable({ providedIn: "root" })
export class FinanceTripSpendRegistry {
  private readonly source = signal<TripSpendLookup | null>(null);

  /** null while Finance is locked or hasn't been opened in this tab. */
  readonly lookup = this.source.asReadonly();

  /** Finance calls this after unlock; the returned function unregisters (on lock). */
  register(fn: TripSpendLookup): () => void {
    this.source.set(fn);
    return () => {
      if (this.source() === fn) this.source.set(null);
    };
  }
}
