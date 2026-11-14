import type { Injector } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom, fromEvent, takeUntil, map, type Observable } from 'rxjs';
import { openBoundedWork, type BoundedWork } from '@vivek/browser';
import { silentErrorToast } from '@vivek/ui';
import { apiUrl } from '../core/api-url';
import { decodeRecoveryBundle, RECOVERY_LIMITS, RecoveryError, type RecoveryBundle, type RecoveryRecord } from './recovery-bundle';
import type { RecoverySnapshot } from './recovery-export';
import { openRecoveryScope } from './recovery-scope';
import { recordIndexes } from './record-indexes';
import { lockFinance } from './lock-finance';

export type RestoreMode = 'merge' | 'replace';
export interface RestoreResult { restored: number; removed: number; mode: RestoreMode }
export interface RestoreStage {
  id: string; source_hash: string; base_fingerprint: string; mode: RestoreMode;
  key_version: number; status: 'pending' | 'committed'; expected_counts: Record<string, number>;
  batch_count: number; received_batches: number[]; result: Partial<RestoreResult>;
}
export interface RestorePreviewRow { collection: string; schemas: string; incoming: number; existing: number; conflicts: number; restore: number; remove: number }
export interface RestoreWireRecord { collection: string; client_id: string; ciphertext_b64: string; schema_version: number; key_version: number; expected_revision: number | null; indexes: Array<{ index_name: string; index_value_b64: string }> }
export interface RestoreCreate { source_hash: string; base_fingerprint: string; mode: RestoreMode; key_version: number; expected_counts: Record<string, number>; batch_count: number }
export interface RestorePort {
  snapshot(): Observable<RecoverySnapshot>;
  keyVersion(): Observable<number>;
  encrypt(row: RecoveryRecord, keyVersion: number): Promise<RestoreWireRecord>;
  stages(): Observable<RestoreStage[]>;
  create(body: RestoreCreate): Observable<RestoreStage>;
  get(id: string): Observable<RestoreStage>;
  put(id: string, index: number, records: RestoreWireRecord[]): Observable<RestoreStage>;
  activate(id: string, confirmation: string): Observable<RestoreResult>;
  discard(id: string): Observable<unknown>;
}
function identity(row: { collection: string; client_id: string }): string { return `${row.collection}/${row.client_id}`; }
function errorStatus(error: unknown): number { return typeof error === 'object' && error && 'status' in error ? Number(error.status) : 0; }
function safeError(error: unknown): RecoveryError {
  if (error instanceof RecoveryError) return error;
  const status = errorStatus(error);
  if (status === 409) return new RecoveryError('Vault or restore stage changed. Active data is safe. Preview the file again, or resume the same unfinished restore.');
  if (status === 404) return new RecoveryError('Restore stage expired or is unavailable. Preview the file again.');
  if (status === 401) return new RecoveryError('Your session expired. Sign in and unlock Finance.');
  if (status === 413 || status === 422 || status === 400) return new RecoveryError('Restore data is unsupported, incomplete or exceeds its limits. Active data was not changed.');
  return new RecoveryError('Restore could not finish. Before activation, active data is unchanged. Retry staging or check the restore status after unlocking.');
}
async function observe<T>(source: Observable<T>, signal: AbortSignal): Promise<T> {
  return firstValueFrom(source.pipe(takeUntil(fromEvent(signal, 'abort'))));
}

/** Plaintext belongs to this one disposable preview, never an application store. */
export class RecoveryRestorePlan {
  readonly rows: RestorePreviewRow[];
  readonly total: number;
  readonly conflicts: number;
  readonly unfinished: RestoreStage[];
  readonly previousCompletion: Partial<RestoreResult> | null;
  staged = false;
  stageId: string | null = null;
  private readonly groups: RecoveryRecord[][] = [];
  private readonly expectedCounts: Record<string, number>;
  private disposed = false;
  private readonly clear = (): void => {
    for (const group of this.groups) group.length = 0;
    this.groups.length = 0;
  };

  constructor(
    private readonly port: RestorePort,
    body: RecoveryBundle,
    readonly mode: RestoreMode,
    private readonly hash: string,
    private readonly fingerprint: string,
    private readonly keyVersion: number,
    snapshot: RecoverySnapshot,
    stages: RestoreStage[],
    private readonly signal: AbortSignal,
    private readonly checkOwner: () => void,
    private readonly close: () => void,
    private readonly activated: () => Promise<void>,
  ) {
    const allowed = new Map(snapshot.collections.map(row => [row.collection, row]));
    for (const descriptor of body.collections) {
      const current = allowed.get(descriptor.collection);
      if (!current || descriptor.schema_versions.some(version => !current.schema_versions.includes(version))) throw new RecoveryError('Backup contains an unsupported collection or schema. Update the app before restoring.');
    }
    const existing = new Set(snapshot.records.map(identity));
    const chosen = body.records.filter(row => mode === 'replace' || !existing.has(identity(row)));
    this.expectedCounts = Object.fromEntries(snapshot.collections.map(row => [row.collection, chosen.filter(record => record.collection === row.collection).length]));
    this.rows = snapshot.collections.map(row => {
      const incoming = body.records.filter(record => record.collection === row.collection);
      const conflicts = incoming.filter(record => existing.has(identity(record))).length;
      const selected = this.expectedCounts[row.collection];
      return { collection: row.collection, schemas: body.collections.find(source => source.collection === row.collection)?.schema_versions.join(', ') ?? '—', incoming: incoming.length, existing: row.count, conflicts, restore: selected, remove: mode === 'replace' ? row.count - conflicts : 0 };
    });
    this.total = chosen.length;
    this.conflicts = this.rows.reduce((sum, row) => sum + row.conflicts, 0);
    this.unfinished = stages.filter(stage => stage.status === 'pending');
    this.previousCompletion = stages.find(stage => stage.status === 'committed' && stage.source_hash === hash)?.result ?? null;
    let group: RecoveryRecord[] = [];
    let bytes = 0;
    for (const row of chosen) {
      const size = new TextEncoder().encode(JSON.stringify(row)).byteLength;
      if (group.length && (group.length >= 100 || bytes + size > 700_000)) { this.groups.push(group); group = []; bytes = 0; }
      group.push(row); bytes += size;
    }
    if (group.length) this.groups.push(group);
    body.records.length = 0; body.collections.length = 0;
    signal.addEventListener('abort', this.clear, { once: true });
  }

  private async run<T>(action: (work: BoundedWork, check: () => void) => Promise<T>): Promise<T> {
    const work = openBoundedWork({ parents: [this.signal], deadlineMs: 120_000 });
    const check = (): void => {
      this.checkOwner();
      if (this.disposed || work.signal.aborted) throw new RecoveryError('Restore cancelled or timed out. Active data remains safe; preview again or resume staging.');
    };
    try {
      const result = await work.run(async () => { check(); const value = await action(work, check); check(); return value; });
      if (result.status === 'ok') return result.value;
      if (result.status === 'failed') throw safeError(result.error);
      throw new RecoveryError('Restore cancelled or timed out. Before activation, active data is unchanged.');
    } finally { work.dispose(); }
  }

  async stage(): Promise<void> {
    await this.run(async (work, check) => {
      const stage = this.stageId ? await observe(this.port.get(this.stageId), work.signal) : await observe(this.port.create({ source_hash: this.hash, base_fingerprint: this.fingerprint, mode: this.mode, key_version: this.keyVersion, expected_counts: this.expectedCounts, batch_count: this.groups.length }), work.signal);
      check(); this.stageId = stage.id;
      if (stage.status === 'committed') { this.staged = true; return; }
      const received = new Set(stage.received_batches);
      for (let index = 0; index < this.groups.length; index++) {
        check();
        if (received.has(index)) continue;
        const records: RestoreWireRecord[] = [];
        try {
          for (const row of this.groups[index]) {
            check(); const encrypted = await this.port.encrypt(row, this.keyVersion); check(); records.push(encrypted);
          }
          await observe(this.port.put(stage.id, index, records), work.signal); check();
        } finally { records.length = 0; }
      }
      const complete = await observe(this.port.get(stage.id), work.signal); check();
      if (complete.status !== 'committed' && complete.received_batches.length !== this.groups.length) throw new RecoveryError('Staging is incomplete. Resume before activation.');
      this.staged = true;
    });
  }

  async activate(confirmation: string): Promise<RestoreResult> {
    if (!this.stageId || !this.staged) throw new RecoveryError('Finish encrypted staging before activation.');
    if (this.mode === 'replace' && confirmation !== 'REPLACE') throw new RecoveryError('Type REPLACE to confirm replacement.');
    const id = this.stageId;
    const result = await this.run((work) => observe(this.port.activate(id, confirmation), work.signal));
    // The accepted server transaction is the activation boundary. A later local
    // abort cannot retract it; a late response never reaches this eligible path.
    this.checkOwner();
    this.dispose();
    await this.activated();
    return result;
  }

  async discard(id: string): Promise<void> {
    await this.run(async (work) => { await observe(this.port.discard(id), work.signal); });
    const index = this.unfinished.findIndex(stage => stage.id === id);
    if (index >= 0) this.unfinished.splice(index, 1);
    if (this.stageId === id) { this.stageId = null; this.staged = false; }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true; this.clear();
    this.signal.removeEventListener('abort', this.clear);
    this.close();
  }
}

export async function prepareRecoveryRestore(
  port: RestorePort, file: string | Blob, password: string, mode: RestoreMode,
  signal: AbortSignal, checkOwner: () => void, close: () => void = () => undefined,
  activated: () => Promise<void> = async () => undefined,
): Promise<RecoveryRestorePlan> {
  const work = openBoundedWork({ parents: [signal], deadlineMs: 120_000 });
  let body: RecoveryBundle | undefined;
  let delivered = false;
  const clear = (): void => { if (body) { body.records.length = 0; body.collections.length = 0; } };
  const check = (): void => { checkOwner(); if (work.signal.aborted) throw new RecoveryError('Restore preview cancelled or timed out.'); };
  signal.addEventListener('abort', clear, { once: true });
  try {
    const result = await work.run(async () => {
      check();
      if (typeof file !== 'string' && file.size > RECOVERY_LIMITS.fileBytes) throw new RecoveryError('Backup exceeds the 24 MiB file limit.');
      let input = typeof file === 'string' ? file : await file.text(); check();
      body = await decodeRecoveryBundle(input, password, check); password = ''; check();
      const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input)));
      input = ''; 
      const sourceHash = Array.from(digest, value => value.toString(16).padStart(2, '0')).join('');
      file = ''; check();
      const snapshot = await observe(port.snapshot(), work.signal); check();
      if (!snapshot.fingerprint || !/^[a-f0-9]{64}$/.test(snapshot.fingerprint)) throw new RecoveryError('Update the app before restoring this backup.');
      const keyVersion = await observe(port.keyVersion(), work.signal); check();
      const stages = await observe(port.stages(), work.signal); check();
      return new RecoveryRestorePlan(port, body, mode, sourceHash, snapshot.fingerprint, keyVersion, snapshot, stages, signal, checkOwner, close, activated);
    });
    if (result.status === 'failed') throw safeError(result.error);
    if (result.status !== 'ok') throw new RecoveryError('Restore preview cancelled or timed out.');
    delivered = true;
    return result.value;
  } finally {
    password = ''; file = '';
    signal.removeEventListener('abort', clear); work.dispose();
    if (!delivered) { clear(); close(); }
  }
}

export async function openFinanceRestore(injector: Injector, file: string | Blob, password: string, mode: RestoreMode, signal: AbortSignal): Promise<RecoveryRestorePlan> {
  const scope = openRecoveryScope(injector, signal);
  const http = injector.get(HttpClient);
  const options = { context: silentErrorToast() };
  const path = (id = '') => apiUrl(`/vault/restore/stages${id ? `/${encodeURIComponent(id)}` : ''}`);
  return prepareRecoveryRestore({
    snapshot: () => scope.vault.recoverySnapshot(),
    keyVersion: () => scope.vault.recoveryStatus().pipe(map(status => {
      if (!status.exists || !Number.isSafeInteger(status.key_version) || (status.key_version ?? 0) < 1) throw new RecoveryError('Unlock the current destination vault before restoring.');
      return status.key_version!;
    })),
    encrypt: async (row, keyVersion) => {
      scope.check();
      const ciphertext = await scope.records.encryptPayload(row.value, row.collection, row.client_id, 2, keyVersion); scope.check();
      const indexes = await recordIndexes(scope.vault, row.collection, row.value); scope.check();
      return { collection: row.collection, client_id: row.client_id, schema_version: 2, key_version: keyVersion, ciphertext_b64: ciphertext, expected_revision: null, indexes };
    },
    stages: () => http.get<RestoreStage[]>(path(), options),
    create: body => http.post<RestoreStage>(path(), body, options),
    get: id => http.get<RestoreStage>(path(id), options),
    put: (id, index, records) => http.put<RestoreStage>(`${path(id)}/batches/${index}`, { records }, options),
    activate: (id, confirmation) => http.post<RestoreResult>(`${path(id)}/activate`, { confirmation }, options),
    discard: id => http.delete(path(id), options),
  }, file, password, mode, scope.signal, scope.check, scope.dispose, () => lockFinance(injector));
}
