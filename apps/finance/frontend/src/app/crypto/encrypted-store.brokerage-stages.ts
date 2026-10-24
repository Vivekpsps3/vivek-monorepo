import type { FidelityCommitResult, Holding } from '../models/transaction.model';
import type { BrokerageAccountRecord, FidelityStageRecord, FidelityStageRow } from '../utils/fidelity-import.util';
import type { CollectionName } from './encrypted-store.persistence';

export interface EncryptedBrokerageStagePort {
  ensureLoaded(): Promise<void>;
  readPersistedRows<T>(collection: CollectionName, generation?: number): Promise<T[]>;
  getImportRows<T>(): T[];
  getStoredHoldings(): Holding[];
  allocateId(): number;
  upsertImportRecord<T extends { id?: number }>(payload: T, clientId?: string, generation?: number): Promise<T>;
  savePreparedHoldings(rows: Holding[]): Promise<Holding[]>;
  savePreparedImportRows(rows: Array<{ id: number }>): Promise<Array<{ id: number }>>;
  getBrokerageAccounts(): Promise<BrokerageAccountRecord[]>;
  upsertBrokerageAccount(body: Omit<BrokerageAccountRecord, 'id'> & { id?: number }): Promise<BrokerageAccountRecord>;
  getHoldings(): Promise<Holding[]>;
  updateHolding(id: number, body: any, expectedGeneration?: number): Promise<Holding>;
  removeHolding(id: number): Promise<void>;
  sessionToken(): number;
  assertSession(generation: number): void;
  runRecordUpdate<T>(collection: 'import_batches', id: number, generation: number, update: () => Promise<T>): Promise<T>;
}

/** Owns Fidelity replacement staging, verification, activation, and cleanup. */
export class EncryptedBrokerageStageStore {
  constructor(private port: EncryptedBrokerageStagePort) {}

  async createHoldingImportStage(
    body: Omit<FidelityStageRecord, 'id' | 'selected_rows'>,
    rows: FidelityStageRow[]
  ): Promise<FidelityStageRecord> {
    await this.port.ensureLoaded();
    const generation = this.port.sessionToken();
    // Millisecond timestamps can collide for consecutive imports, and record IDs
    // are intentionally random. Keep stage chronology explicit by advancing the
    // creation time beyond every persisted Fidelity stage.
    const existingBatches = await this.port.readPersistedRows<any>('import_batches', generation);
    const latestStageTime = existingBatches
      .filter(row => row.record_type === 'holding_stage')
      .reduce((latest, row) => {
        const timestamp = Date.parse(String(row.created_at || ''));
        return Number.isFinite(timestamp) ? Math.max(latest, timestamp) : latest;
      }, 0);
    const createdAt = new Date(Math.max(Date.now(), latestStageTime + 1)).toISOString();
    const id = this.port.allocateId();
    const stage = { ...body, id, created_at: createdAt, status: 'staged', expected_row_count: rows.length, record_type: 'holding_stage' } as FidelityStageRecord & { record_type: string };
    await this.port.upsertImportRecord( stage as any, undefined, generation);
    const chunks: Array<{ id: number; record_type: 'holding_stage_rows'; stage_id: number; chunk_index: number; rows: FidelityStageRow[] }> = [];
    let current: FidelityStageRow[] = [];
    let bytes = 0;
    const flush = () => {
      if (!current.length) return;
      chunks.push({ id: this.port.allocateId(), record_type: 'holding_stage_rows', stage_id: id, chunk_index: chunks.length, rows: current });
      current = [];
      bytes = 0;
    };
    for (const row of rows) {
      const rowBytes = new TextEncoder().encode(JSON.stringify(row)).length;
      if (current.length && (current.length >= 100 || bytes + rowBytes > 160_000)) flush();
      current.push(row);
      bytes += rowBytes;
    }
    flush();
    try {
      await this.port.savePreparedImportRows(chunks);
      const persisted = await this.getHoldingImportStageRows(id);
      if (persisted.length !== rows.length) throw new Error('Holding stage checkpoint is incomplete');
      return (await this.getHoldingImportStages()).find(row => row.id === id)!;
    } catch (error) {
      if (error && typeof error === 'object') (error as any).stage_id = id;
      await this.port.runRecordUpdate('import_batches', id, generation, () =>
        this.port.upsertImportRecord({ ...stage, status: 'interrupted', error: String((error as any)?.message || error) } as any, undefined, generation).catch(() => undefined));
      throw error;
    }
  }

  async getHoldingImportStages(): Promise<FidelityStageRecord[]> {
    await this.port.ensureLoaded();
    return this.port.getImportRows<any>()
      .filter(row => row.record_type === 'holding_stage')
      .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')) || Number(b.id) - Number(a.id));
  }

  async getHoldingImportStageRows(stageId: number): Promise<FidelityStageRow[]> {
    await this.port.ensureLoaded();
    return this.port.getImportRows<any>()
      .filter(row => row.record_type === 'holding_stage_rows' && Number(row.stage_id) === stageId)
      .sort((a, b) => Number(a.chunk_index) - Number(b.chunk_index))
      .flatMap(row => row.rows || []);
  }

  async nextHoldingStageActivationTime(generation: number): Promise<string> {
    const batches = await this.port.readPersistedRows<any>('import_batches', generation);
    const latestActivationTime = batches
      .filter(row => row.record_type === 'holding_stage' && row.status === 'activated')
      .reduce((latest, row) => {
        const timestamp = Date.parse(String(row.activated_at || row.created_at || ''));
        return Number.isFinite(timestamp) ? Math.max(latest, timestamp) : latest;
      }, 0);
    return new Date(Math.max(Date.now(), latestActivationTime + 1)).toISOString();
  }

  async getLatestActivatedHoldingStages(): Promise<{
    byAccountId: Map<number, FidelityStageRecord>;
    byAccountMask: Map<string, FidelityStageRecord>;
  }> {
    const stages = (await this.getHoldingImportStages())
      .filter(stage => stage.status === 'activated')
      .sort((a, b) => {
        const byActivationTime = String(a.activated_at || a.created_at || '')
          .localeCompare(String(b.activated_at || b.created_at || ''));
        const byCreationTime = String(a.created_at || '').localeCompare(String(b.created_at || ''));
        // ID is only a stable fallback for legacy records with indistinguishable
        // timestamps. Newly-created stages receive strictly increasing created_at.
        return byActivationTime || byCreationTime || Number(a.id) - Number(b.id);
      });
    const byAccountId = new Map<number, FidelityStageRecord>();
    const byAccountMask = new Map<string, FidelityStageRecord>();
    for (const stage of stages) {
      for (const row of await this.getHoldingImportStageRows(stage.id)) {
        byAccountId.set(Number(row.brokerage_account_id), stage);
      }
      for (const mask of stage.account_masks || []) {
        byAccountMask.set(String(mask).trim().toLocaleLowerCase(), stage);
      }
    }
    return { byAccountId, byAccountMask };
  }

  async verifyHoldingImportStage(stageId: number): Promise<FidelityStageRecord> {
    const generation = this.port.sessionToken();
    const persisted = await this.port.readPersistedRows<any>('import_batches', generation);
    const stage = persisted.find(row => row.record_type === 'holding_stage' && Number(row.id) === stageId) as FidelityStageRecord | undefined;
    if (!stage) throw new Error('Holding replacement stage not found');
    // An activated header is the durable commit point. Never downgrade it during cleanup retry.
    if (stage.status === 'activated') return stage;
    const persistedRows = persisted
      .filter(row => row.record_type === 'holding_stage_rows' && Number(row.stage_id) === stageId)
      .sort((a, b) => Number(a.chunk_index) - Number(b.chunk_index))
      .flatMap(row => row.rows || []) as FidelityStageRow[];
    if (persistedRows.length !== stage.expected_row_count) throw new Error('Holding stage is incomplete; active holdings were not changed');
    if (persistedRows.some(row => !row.symbol || !(row.shares > 0))) {
      throw new Error('Holding stage verification failed; active holdings were not changed');
    }
    if (generation !== this.port.sessionToken()) throw new Error('Vault session changed');
    return this.port.runRecordUpdate('import_batches', stageId, generation, () =>
      this.port.upsertImportRecord({ ...stage, status: 'verified', verified_at: new Date().toISOString(), record_type: 'holding_stage' } as any) as Promise<FidelityStageRecord>);
  }

  async activateHoldingImportStage(stageId: number): Promise<FidelityCommitResult> {
    const generation = this.port.sessionToken();
    const stage = await this.verifyHoldingImportStage(stageId);
    const persistedBatches = await this.port.readPersistedRows<any>('import_batches', generation);
    const rows = persistedBatches
      .filter(row => row.record_type === 'holding_stage_rows' && Number(row.stage_id) === stageId)
      .sort((a, b) => Number(a.chunk_index) - Number(b.chunk_index))
      .flatMap(row => row.rows || []) as FidelityStageRow[];
    const accounts = await this.port.getBrokerageAccounts();
    if (generation !== this.port.sessionToken()) throw new Error('Vault session changed');
    const targetAccountIds = new Set(rows.map(row => row.brokerage_account_id));
    const isTargetAccount = (row: Holding): boolean => {
      if (row.brokerage_account_id != null) {
        if (targetAccountIds.has(row.brokerage_account_id)) return true;
        const linked = accounts.find(account => Number(account.id) === Number(row.brokerage_account_id));
        if (linked) return false;
      }
      const label = String(row.account_display || '').trim().toLocaleLowerCase();
      if (!label.startsWith('fidelity')) return false;
      const suffix = label.split('···').at(-1)?.trim().split(/[\s(]/, 1)[0] || '';
      return stage.account_masks.some(mask => suffix === String(mask).trim().toLocaleLowerCase());
    };
    let activeStage = stage;
    if (stage.status !== 'activated') {
      const previousStageRows = this.port.getStoredHoldings().filter(row => row.portfolio_stage_id === stageId);
      const replacements = rows.map((row, index) => ({
        ...row,
        id: previousStageRows.find(existing => existing.portfolio_row_index === index
          && existing.symbol === row.symbol && existing.brokerage_account_id === row.brokerage_account_id)?.id ?? this.port.allocateId(),
        lifecycle_status: 'staged' as const,
        portfolio_stage_id: stageId,
        portfolio_row_index: index,
        cost_basis_status: row.cost_basis_status || (row.purchase_price == null ? 'unknown' : 'known'),
      }));
      await this.port.savePreparedHoldings(replacements);
      if (generation !== this.port.sessionToken()) throw new Error('Vault session changed');
      const persistedHoldings = await this.port.readPersistedRows<Holding>('holdings', generation);
      const verifiedReplacements = persistedHoldings.filter(row => row.portfolio_stage_id === stageId);
      if (verifiedReplacements.length !== stage.expected_row_count || rows.some((row, index) => {
        const actual = verifiedReplacements.find(candidate => Number(candidate.portfolio_row_index) === index);
        return !actual || actual.symbol !== row.symbol || Number(actual.shares) !== Number(row.shares);
      })) {
        throw new Error('Persisted replacement positions could not be verified; the previous holdings remain active');
      }
      activeStage = await this.port.runRecordUpdate('import_batches', stageId, generation, async () => {
        const activatedAt = await this.nextHoldingStageActivationTime(generation);
        return this.port.upsertImportRecord({
          ...stage,
          status: 'activated',
          activated_at: activatedAt,
          cleanup_complete: false,
          record_type: 'holding_stage',
        } as any, undefined, generation) as Promise<FidelityStageRecord>;
      });
    }
    // Once activated, stage holdings may have been edited and new manual holdings may
    // have joined this stage. Resume only removes superseded rows; it never reapplies
    // the original import snapshot over the active holdings.
    const latestStages = await this.getLatestActivatedHoldingStages();
    const obsolete = (await this.port.readPersistedRows<Holding>('holdings', generation))
      .filter(row => {
        if (row.portfolio_stage_id === stageId || row.lifecycle_status === 'inactive' || !isTargetAccount(row)) return false;
        const label = String(row.account_display || '').trim().toLocaleLowerCase();
        const suffix = label.startsWith('fidelity')
          ? label.split('···').at(-1)?.trim().split(/[\s(]/, 1)[0] || ''
          : '';
        const latestStage = row.brokerage_account_id == null
          ? latestStages.byAccountMask.get(suffix)
          : latestStages.byAccountId.get(Number(row.brokerage_account_id));
        return latestStage?.id === stageId;
      });
    for (const row of obsolete) {
      if (generation !== this.port.sessionToken()) throw new Error('Vault session changed');
      await this.port.removeHolding(row.id);
    }
    await this.port.runRecordUpdate('import_batches', stageId, generation, () =>
      this.port.upsertImportRecord({ ...activeStage, status: 'activated', cleanup_complete: true, record_type: 'holding_stage' } as any, undefined, generation));
    return {
      accounts_replaced: stage.account_masks.length,
      holdings_replaced: obsolete.length,
      inserted: stage.expected_row_count,
      accounts: stage.account_masks.map(mask => accounts.find(account => account.account_mask === mask)?.label || mask),
      stage_id: stageId,
      status: 'activated',
    };
  }

  async setBrokerageAccountNickname(accountId: number, nickname: string | null) {
    const generation = this.port.sessionToken();
    const accounts = await this.port.getBrokerageAccounts();
    this.port.assertSession(generation);
    const current = accounts.find(a => a.id === accountId);
    if (!current) throw new Error('Brokerage account not found');
    const nextNickname = nickname?.trim() || null;
    const label =
      nextNickname ||
      current.label ||
      `${current.broker_name || 'Fidelity'} ···${current.account_mask}`;
    const updated = await this.port.upsertBrokerageAccount({
      ...current,
      nickname: nextNickname,
      label,
    });
    const holdings = await this.port.getHoldings();
    this.port.assertSession(generation);
    for (const holding of holdings.filter(h => h.brokerage_account_id === accountId)) {
      this.port.assertSession(generation);
      await this.port.updateHolding(holding.id, { account_display: label }, generation);
    }
    return updated;
  }


}
