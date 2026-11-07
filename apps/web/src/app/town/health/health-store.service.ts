import { Injectable, Injector, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import {
  financeVaultPresent,
  openFinanceVault,
} from '../../../../../finance/frontend/src/public-api';
import type { HealthPr, HealthStat } from './health.types';

/**
 * Town Health vault store (THC2). Reads and writes only the health_stats
 * and health_prs collections of the Finance vault, through the Finance
 * public API. Decrypted records live in memory only; nothing is cached to
 * storage. Envelope schema_version is always 2 on write, and rows that are
 * not version 2 are refused on read (Security, 2026-10-30): skipped and
 * counted like undecryptable rows, never deleted.
 */

export const HEALTH_STATS_COLLECTION = 'health_stats';
export const HEALTH_PRS_COLLECTION = 'health_prs';
export const HEALTH_SCHEMA_VERSION = 2;
export const HEALTH_LOAD_DEADLINE_MS = 8_000;
export const HEALTH_CONFLICT_MESSAGE =
  'This entry changed in another tab. Reload and try again.';

export type HealthVault = Awaited<ReturnType<typeof openFinanceVault>>;

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

@Injectable({ providedIn: 'root' })
export class HealthStoreService {
  private readonly injector = inject(Injector);
  private stats: HealthEntry<HealthStat>[] = [];
  private prs: HealthEntry<HealthPr>[] = [];
  private unreadable = 0;

  /** Vault access seam (the Finance public API); tests replace it. */
  protected vault(): Promise<HealthVault> {
    return openFinanceVault(this.injector);
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

  /** Every action checks presence first; a locked vault clears memory. */
  private requirePresent(): void {
    if (!financeVaultPresent()) {
      this.clearMemory();
      throw new HealthLockedError();
    }
  }

  async load(opts?: { deadlineMs?: number; signal?: AbortSignal }): Promise<HealthLoadResult> {
    if (!financeVaultPresent()) {
      this.clearMemory();
      return { state: 'locked' };
    }
    const deadlineMs = opts?.deadlineMs ?? HEALTH_LOAD_DEADLINE_MS;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<'deadline'>(resolve => {
      timer = setTimeout(() => resolve('deadline'), deadlineMs);
    });
    try {
      const outcome = await Promise.race([
        this.loadAll(opts?.signal).then(
          () => 'done' as const,
          () => 'failed' as const,
        ),
        deadline,
      ]);
      if (outcome !== 'done') return { state: 'unavailable' };
      return {
        state: 'ready',
        stats: [...this.stats],
        prs: [...this.prs],
        unreadable: this.unreadable,
      };
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }

  private async loadAll(signal?: AbortSignal): Promise<void> {
    const vault = await this.vault();
    if (signal?.aborted) throw new Error('Aborted');
    const [statRows, prRows] = await Promise.all([
      firstValueFrom(vault.listRecords(HEALTH_STATS_COLLECTION, { silent: true })),
      firstValueFrom(vault.listRecords(HEALTH_PRS_COLLECTION, { silent: true })),
    ]);
    if (signal?.aborted) throw new Error('Aborted');
    const [stats, prs] = await Promise.all([
      this.decryptAll<HealthStat>(vault, HEALTH_STATS_COLLECTION, statRows, STAT_KINDS),
      this.decryptAll<HealthPr>(vault, HEALTH_PRS_COLLECTION, prRows, PR_KINDS),
    ]);
    this.stats = stats.entries;
    this.prs = prs.entries;
    this.unreadable = stats.skipped + prs.skipped;
  }

  private async decryptAll<T>(
    vault: HealthVault,
    collection: Collection,
    rows: readonly {
      client_id: string;
      ciphertext_b64: string;
      schema_version: number;
      key_version: number;
      revision: number;
    }[],
    kinds: ReadonlySet<string>,
  ): Promise<{ entries: HealthEntry<T>[]; skipped: number }> {
    const entries: HealthEntry<T>[] = [];
    let skipped = 0;
    for (const row of rows) {
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
      } catch {
        skipped += 1;
      }
    }
    return { entries, skipped };
  }

  private async upsert<T>(
    collection: Collection,
    entry: { clientId: string; revision: number | null; keyVersion: number },
    value: T,
  ): Promise<HealthEntry<T>> {
    this.requirePresent();
    const vault = await this.vault();
    const ciphertext = await vault.encryptPayload(
      value,
      collection,
      entry.clientId,
      HEALTH_SCHEMA_VERSION,
      entry.keyVersion,
    );
    try {
      const saved = await firstValueFrom(
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
      );
      const row = saved[0];
      return {
        clientId: entry.clientId,
        revision: row?.revision ?? (entry.revision ?? 0) + 1,
        keyVersion: entry.keyVersion,
        value,
      };
    } catch (error) {
      if (isConflict(error)) {
        await this.refetch(collection);
        throw new HealthConflictError();
      }
      throw error;
    }
  }

  private async refetch(collection: Collection): Promise<void> {
    const vault = await this.vault();
    const rows = await firstValueFrom(vault.listRecords(collection, { silent: true }));
    if (collection === HEALTH_STATS_COLLECTION) {
      const { entries, skipped } = await this.decryptAll<HealthStat>(
        vault, collection, rows, STAT_KINDS,
      );
      this.stats = entries;
      this.unreadable = skipped;
    } else {
      const { entries, skipped } = await this.decryptAll<HealthPr>(
        vault, collection, rows, PR_KINDS,
      );
      this.prs = entries;
      this.unreadable = skipped;
    }
  }

  private async remove<T>(
    collection: Collection,
    entry: HealthEntry<T>,
  ): Promise<void> {
    this.requirePresent();
    const vault = await this.vault();
    try {
      await firstValueFrom(
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
      );
    } catch (error) {
      if (isConflict(error)) {
        await this.refetch(collection);
        throw new HealthConflictError();
      }
      throw error;
    }
    if (collection === HEALTH_STATS_COLLECTION) {
      this.stats = this.stats.filter(item => item.clientId !== entry.clientId);
    } else {
      this.prs = this.prs.filter(item => item.clientId !== entry.clientId);
    }
  }

  async createStat(value: HealthStat): Promise<HealthEntry<HealthStat>> {
    const entry = await this.upsert<HealthStat>(
      HEALTH_STATS_COLLECTION,
      { clientId: newHealthClientId(), revision: null, keyVersion: 1 },
      value,
    );
    this.stats = [...this.stats, entry];
    return entry;
  }

  async updateStat(
    entry: HealthEntry<HealthStat>,
    changes: Partial<HealthStat>,
  ): Promise<HealthEntry<HealthStat>> {
    // Edits never move the day the entry was logged (§18.8).
    const value: HealthStat = { ...entry.value, ...changes, logged_on: entry.value.logged_on };
    const saved = await this.upsert<HealthStat>(HEALTH_STATS_COLLECTION, entry, value);
    this.stats = this.stats.map(item => (item.clientId === entry.clientId ? saved : item));
    return saved;
  }

  async deleteStat(entry: HealthEntry<HealthStat>): Promise<void> {
    await this.remove(HEALTH_STATS_COLLECTION, entry);
  }

  async createPr(value: HealthPr): Promise<HealthEntry<HealthPr>> {
    const entry = await this.upsert<HealthPr>(
      HEALTH_PRS_COLLECTION,
      { clientId: newHealthClientId(), revision: null, keyVersion: 1 },
      value,
    );
    this.prs = [...this.prs, entry];
    return entry;
  }

  async updatePr(
    entry: HealthEntry<HealthPr>,
    changes: Partial<HealthPr>,
  ): Promise<HealthEntry<HealthPr>> {
    const value: HealthPr = { ...entry.value, ...changes, logged_on: entry.value.logged_on };
    const saved = await this.upsert<HealthPr>(HEALTH_PRS_COLLECTION, entry, value);
    this.prs = this.prs.map(item => (item.clientId === entry.clientId ? saved : item));
    return saved;
  }

  async deletePr(entry: HealthEntry<HealthPr>): Promise<void> {
    await this.remove(HEALTH_PRS_COLLECTION, entry);
  }
}
