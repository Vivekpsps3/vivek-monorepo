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
import type { HealthPr, HealthStat } from './health.types';

/**
 * Town Health vault store (THC2). Reads and writes only the health_stats
 * and health_prs collections through Finance's record capability. Decrypted
 * records live in memory only; nothing is cached to storage. Envelope
 * schema_version is always 2 on write, and rows that are not version 2 are
 * refused on read (Security, 2026-10-30): skipped and counted like
 * undecryptable rows, never deleted.
 */

export const HEALTH_STATS_COLLECTION = 'health_stats';
export const HEALTH_PRS_COLLECTION = 'health_prs';
export const HEALTH_SCHEMA_VERSION = 2;
export const HEALTH_LOAD_DEADLINE_MS = 8_000;
export const HEALTH_CONFLICT_MESSAGE =
  'This entry changed in another tab. Reload and try again.';

export interface HealthEntry<T> {
  clientId: string;
  revision: number;
  keyVersion: number;
  value: T;
}

export type HealthLoadResult =
  | { state: 'locked' }
  | { state: 'unavailable' }
  | {
      state: 'ready';
      stats: HealthEntry<HealthStat>[];
      prs: HealthEntry<HealthPr>[];
      /** Rows skipped: undecryptable, unparsable, or refused (not v2). */
      unreadable: number;
    };

export class HealthLockedError extends Error {
  constructor() {
    super('The Finance vault is locked.');
    this.name = 'HealthLockedError';
  }
}

export class HealthConflictError extends Error {
  constructor() {
    super(HEALTH_CONFLICT_MESSAGE);
    this.name = 'HealthConflictError';
  }
}

type Collection = typeof HEALTH_STATS_COLLECTION | typeof HEALTH_PRS_COLLECTION;

const STAT_KINDS: ReadonlySet<string> = new Set(['weight', 'rhr', 'bp', 'sleep', 'lab', 'checkup']);
const PR_KINDS: ReadonlySet<string> = new Set(['lift', 'run', 'other']);

/** A decrypted payload counts as parsable only with the §18.3 core fields. */
function parsable(value: unknown, kinds: ReadonlySet<string>): boolean {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record['kind'] === 'string' &&
    kinds.has(record['kind']) &&
    typeof record['measured_on'] === 'string' &&
    typeof record['logged_on'] === 'string'
  );
}

/** `hlt_` + 22 base64url chars from 16 random bytes (§18.3 client ids). */
export function newHealthClientId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `hlt_${btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}`;
}

function isConflict(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { status?: unknown }).status === 409
  );
}

function concreteOwner(id: unknown): number | null {
  return typeof id === 'number' && Number.isInteger(id) && id > 0 ? id : null;
}

/** Captured at the start of a load or write. Only a still-matching ticket may publish. */
interface Publication {
  readonly generation: number;
  readonly ownerId: number | null;
  readonly loadId?: number;
}

@Injectable({ providedIn: 'root' })
export class HealthStoreService {
  private readonly injector = inject(Injector);
  private readonly session = inject(SessionService);
  private stats: HealthEntry<HealthStat>[] = [];
  private prs: HealthEntry<HealthPr>[] = [];
  private unreadable = 0;
  /** Bumped on lock, logout, owner change, and disposal. In-flight work keeps the old value. */
  private generation = 0;
  /** The load allowed to publish. Zero means the current load lost its deadline or was invalidated. */
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

  get statsSnapshot(): readonly HealthEntry<HealthStat>[] {
    return this.stats;
  }

  get prsSnapshot(): readonly HealthEntry<HealthPr>[] {
    return this.prs;
  }

  get unreadableCount(): number {
    return this.unreadable;
  }

  private clearMemory(): void {
    this.stats = [];
    this.prs = [];
    this.unreadable = 0;
  }

  private currentOwner(): number | null {
    return concreteOwner(this.session.currentUser?.id);
  }

  /** First sighting records the owner. A later id, including logout, drops in-flight plaintext. */
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

  /** Refuse to store or return a result captured for a lock, owner, or load that has ended. */
  private guard(ticket: Publication, signal?: AbortSignal): void {
    if (!signal?.aborted && this.eligible(ticket)) return;
    if (!financeVaultPresent()) {
      this.clearMemory();
      throw new HealthLockedError();
    }
    throw new Error('Health publication is no longer current.');
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
        complete: () => finish(() => reject(new Error('Health vault returned no row.'))),
      });
      if (settled || signal.aborted) sub.unsubscribe();
      if (signal.aborted) finish(() => reject(new DOMException('Aborted', 'AbortError')));
      else signal.addEventListener('abort', () => {
        sub.unsubscribe();
        finish(() => reject(new DOMException('Aborted', 'AbortError')));
      }, { once: true });
    });
  }

  private lost(ticket: Publication): HealthLoadResult {
    if (this.loadOwner === ticket.loadId) this.loadOwner = 0;
    if (!financeVaultPresent()) {
      this.clearMemory();
      return { state: 'locked' };
    }
    return { state: 'unavailable' };
  }

  async load(opts?: { deadlineMs?: number; signal?: AbortSignal }): Promise<HealthLoadResult> {
    if (!financeVaultPresent()) {
      this.clearMemory();
      return { state: 'locked' };
    }
    const ticket = this.publication(true);
    const deadlineMs = opts?.deadlineMs ?? HEALTH_LOAD_DEADLINE_MS;
    const work = openBoundedWork({ parents: [opts?.signal, this.stop.signal], deadlineMs });
    try {
      if (work.callerAborted() || work.signal.aborted) return this.lost(ticket);
      const outcome = await work.run(() => this.loadAll(work.signal, ticket));
      if (outcome.status !== 'ok' || !mayPublish(work, this.eligible(ticket))) return this.lost(ticket);
      return {
        state: 'ready',
        stats: [...this.stats],
        prs: [...this.prs],
        unreadable: this.unreadable,
      };
    } finally {
      work.dispose();
    }
  }

  private async loadAll(signal: AbortSignal, ticket: Publication): Promise<void> {
    const vault = await this.vault();
    this.guard(ticket, signal);
    const [statRows, prRows] = await Promise.all([
      this.observe(vault.listRecords(HEALTH_STATS_COLLECTION, { silent: true }), signal),
      this.observe(vault.listRecords(HEALTH_PRS_COLLECTION, { silent: true }), signal),
    ]);
    this.guard(ticket, signal);
    const [stats, prs] = await Promise.all([
      this.decryptAll<HealthStat>(vault, HEALTH_STATS_COLLECTION, statRows, STAT_KINDS, signal, ticket),
      this.decryptAll<HealthPr>(vault, HEALTH_PRS_COLLECTION, prRows, PR_KINDS, signal, ticket),
    ]);
    this.guard(ticket, signal);
    this.stats = stats.entries;
    this.prs = prs.entries;
    this.unreadable = stats.skipped + prs.skipped;
  }

  private async decryptAll<T>(
    vault: VaultRecordCapability,
    collection: Collection,
    rows: readonly VaultRecordEnvelope[],
    kinds: ReadonlySet<string>,
    signal: AbortSignal,
    ticket: Publication,
  ): Promise<{ entries: HealthEntry<T>[]; skipped: number }> {
    const entries: HealthEntry<T>[] = [];
    let skipped = 0;
    for (const row of rows) {
      this.guard(ticket, signal);
      // Security (2026-10-30): the Health client refuses v1 rows.
      if (row.schema_version !== HEALTH_SCHEMA_VERSION) {
        skipped += 1;
        continue;
      }
      try {
        const value = await vault.decryptPayload<T>(
          row.ciphertext_b64,
          collection,
          row.client_id,
          row.schema_version,
          row.key_version,
        );
        this.guard(ticket, signal);
        if (!parsable(value, kinds)) {
          skipped += 1;
          continue;
        }
        entries.push({
          clientId: row.client_id,
          revision: row.revision,
          keyVersion: row.key_version,
          value,
        });
      } catch (error) {
        if (signal.aborted || !this.eligible(ticket)) throw error;
        skipped += 1;
      }
    }
    return { entries, skipped };
  }

  private async upsert<T>(
    ticket: Publication,
    collection: Collection,
    entry: { clientId: string; revision: number | null; keyVersion: number },
    value: T,
  ): Promise<HealthEntry<T>> {
    const work = openBoundedWork({ parents: [this.stop.signal] });
    const signal = work.signal;
    try {
      this.guard(ticket, signal);
      const vault = await this.vault();
      const ciphertext = await vault.encryptPayload(
        value,
        collection,
        entry.clientId,
        HEALTH_SCHEMA_VERSION,
        entry.keyVersion,
      );
      this.guard(ticket, signal);
      try {
        const saved = await this.observe(
          vault.upsertRecords(
            [
              {
                collection,
                client_id: entry.clientId,
                ciphertext_b64: ciphertext,
                schema_version: HEALTH_SCHEMA_VERSION,
                key_version: entry.keyVersion,
                expected_revision: entry.revision,
              },
            ],
            { silent: true },
          ),
          signal,
        );
        this.guard(ticket, signal);
        const row = saved[0];
        return {
          clientId: entry.clientId,
          revision: row?.revision ?? (entry.revision ?? 0) + 1,
          keyVersion: entry.keyVersion,
          value,
        };
      } catch (error) {
        if (isConflict(error) && this.eligible(ticket)) {
          await this.refetch(collection, ticket, signal);
          throw new HealthConflictError();
        }
        throw error;
      }
    } finally {
      work.dispose();
    }
  }

  private async refetch(collection: Collection, ticket: Publication, signal: AbortSignal): Promise<void> {
    const vault = await this.vault();
    const rows = await this.observe(vault.listRecords(collection, { silent: true }), signal);
    this.guard(ticket, signal);
    if (collection === HEALTH_STATS_COLLECTION) {
      const { entries, skipped } = await this.decryptAll<HealthStat>(
        vault, collection, rows, STAT_KINDS, signal, ticket,
      );
      this.guard(ticket, signal);
      this.stats = entries;
      this.unreadable = skipped;
    } else {
      const { entries, skipped } = await this.decryptAll<HealthPr>(
        vault, collection, rows, PR_KINDS, signal, ticket,
      );
      this.guard(ticket, signal);
      this.prs = entries;
      this.unreadable = skipped;
    }
  }

  private async remove<T>(
    ticket: Publication,
    collection: Collection,
    entry: HealthEntry<T>,
  ): Promise<void> {
    const work = openBoundedWork({ parents: [this.stop.signal] });
    const signal = work.signal;
    try {
      this.guard(ticket, signal);
      const vault = await this.vault();
      try {
        await this.observe(
          vault.deleteRecords(
            [
              {
                collection,
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
          await this.refetch(collection, ticket, signal);
          throw new HealthConflictError();
        }
        throw error;
      }
      this.guard(ticket, signal);
      if (collection === HEALTH_STATS_COLLECTION) {
        this.stats = this.stats.filter(item => item.clientId !== entry.clientId);
      } else {
        this.prs = this.prs.filter(item => item.clientId !== entry.clientId);
      }
    } finally {
      work.dispose();
    }
  }

  async createStat(value: HealthStat): Promise<HealthEntry<HealthStat>> {
    const ticket = this.publication(false);
    const entry = await this.upsert<HealthStat>(
      ticket,
      HEALTH_STATS_COLLECTION,
      { clientId: newHealthClientId(), revision: null, keyVersion: 1 },
      value,
    );
    this.guard(ticket);
    this.stats = [...this.stats, entry];
    return entry;
  }

  async updateStat(
    entry: HealthEntry<HealthStat>,
    changes: Partial<HealthStat>,
  ): Promise<HealthEntry<HealthStat>> {
    // Edits never move the day the entry was logged (§18.8).
    const value: HealthStat = { ...entry.value, ...changes, logged_on: entry.value.logged_on };
    const ticket = this.publication(false);
    const saved = await this.upsert<HealthStat>(ticket, HEALTH_STATS_COLLECTION, entry, value);
    this.guard(ticket);
    this.stats = this.stats.map(item => (item.clientId === entry.clientId ? saved : item));
    return saved;
  }

  async deleteStat(entry: HealthEntry<HealthStat>): Promise<void> {
    await this.remove(this.publication(false), HEALTH_STATS_COLLECTION, entry);
  }

  async createPr(value: HealthPr): Promise<HealthEntry<HealthPr>> {
    const ticket = this.publication(false);
    const entry = await this.upsert<HealthPr>(
      ticket,
      HEALTH_PRS_COLLECTION,
      { clientId: newHealthClientId(), revision: null, keyVersion: 1 },
      value,
    );
    this.guard(ticket);
    this.prs = [...this.prs, entry];
    return entry;
  }

  async updatePr(
    entry: HealthEntry<HealthPr>,
    changes: Partial<HealthPr>,
  ): Promise<HealthEntry<HealthPr>> {
    const value: HealthPr = { ...entry.value, ...changes, logged_on: entry.value.logged_on };
    const ticket = this.publication(false);
    const saved = await this.upsert<HealthPr>(ticket, HEALTH_PRS_COLLECTION, entry, value);
    this.guard(ticket);
    this.prs = this.prs.map(item => (item.clientId === entry.clientId ? saved : item));
    return saved;
  }

  async deletePr(entry: HealthEntry<HealthPr>): Promise<void> {
    await this.remove(this.publication(false), HEALTH_PRS_COLLECTION, entry);
  }
}
