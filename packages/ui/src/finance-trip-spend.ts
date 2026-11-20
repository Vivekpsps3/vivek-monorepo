import { Injectable, signal } from "@angular/core";

/** Narrow posted row. Date and category only — never a description, merchant, or account. */
export interface TripSpendPosting {
  id: number;
  cents: number;
  label: string;
}

export interface TripSpendTotal {
  currency: string;
  cents: number;
  count: number;
  postings?: TripSpendPosting[];
}

export type TripSpendLookup = (tripId: number) => TripSpendTotal[];

export type TripSpendConfirmResult =
  | { status: "posted"; posting: TripSpendPosting }
  | { status: "missing" }
  | { status: "invalid" }
  | { status: "failed" };

export type TripSpendConfirmer = (
  tripId: number,
  transactionId: number,
) => Promise<TripSpendConfirmResult>;

/**
 * Same-tab hand-off for Finance's per-trip spend.
 *
 * Finance registers one lookup after unlock and one confirmer for an explicit
 * cost link. Travel reads totals and the narrow posting list, then confirms the
 * chosen id. The registry stays in memory only — never localStorage,
 * sessionStorage, the URL or the network — so a locked or never-opened Finance
 * means `lookup` is null. Linking does not write a record.
 */
@Injectable({ providedIn: "root" })
export class FinanceTripSpendRegistry {
  private readonly source = signal<TripSpendLookup | null>(null);
  private confirmer: TripSpendConfirmer | null = null;

  /** null while Finance is locked or hasn't been opened in this tab. */
  readonly lookup = this.source.asReadonly();

  /** Finance calls this after unlock; the returned function unregisters (on lock). */
  register(fn: TripSpendLookup): () => void {
    this.source.set(fn);
    return () => {
      if (this.source() === fn) this.source.set(null);
    };
  }

  /** Finance installs the re-read. A stale release does not clear a newer one. */
  registerConfirmer(confirm: TripSpendConfirmer): () => void {
    this.confirmer = confirm;
    return () => {
      if (this.confirmer === confirm) this.confirmer = null;
    };
  }

  /** Re-read one posting. Missing Finance returns failed and writes nothing. */
  confirm(tripId: number, transactionId: number): Promise<TripSpendConfirmResult> {
    const confirm = this.confirmer;
    if (!confirm) return Promise.resolve({ status: "failed" });
    return Promise.resolve(confirm(tripId, transactionId)).then(
      (result) => result,
      () => ({ status: "failed" as const }),
    );
  }
}
