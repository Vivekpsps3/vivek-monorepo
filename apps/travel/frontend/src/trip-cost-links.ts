import { Injectable, inject, signal } from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { FinanceTripSpendRegistry, SESSION_CONTEXT, type TripSpendConfirmResult } from "@vivek/ui";
import type { CostLinkRef } from "./trip-costs.mjs";

/**
 * Session-only cost links. Amounts stay on the Travel line and the Finance lookup.
 * A reload drops the selection. Signing out clears it. Locking Finance does not.
 */
@Injectable({ providedIn: "root" })
export class TripCostLinkStore {
  private readonly links = signal<CostLinkRef[]>([]);
  private readonly session = inject(SESSION_CONTEXT, { optional: true });

  constructor() {
    this.session?.cleared$.pipe(takeUntilDestroyed()).subscribe(() => this.clearAll());
  }

  forTrip(tripId: number): CostLinkRef[] {
    return this.links().filter((link) => link.tripId === tripId);
  }

  remember(link: CostLinkRef): void {
    const next = this.links().filter((row) => {
      if (row.tripId !== link.tripId) return true;
      const sameLine = row.source === link.source && row.sourceId === link.sourceId;
      const samePosting = row.transactionId === link.transactionId;
      return !sameLine && !samePosting;
    });
    this.links.set([...next, link]);
  }

  forget(tripId: number, source: string, sourceId: number): void {
    this.links.set(
      this.links().filter(
        (row) => !(row.tripId === tripId && row.source === source && row.sourceId === sourceId),
      ),
    );
  }

  clearAll(): void {
    this.links.set([]);
  }
}

export type TripCostLinkResult = TripSpendConfirmResult;

/** Confirms through the spend registry. Tests replace this provider. */
@Injectable({ providedIn: "root" })
export class TripCostLinkConfirm {
  private readonly registry = inject(FinanceTripSpendRegistry);

  confirm(tripId: number, transactionId: number): Promise<TripCostLinkResult> {
    return this.registry.confirm(tripId, transactionId);
  }
}
