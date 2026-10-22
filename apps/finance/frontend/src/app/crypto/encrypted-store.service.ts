import { Injectable } from '@angular/core';
import {
  Asset,
  BankAccountRecord,
  FixedExpense,
  Holding,
  JobIncome,
  Liability,
  ImportReceipt,
  ImportReceiptRows,
  Subscription,
  Transaction,
} from '../models/transaction.model';
import { StockLabScenario } from '../models/stock-lab.model';
import type { BrokerageAccountRecord, FidelityStageRecord, FidelityStageRow } from '../utils/fidelity-import.util';
import type { FidelityCommitResult } from '../models/transaction.model';
import {
  computeCashflowSummary,
  computeNetWorth,
  enrichFixedExpense,
  enrichHolding,
  enrichJobIncome,
  enrichSubscription,
} from './client-finance';
import { randomClientId } from './vault-crypto';
import { EncryptedBankImportStore } from './encrypted-store.bank-imports';
import { EncryptedBrokerageStageStore } from './encrypted-store.brokerage-stages';
import { EncryptedRecordPersistence } from './encrypted-store.persistence';
import type { CollectionName, EncryptedCollection } from './encrypted-store.persistence';
export type { EncryptedCollection, EncryptedStoreChange } from './encrypted-store.persistence';
export { RecordRevisionConflictError } from './encrypted-store.persistence';
import { VaultService } from './vault.service';

@Injectable({ providedIn: 'root' })
export class EncryptedStoreService {
  private generation = 0;
  private persistence: EncryptedRecordPersistence;
  private bankImports: EncryptedBankImportStore;
  private brokerageStages: EncryptedBrokerageStageStore;

  constructor(vault: VaultService) {
    this.persistence = new EncryptedRecordPersistence(vault, () => this.generation);
    this.bankImports = new EncryptedBankImportStore({
      ensureLoaded: () => this.ensureLoaded(),
      getImportRows: <T>() => this.list<T>('import_batches'),
      allocateId: () => this.allocateId(),
      upsertImportRecord: <T extends { id?: number }>(payload: T, clientId?: string, generation?: number) =>
        this.upsert('import_batches', payload, clientId, generation),
      savePreparedRecords: <T extends { id: number }>(rows: T[], replaceExisting?: boolean) =>
        this.savePreparedRecords('import_batches', rows, replaceExisting),
      getTransactions: () => this.getTransactions(),
      deleteTransactions: ids => this.deleteTransactions(ids),
      sessionToken: () => this.generation,
      assertSession: generation => this.assertSession(generation),
    });
    this.brokerageStages = new EncryptedBrokerageStageStore({
      ensureLoaded: () => this.ensureLoaded(),
      readPersistedRows: <T>(collection: CollectionName, generation?: number) => this.readPersistedRows<T>(collection, generation),
      getImportRows: <T>() => this.list<T>('import_batches'),
      getStoredHoldings: () => this.list<Holding>('holdings'),
      allocateId: () => this.allocateId(),
      upsertImportRecord: <T extends { id?: number }>(payload: T, clientId?: string, generation?: number) =>
        this.upsert('import_batches', payload, clientId, generation),
      savePreparedHoldings: rows => this.savePreparedRecords('holdings', rows),
      savePreparedImportRows: rows => this.savePreparedRecords('import_batches', rows),
      getBrokerageAccounts: () => this.getBrokerageAccounts(),
      upsertBrokerageAccount: body => this.upsertBrokerageAccount(body),
      getHoldings: () => this.getHoldings(),
      updateHolding: (id, row, generation) => this.updateHolding(id, row, generation),
      removeHolding: id => this.remove('holdings', id),
      sessionToken: () => this.generation,
      assertSession: generation => this.assertSession(generation),
    });
  }

  get changes$() { return this.persistence.changes$; }
  clear(): void { this.generation += 1; this.persistence.clear(); }
  get sessionToken(): number { return this.generation; }
  private assertSession(expectedGeneration: number): void { this.persistence.assertSession(expectedGeneration); }
  private runRecordUpdate<T>(collection: CollectionName, id: number, expectedGeneration: number, update: () => Promise<T>): Promise<T> {
    return this.persistence.runRecordUpdate(collection, id, expectedGeneration, update);
  }
  private withRecordUpdates<T>(collection: CollectionName, ids: number[], expectedGeneration: number, update: () => Promise<T>): Promise<T> {
    return this.persistence.withRecordUpdates(collection, ids, expectedGeneration, update);
  }
  private ensureLoaded(): Promise<void> { return this.persistence.ensureLoaded(); }
  private allocateId(): number { return this.persistence.allocateId(); }
  private list<T>(collection: CollectionName): T[] { return this.persistence.list<T>(collection); }
  private readPersistedRows<T>(collection: CollectionName, generation = this.generation): Promise<T[]> {
    return this.persistence.readPersistedRows<T>(collection, generation);
  }
  private upsert<T extends { id?: number }>(collection: CollectionName, payload: T, clientId?: string, expectedGeneration?: number): Promise<T> {
    return this.persistence.upsert(collection, payload, clientId, expectedGeneration);
  }
  private savePreparedRecords<T extends { id: number }>(collection: CollectionName, records: T[], replaceExisting = false): Promise<T[]> {
    return this.persistence.savePreparedRecords(collection, records, replaceExisting);
  }
  private remove(collection: CollectionName, id: number): Promise<void> { return this.persistence.remove(collection, id); }
  reloadCollections(collections: EncryptedCollection[]): Promise<void> { return this.persistence.reloadCollections(collections); }

  async getTransactions(): Promise<Transaction[]> {
    await this.ensureLoaded();
    return this.list<Transaction>('transactions').sort((a, b) => b.date.localeCompare(a.date));
  }

  async addTransaction(tx: Omit<Transaction, 'id'> & { dedupe_key?: string }): Promise<Transaction> {
    return this.upsert('transactions', { ...tx, source: tx.source || 'manual' } as Transaction);
  }

  async updateTransaction(id: number, tx: Partial<Transaction>): Promise<Transaction> {
    const generation = this.generation;
    await this.ensureLoaded();
    this.assertSession(generation);
    const current = this.list<Transaction>('transactions').find(t => t.id === id);
    if (!current) throw new Error('Transaction not found');
    const contentFields: Array<keyof Transaction> = [
      'date', 'type', 'category', 'amount', 'description', 'merchant', 'kind', 'account_display',
      'bank_account_key', 'source_bank', 'source_account_mask', 'reviewed', 'review_reason',
    ];
    const edited = current.source === 'import' && contentFields.some(
      key => tx[key] !== undefined && tx[key] !== current[key]
    );
    return this.upsert('transactions', {
      ...current,
      ...tx,
      ...(edited ? { import_edited: true } : {}),
      id,
    }, undefined, generation);
  }

  async deleteTransaction(id: number): Promise<void> {
    return this.remove('transactions', id);
  }

  async deleteTransactions(ids: number[]): Promise<void> {
    await this.persistence.deleteMany('transactions', ids);
  }

  async getBankAccounts(): Promise<BankAccountRecord[]> {
    await this.ensureLoaded();
    return this.list<BankAccountRecord>('bank_accounts');
  }

  async upsertBankAccount(body: Omit<BankAccountRecord, 'id'> & { id?: number }): Promise<BankAccountRecord> {
    const generation = this.generation;
    const accounts = await this.getBankAccounts();
    const suppliedKey = String(body.account_key || '').trim();
    const current = body.id != null
      ? accounts.find(row => Number(row.id) === Number(body.id))
      : suppliedKey
        ? accounts.find(row => row.bank_slug === body.bank_slug && row.account_key === suppliedKey)
        : undefined;
    if (body.id != null && !current) throw new Error('Bank account mapping not found');
    if (current && current.bank_slug !== body.bank_slug) throw new Error('Bank account identity does not match this mapping');
    if (current?.account_key && suppliedKey && current.account_key !== suppliedKey) {
      throw new Error('Bank account identity does not match this mapping');
    }
    if (generation !== this.generation) throw new Error('Vault session changed');
    const saved = await this.upsert('bank_accounts', {
      ...current,
      ...body,
      account_key: current?.account_key || body.account_key || randomClientId('bank-account'),
      id: body.id ?? current?.id,
    }, undefined, generation);
    return { ...saved, id: Number(saved.id) };
  }

  getImportReceipts(): Promise<ImportReceipt[]> { return this.bankImports.getImportReceipts(); }
  getImportReceipt(id: number): Promise<ImportReceipt | null> { return this.bankImports.getImportReceipt(id); }
  addImportReceipt(body: Omit<ImportReceipt, 'id'>): Promise<ImportReceipt> { return this.bankImports.addImportReceipt(body); }
  addImportReceiptWithRows(body: Omit<ImportReceipt, 'id'>, rows: ImportReceiptRows['rows']): Promise<ImportReceipt> {
    return this.bankImports.addImportReceiptWithRows(body, rows);
  }
  saveImportReceiptRows(receiptId: number, rows: ImportReceiptRows['rows']): Promise<void> {
    return this.bankImports.saveImportReceiptRows(receiptId, rows);
  }
  getImportReceiptRows(receiptId: number): Promise<ImportReceiptRows['rows']> {
    return this.bankImports.getImportReceiptRows(receiptId);
  }
  updateImportReceipt(id: number, body: Partial<ImportReceipt>): Promise<ImportReceipt> {
    return this.bankImports.updateImportReceipt(id, body);
  }
  undoImportReceipt(id: number): Promise<{ removed: number; edited: number; missing: number }> {
    return this.bankImports.undoImportReceipt(id);
  }

  async bulkRenameTransactionCategories(renames: { fromCategory: string; toCategory: string }[]): Promise<{ updated: number; conflicts: number }> {
    const lookup = new Map(renames.map(row => [row.fromCategory, row.toCategory]));
    const rows = (await this.getTransactions()).filter(row => lookup.has(row.category));
    let updated = 0;
    let conflicts = 0;
    for (const row of rows) {
      try {
        await this.updateTransaction(row.id, { category: lookup.get(row.category)! });
        updated += 1;
      } catch {
        conflicts += 1;
      }
    }
    return { updated, conflicts };
  }

  async bulkCategorizeMerchant(merchant: string, category: string): Promise<{ updated: number; conflicts: number }> {
    const normalizedMerchant = merchant.trim().toLocaleLowerCase();
    const rows = (await this.getTransactions()).filter(row =>
      String(row.merchant || '').trim().toLocaleLowerCase() === normalizedMerchant
    );
    let updated = 0;
    let conflicts = 0;
    for (const row of rows) {
      try {
        await this.updateTransaction(row.id, { category });
        updated += 1;
      } catch {
        conflicts += 1;
      }
    }
    return { updated, conflicts };
  }

  async getAssets(): Promise<Asset[]> {
    await this.ensureLoaded();
    return this.list<Asset>('assets');
  }

  async addAsset(body: any): Promise<Asset> {
    return this.upsert('assets', body);
  }

  async updateAsset(id: number, body: any): Promise<Asset> {
    const generation = this.generation;
    const current = (await this.getAssets()).find(a => a.id === id);
    this.assertSession(generation);
    if (!current) throw new Error('Asset not found');
    return this.upsert('assets', { ...current, ...body, id }, undefined, generation);
  }

  async deleteAsset(id: number): Promise<void> {
    return this.remove('assets', id);
  }

  async getLiabilities(): Promise<Liability[]> {
    await this.ensureLoaded();
    return this.list<Liability>('liabilities');
  }

  async addLiability(body: any): Promise<Liability> {
    return this.upsert('liabilities', body);
  }

  async updateLiability(id: number, body: any): Promise<Liability> {
    const generation = this.generation;
    const current = (await this.getLiabilities()).find(a => a.id === id);
    this.assertSession(generation);
    if (!current) throw new Error('Liability not found');
    return this.upsert('liabilities', { ...current, ...body, id }, undefined, generation);
  }

  async deleteLiability(id: number): Promise<void> {
    return this.remove('liabilities', id);
  }

  async getHoldings(): Promise<Holding[]> {
    await this.ensureLoaded();
    const accounts = this.list<{
      id: number;
      broker_name?: string;
      account_mask?: string;
      nickname?: string | null;
      label?: string | null;
    }>('brokerage_accounts');
    const labels = new Map(
      accounts.map(acc => [
        acc.id,
        acc.nickname?.trim() ||
          acc.label?.trim() ||
          `${acc.broker_name || 'Fidelity'} ···${acc.account_mask || ''}`.trim(),
      ])
    );
    const allHoldings = this.list<Holding>('holdings');
    const latestStages = await this.getLatestActivatedHoldingStages();
    const activeHoldings = allHoldings.flatMap(h => {
      if (h.lifecycle_status === 'inactive') return [];
      const display = String(h.account_display || '').trim().toLocaleLowerCase();
      const suffix = display.startsWith('fidelity')
        ? display.split('···').at(-1)?.trim().split(/[\s(]/, 1)[0] || ''
        : '';
      const activeStage = h.brokerage_account_id == null
        ? (suffix ? latestStages.byAccountMask.get(suffix)?.id : undefined)
        : latestStages.byAccountId.get(Number(h.brokerage_account_id))?.id;
      if (activeStage != null) {
        // Only the active generation and manual rows added after it belong in this account projection.
        if (h.portfolio_stage_id !== activeStage) return [];
        return [{ ...h, lifecycle_status: 'active' as const }];
      }
      return h.lifecycle_status !== 'staged' ? [h] : [];
    });
    return activeHoldings.map(h =>
      enrichHolding({
        ...h,
        account_display:
          (h.brokerage_account_id != null ? labels.get(h.brokerage_account_id) : null) ||
          h.account_display ||
          null,
      })
    );
  }

  async addHolding(body: any): Promise<Holding> {
    const generation = this.generation;
    const payload = { ...body };
    if (payload.brokerage_account_id != null && payload.portfolio_stage_id == null) {
      const stage = (await this.getLatestActivatedHoldingStages()).byAccountId.get(Number(payload.brokerage_account_id));
      this.assertSession(generation);
      if (stage) {
        payload.portfolio_stage_id = stage.id;
        payload.lifecycle_status = 'active';
      }
    }
    const row = await this.upsert('holdings', {
      ...payload,
      current_price: body.current_price ?? body.purchase_price,
      price_source: body.price_source ?? 'manual',
    }, undefined, generation);
    return enrichHolding(row);
  }

  async updateHolding(id: number, body: any, expectedGeneration = this.generation): Promise<Holding> {
    const generation = expectedGeneration;
    return this.runRecordUpdate('holdings', id, generation, async () => {
      const current = (await this.getHoldings()).find(a => a.id === id);
      this.assertSession(generation);
      if (!current) throw new Error('Holding not found');
      const next = { ...current, ...body, id };
      const sharesChanged = body.shares !== undefined && Number(body.shares) !== Number(current.shares);
      const priceChanged = body.current_price !== undefined && (body.current_price == null
        ? current.current_price != null
        : Number(body.current_price) !== Number(current.current_price));
      if ((sharesChanged || priceChanged) && body.market_value === undefined) {
        next.market_value = null;
        next.value = null;
      }
      if (body.purchase_price !== undefined && body.cost_basis_status === undefined) {
        next.cost_basis_status = body.purchase_price == null ? 'unknown' : 'known';
      }
      return enrichHolding(await this.upsert('holdings', next, undefined, generation));
    });
  }

  async updateHoldingPrice(
    id: number,
    quote: { symbol: string; price: number; price_source: string; price_as_of?: string | null; quote_date?: string | null; market_date?: string | null },
    expectedGeneration = this.generation
  ): Promise<Holding> {
    this.assertValidQuote(quote);
    return this.runRecordUpdate('holdings', id, expectedGeneration, async () => {
      const current = (await this.getHoldings()).find(row => row.id === id);
      this.assertSession(expectedGeneration);
      if (!current) throw new Error('Holding not found');
      if (this.normalizeSymbol(current.symbol) !== this.normalizeSymbol(quote.symbol)) {
        throw new Error('The holding ticker changed while its quote was loading. Refresh again.');
      }
      const next = {
        ...current,
        current_price: quote.price,
        market_value: null,
        value: null,
        price_source: quote.price_source,
        price_as_of: quote.price_as_of ?? null,
        quote_date: quote.quote_date ?? quote.market_date ?? null,
      };
      return enrichHolding(await this.upsert('holdings', next, undefined, expectedGeneration));
    });
  }

  async updateJobIncomeMarketQuote(
    id: number,
    requestedSymbol: string,
    quote: { symbol: string; price: number; price_source: string; price_as_of?: string | null; quote_date?: string | null },
    expectedGeneration = this.generation
  ): Promise<JobIncome> {
    this.assertValidQuote(quote);
    return this.runRecordUpdate('job_incomes', id, expectedGeneration, async () => {
      const current = (await this.getJobIncomes()).find(row => row.id === id);
      this.assertSession(expectedGeneration);
      if (!current) throw new Error('Income not found');
      const symbol = this.normalizeSymbol(requestedSymbol);
      if (this.normalizeSymbol(current.stock_symbol || '') !== symbol || this.normalizeSymbol(quote.symbol) !== symbol) {
        throw new Error('The employer ticker changed while its quote was loading. Refresh again.');
      }
      const date = quote.quote_date ?? '';
      const observedDate = quote.price_as_of ? quote.price_as_of.slice(0, 10) : undefined;
      const valuation = {
        date,
        price_per_share: quote.price,
        source: quote.price_source,
        price_as_of: quote.price_as_of ?? null,
        ...(observedDate && this.isValidDate(observedDate) ? { observed_date: observedDate } : {}),
        symbol,
      };
      const valuations = [...(current.stock_valuations || [])].filter(item => item.date !== date);
      valuations.push(valuation);
      valuations.sort((a, b) => a.date.localeCompare(b.date));
      return enrichJobIncome(await this.upsert('job_incomes', { ...current, stock_valuations: valuations }, undefined, expectedGeneration));
    });
  }

  private assertValidQuote(quote: { symbol: string; price: number; quote_date?: string | null }): void {
    if (!/^[A-Z][A-Z0-9.-]*$/.test(this.normalizeSymbol(quote?.symbol || ''))) throw new Error('Invalid market ticker.');
    if (!Number.isFinite(quote?.price) || quote.price <= 0) throw new Error('Market quote price must be a positive finite number.');
    const date = quote.quote_date ?? '';
    if (!this.isValidDate(date) || date > new Date().toISOString().slice(0, 10)) throw new Error('Market quote has an invalid or future trading date.');
  }

  private normalizeSymbol(value: string): string { return value.trim().toUpperCase(); }

  private isValidDate(value: string): boolean {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const parsed = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }

  async deleteHolding(id: number): Promise<void> {
    const generation = this.generation;
    return this.runRecordUpdate('holdings', id, generation, () => this.remove('holdings', id));
  }

  async getBrokerageAccounts(): Promise<
    Array<{
      id: number;
      broker_slug: string;
      broker_name: string;
      account_mask: string;
      account_name?: string;
      nickname?: string | null;
      label?: string | null;
    }>
  > {
    await this.ensureLoaded();
    return this.list('brokerage_accounts');
  }

  async upsertBrokerageAccount(body: {
    id?: number;
    broker_slug: string;
    broker_name: string;
    account_mask: string;
    account_name?: string;
    nickname?: string | null;
    label?: string | null;
  }): Promise<{
    id: number;
    broker_slug: string;
    broker_name: string;
    account_mask: string;
    account_name?: string;
    nickname?: string | null;
    label?: string | null;
  }> {
    const generation = this.generation;
    const existing = (await this.getBrokerageAccounts()).find(account =>
      account.broker_slug === body.broker_slug && account.account_mask === body.account_mask
    );
    this.assertSession(generation);
    const row = await this.upsert('brokerage_accounts', { ...existing, ...body, id: body.id ?? existing?.id }, undefined, generation);
    return { ...row, id: Number(row.id) };
  }

  async createHoldingImportStage(body: Omit<FidelityStageRecord, 'id' | 'selected_rows'>, rows: FidelityStageRow[]): Promise<FidelityStageRecord> {
    return this.brokerageStages.createHoldingImportStage(body, rows);
  }
  getHoldingImportStages(): Promise<FidelityStageRecord[]> { return this.brokerageStages.getHoldingImportStages(); }
  getHoldingImportStageRows(stageId: number): Promise<FidelityStageRow[]> {
    return this.brokerageStages.getHoldingImportStageRows(stageId);
  }
  private getLatestActivatedHoldingStages(): Promise<{
    byAccountId: Map<number, FidelityStageRecord>;
    byAccountMask: Map<string, FidelityStageRecord>;
  }> {
    return this.brokerageStages.getLatestActivatedHoldingStages();
  }
  async verifyHoldingImportStage(stageId: number): Promise<FidelityStageRecord> {
    return this.brokerageStages.verifyHoldingImportStage(stageId);
  }
  async activateHoldingImportStage(stageId: number): Promise<FidelityCommitResult> {
    return this.brokerageStages.activateHoldingImportStage(stageId);
  }
  setBrokerageAccountNickname(accountId: number, nickname: string | null): Promise<BrokerageAccountRecord> {
    return this.brokerageStages.setBrokerageAccountNickname(accountId, nickname);
  }

  async getJobIncomes(): Promise<JobIncome[]> {
    await this.ensureLoaded();
    return this.list<JobIncome>('job_incomes').map(enrichJobIncome);
  }

  async addJobIncome(body: any): Promise<JobIncome> {
    return enrichJobIncome(await this.upsert('job_incomes', body));
  }

  async updateJobIncome(id: number, body: any): Promise<JobIncome> {
    const generation = this.generation;
    return this.runRecordUpdate('job_incomes', id, generation, async () => {
      const current = (await this.getJobIncomes()).find(a => a.id === id);
      this.assertSession(generation);
      if (!current) throw new Error('Income not found');
      return enrichJobIncome(await this.upsert('job_incomes', { ...current, ...body, id }, undefined, generation));
    });
  }

  async deleteJobIncome(id: number): Promise<void> {
    const generation = this.generation;
    return this.runRecordUpdate('job_incomes', id, generation, () => this.remove('job_incomes', id));
  }

  async getFixedExpenses(): Promise<FixedExpense[]> {
    await this.ensureLoaded();
    return this.list<FixedExpense>('fixed_expenses').map(enrichFixedExpense);
  }

  async addFixedExpense(body: any): Promise<FixedExpense> {
    return enrichFixedExpense(await this.upsert('fixed_expenses', body));
  }

  async updateFixedExpense(id: number, body: any): Promise<FixedExpense> {
    const generation = this.generation;
    return this.runRecordUpdate('fixed_expenses', id, generation, async () => {
      const current = (await this.getFixedExpenses()).find(a => a.id === id);
      this.assertSession(generation);
      if (!current) throw new Error('Expense not found');
      return enrichFixedExpense(await this.upsert('fixed_expenses', { ...current, ...body, id }, undefined, generation));
    });
  }

  async deleteFixedExpense(id: number): Promise<void> {
    return this.remove('fixed_expenses', id);
  }

  async getSubscriptions(): Promise<Subscription[]> {
    await this.ensureLoaded();
    return this.list<Subscription>('subscriptions').map(enrichSubscription);
  }

  async addSubscription(body: any): Promise<Subscription> {
    return enrichSubscription(await this.upsert('subscriptions', body));
  }

  async updateSubscription(id: number, body: any): Promise<Subscription> {
    const generation = this.generation;
    return this.runRecordUpdate('subscriptions', id, generation, async () => {
      const current = (await this.getSubscriptions()).find(a => a.id === id);
      this.assertSession(generation);
      if (!current) throw new Error('Subscription not found');
      return enrichSubscription(await this.upsert('subscriptions', { ...current, ...body, id }, undefined, generation));
    });
  }

  async deleteSubscription(id: number): Promise<void> {
    return this.remove('subscriptions', id);
  }

  async getNetWorth() {
    const [assets, liabilities, holdings] = await Promise.all([
      this.getAssets(),
      this.getLiabilities(),
      this.getHoldings(),
    ]);
    return computeNetWorth(assets, liabilities, holdings);
  }

  async getCashflowSummary(start: string, end: string) {
    const [txs, incomes, fixed, subs] = await Promise.all([
      this.getTransactions(),
      this.getJobIncomes(),
      this.getFixedExpenses(),
      this.getSubscriptions(),
    ]);
    const base = computeCashflowSummary(start, end, txs, incomes, fixed, subs);
    return {
      ...base,
    };
  }

  async listPlanningProfiles(): Promise<any[]> {
    await this.ensureLoaded();
    return this.list<any>('planning_profiles');
  }

  async savePlanningProfile(body: any, id?: number): Promise<any> {
    const generation = this.generation;
    if (id != null) {
      const current = (await this.listPlanningProfiles()).find(p => p.id === id) || { id };
      this.assertSession(generation);
      return this.upsert('planning_profiles', { ...current, ...body, id }, undefined, generation);
    }
    return this.upsert('planning_profiles', body, undefined, generation);
  }

  async deletePlanningProfile(id: number): Promise<void> {
    return this.remove('planning_profiles', id);
  }

  async getStockLabScenarios(): Promise<StockLabScenario[]> {
    await this.ensureLoaded();
    return this.list<StockLabScenario>('stock_lab_scenarios').sort((a, b) =>
      b.updated_at.localeCompare(a.updated_at)
    );
  }

  async saveStockLabScenario(body: StockLabScenario, id?: number): Promise<StockLabScenario> {
    const current = id
      ? (await this.getStockLabScenarios()).find(row => row.id === id)
      : undefined;
    const now = new Date().toISOString();
    return this.upsert('stock_lab_scenarios', {
      ...current,
      ...body,
      id: id ?? body.id,
      created_at: current?.created_at ?? body.created_at ?? now,
      updated_at: now,
    });
  }

  async deleteStockLabScenario(id: number): Promise<void> {
    return this.remove('stock_lab_scenarios', id);
  }
}
