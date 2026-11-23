import { DestroyRef, Injectable, Injector, inject } from '@angular/core';
import { mayPublish, openBoundedWork } from '@vivek/browser';
import { Observable } from 'rxjs';
import {
  bindLockSnapshots,
  financeVaultPresent,
  openVaultRecords,
  type VaultRecordCapability,
  type VaultRecordEnvelope,
} from '../../../../../finance/frontend/src/public-api';
import { SessionService } from '../../platform/session.service';
import { HEALTH_SCHEMA_VERSION, TOWN_REVIEWS_COLLECTION } from './health-store.service';
import {
  newReviewClientId,
  parseWeeklyReview,
  reviewFromDraft,
  storedReview,
  type ReviewDraft,
  type WeeklyReview,
} from './review';

/**
 * Weekly review vault store. Reads and writes town_reviews only.
 * Clinic and Gym do not load this collection. Nothing here calls Town,
 * grants XP, or writes plaintext to storage.
 */

export const REVIEW_CONFLICT_MESSAGE =
  'This week changed in another tab. Your draft is still here. Save again to keep this draft.';

export interface ReviewEntry {
  clientId: string;
  revision: number;
  keyVersion: number;
  value: WeeklyReview;
}

export type ReviewLoadResult =
  | { state: 'locked' }
  | { state: 'unavailable' }
  | { state: 'ready'; weeks: ReviewEntry[]; unreadable: number };

export class ReviewLockedError extends Error {
  constructor() {
    super('The Finance vault is locked.');
    this.name = 'ReviewLockedError';
  }
}

/** The saved week was refetched. Callers keep their draft and discard baseline. */
export class ReviewConflictError extends Error {
  constructor(readonly latest: ReviewEntry | null) {
    super(REVIEW_CONFLICT_MESSAGE);
    this.name = 'ReviewConflictError';
  }
}

/** Rejected before a vault write. The caller's draft stays. */
export class ReviewRejectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReviewRejectedError';
  }
}

interface Publication {
  readonly generation: number;
  readonly ownerId: number | null;
  readonly loadId?: number;
}

function isConflict(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { status?: unknown }).status === 409;
}

function concreteOwner(id: unknown): number | null {
  return typeof id === 'number' && Number.isInteger(id) && id > 0 ? id : null;
}

@Injectable({ providedIn: 'root' })
export class ReviewStoreService {
  private readonly injector = inject(Injector);
  private readonly session = inject(SessionService);
  private weeks: ReviewEntry[] = [];
  private unreadable = 0;
  private generation = 0;
  private loadOwner = 0;
  private nextLoadId = 0;
  private ownerSeen: number | null | undefined;
  private disposed = false;
  private stop = new AbortController();

  constructor() {
    const destroy = inject(DestroyRef);
    const releaseLock = bindLockSnapshots(() => this.invalidate());
    const ownerSub = this.session.user$.subscribe(user => this.noteOwner(user?.id));
    const clearSub = this.session.cleared$.subscribe(() => this.invalidate());
    destroy.onDestroy(() => {
      this.disposed = true;
      releaseLock();
      ownerSub.unsubscribe();
      clearSub.unsubscribe();
      this.invalidate();
    });
  }

  /** Record capability seam. Tests replace it. */
  protected vault(): Promise<VaultRecordCapability> {
    return openVaultRecords(this.injector);
  }

  get weeksSnapshot(): readonly ReviewEntry[] {
    return this.weeks;
  }

  get unreadableCount(): number {
    return this.unreadable;
  }

  private clearMemory(): void {
    this.weeks = [];
    this.unreadable = 0;
  }

  private currentOwner(): number | null {
    return concreteOwner(this.session.currentUser?.id);
  }

  private noteOwner(id: unknown): void {
    const owner = concreteOwner(id);
    if (this.ownerSeen === undefined) {
      this.ownerSeen = owner;
      return;
    }
    if (this.ownerSeen === owner) return;
    this.ownerSeen = owner;
    this.invalidate();
  }

  private invalidate(): void {
    this.generation += 1;
    this.loadOwner = 0;
    this.clearMemory();
    this.stop.abort();
    this.stop = new AbortController();
  }

  private publication(load: boolean): Publication {
    const loadId = load ? (this.nextLoadId += 1) : undefined;
    if (loadId !== undefined) this.loadOwner = loadId;
    return { generation: this.generation, ownerId: this.currentOwner(), loadId };
  }

  private eligible(ticket: Publication): boolean {
    if (this.disposed || ticket.generation !== this.generation) return false;
    if (ticket.ownerId !== this.currentOwner()) return false;
    if (!financeVaultPresent()) return false;
    if (ticket.loadId !== undefined && ticket.loadId !== this.loadOwner) return false;
    return true;
  }

  private guard(ticket: Publication, signal?: AbortSignal): void {
    if (!signal?.aborted && this.eligible(ticket)) return;
    if (!financeVaultPresent()) {
      this.clearMemory();
      throw new ReviewLockedError();
    }
    throw new Error('Review publication is no longer current.');
  }

  private observe<T>(source: Observable<T>, signal: AbortSignal): Promise<T> {
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (settle: () => void) => {
        if (settled) return;
        settled = true;
        settle();
      };
      const sub = source.subscribe({
        next: value => finish(() => resolve(value)),
        error: error => finish(() => reject(error)),
        complete: () => finish(() => reject(new Error('Review vault returned no row.'))),
      });
      if (settled || signal.aborted) sub.unsubscribe();
      if (signal.aborted) finish(() => reject(new DOMException('Aborted', 'AbortError')));
      else signal.addEventListener('abort', () => {
        sub.unsubscribe();
        finish(() => reject(new DOMException('Aborted', 'AbortError')));
      }, { once: true });
    });
  }

  private lost(ticket: Publication): ReviewLoadResult {
    if (this.loadOwner === ticket.loadId) this.loadOwner = 0;
    if (!financeVaultPresent()) {
      this.clearMemory();
      return { state: 'locked' };
    }
    return { state: 'unavailable' };
  }

  async load(opts?: { signal?: AbortSignal }): Promise<ReviewLoadResult> {
    if (!financeVaultPresent()) {
      this.clearMemory();
      return { state: 'locked' };
    }
    const ticket = this.publication(true);
    const work = openBoundedWork({ parents: [opts?.signal, this.stop.signal] });
    try {
      if (work.callerAborted() || work.signal.aborted) return this.lost(ticket);
      const outcome = await work.run(() => this.readWeeks(work.signal, ticket));
      if (outcome.status !== 'ok' || !mayPublish(work, this.eligible(ticket))) return this.lost(ticket);
      return { state: 'ready', weeks: [...this.weeks], unreadable: this.unreadable };
    } finally {
      work.dispose();
    }
  }

  private async readWeeks(signal: AbortSignal, ticket: Publication): Promise<void> {
    const vault = await this.vault();
    this.guard(ticket, signal);
    const rows = await this.observe(vault.listRecords(TOWN_REVIEWS_COLLECTION, { silent: true }), signal);
    this.guard(ticket, signal);
    const read = await this.decryptWeeks(vault, rows, signal, ticket);
    this.guard(ticket, signal);
    this.weeks = read.entries;
    this.unreadable = read.skipped;
  }

  /** Highest revision per ISO week. Other valid rows stay in the vault. */
  private async decryptWeeks(
    vault: VaultRecordCapability,
    rows: readonly VaultRecordEnvelope[],
    signal: AbortSignal,
    ticket: Publication,
  ): Promise<{ entries: ReviewEntry[]; skipped: number }> {
    const byWeek = new Map<string, ReviewEntry>();
    let skipped = 0;
    for (const row of rows) {
      this.guard(ticket, signal);
      if (row.schema_version !== HEALTH_SCHEMA_VERSION) {
        skipped += 1;
        continue;
      }
      try {
        const value = await vault.decryptPayload<unknown>(
          row.ciphertext_b64,
          TOWN_REVIEWS_COLLECTION,
          row.client_id,
          row.schema_version,
          row.key_version,
        );
        this.guard(ticket, signal);
        const parsed = parseWeeklyReview(value);
        if (!parsed) {
          skipped += 1;
          continue;
        }
        const entry: ReviewEntry = {
          clientId: row.client_id,
          revision: row.revision,
          keyVersion: row.key_version,
          value: storedReview(parsed),
        };
        const current = byWeek.get(parsed.week);
        if (!current || entry.revision > current.revision) byWeek.set(parsed.week, entry);
      } catch (error) {
        if (signal.aborted || !this.eligible(ticket)) throw error;
        skipped += 1;
      }
    }
    const entries = [...byWeek.values()].sort((a, b) => b.value.week.localeCompare(a.value.week));
    return { entries, skipped };
  }

  async save(
    week: string,
    draft: ReviewDraft,
    current: { clientId: string | null; revision: number | null; keyVersion: number },
    caller?: AbortSignal,
  ): Promise<ReviewEntry> {
    const review = reviewFromDraft(week, draft);
    if (typeof review === 'string') throw new ReviewRejectedError(review);
    const ticket = this.publication(false);
    const clientId = current.clientId ?? newReviewClientId();
    const work = openBoundedWork({ parents: [this.stop.signal, caller] });
    const signal = work.signal;
    try {
      this.guard(ticket, signal);
      const vault = await this.vault();
      const payload = storedReview(review);
      const ciphertext = await vault.encryptPayload(
        payload,
        TOWN_REVIEWS_COLLECTION,
        clientId,
        HEALTH_SCHEMA_VERSION,
        current.keyVersion,
      );
      this.guard(ticket, signal);
      try {
        const saved = await this.observe(
          vault.upsertRecords(
            [
              {
                collection: TOWN_REVIEWS_COLLECTION,
                client_id: clientId,
                ciphertext_b64: ciphertext,
                schema_version: HEALTH_SCHEMA_VERSION,
                key_version: current.keyVersion,
                expected_revision: current.revision,
              },
            ],
            { silent: true },
          ),
          signal,
        );
        this.guard(ticket, signal);
        const row = saved[0];
        const entry: ReviewEntry = {
          clientId,
          revision: row?.revision ?? (current.revision ?? 0) + 1,
          keyVersion: current.keyVersion,
          value: payload,
        };
        this.weeks = [...this.weeks.filter(item => item.value.week !== week), entry]
          .sort((a, b) => b.value.week.localeCompare(a.value.week));
        return entry;
      } catch (error) {
        if (isConflict(error) && this.eligible(ticket)) {
          await this.refetch(ticket, signal);
          throw new ReviewConflictError(this.weeks.find(item => item.value.week === week) ?? null);
        }
        throw error;
      }
    } finally {
      work.dispose();
    }
  }

  async remove(entry: { clientId: string; revision: number; week: string }, caller?: AbortSignal): Promise<void> {
    const ticket = this.publication(false);
    const work = openBoundedWork({ parents: [this.stop.signal, caller] });
    const signal = work.signal;
    try {
      this.guard(ticket, signal);
      const vault = await this.vault();
      try {
        await this.observe(
          vault.deleteRecords(
            [
              {
                collection: TOWN_REVIEWS_COLLECTION,
                client_id: entry.clientId,
                expected_revision: entry.revision,
              },
            ],
            { silent: true },
          ),
          signal,
        );
      } catch (error) {
        if (isConflict(error) && this.eligible(ticket)) {
          await this.refetch(ticket, signal);
          throw new ReviewConflictError(this.weeks.find(item => item.value.week === entry.week) ?? null);
        }
        throw error;
      }
      this.guard(ticket, signal);
      this.weeks = this.weeks.filter(item => item.clientId !== entry.clientId);
    } finally {
      work.dispose();
    }
  }

  private async refetch(ticket: Publication, signal: AbortSignal): Promise<void> {
    const vault = await this.vault();
    const rows = await this.observe(vault.listRecords(TOWN_REVIEWS_COLLECTION, { silent: true }), signal);
    this.guard(ticket, signal);
    const read = await this.decryptWeeks(vault, rows, signal, ticket);
    this.guard(ticket, signal);
    this.weeks = read.entries;
    this.unreadable = read.skipped;
  }
}
