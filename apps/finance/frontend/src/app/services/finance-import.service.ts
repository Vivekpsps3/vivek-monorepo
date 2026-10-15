import { Injectable } from '@angular/core';
import {
  BankAccountRecord,
  BankImportFile,
  BankImportFilePreview,
  BankImportOption,
  FidelityCommitResult,
  FidelityImportOption,
  FidelityPreviewResult,
  FidelityPreviewRow,
  ImportCommitResult,
  ImportPreviewResult,
  ImportPreviewRow,
  ImportReceipt,
  ImportRowNote,
} from '../models/transaction.model';
import { EncryptedStoreService } from '../crypto/encrypted-store.service';
import {
  buildBankImportPreview,
  buildBankImportPreviews,
  commitBankImportRows,
  listClientBankImports,
  resumeBankImportReceipt,
} from '../utils/bank-import.util';
import {
  BrokerageAccountRecord,
  FidelityStageRecord,
  buildFidelityImportPreview,
  commitFidelityImportRows,
  getResumableFidelityStages,
  listClientBrokerageImports,
  resumeFidelityImportStage,
} from '../utils/fidelity-import.util';

/** Coordinates browser-local CSV previews and encrypted import receipts. */
@Injectable({ providedIn: 'root' })
export class FinanceImportService {
  constructor(private store: EncryptedStoreService) {}

  listBanks(): BankImportOption[] {
    return listClientBankImports();
  }

  async previewBank(bankSlug: string, file: File): Promise<ImportPreviewResult> {
    const [content, transactions] = await Promise.all([file.text(), this.store.getTransactions()]);
    const existing = new Set(transactions.map(row => String(row.dedupe_key || '')).filter(Boolean));
    return buildBankImportPreview(bankSlug, file.name, content, existing);
  }

  async previewBanks(files: BankImportFile[]): Promise<BankImportFilePreview[]> {
    const transactions = await this.store.getTransactions();
    const existing = new Set(transactions.map(row => String(row.dedupe_key || '')).filter(Boolean));
    const legacy = new Set(transactions
      .filter(row => row.source === 'import' && !row.bank_account_key)
      .map(row => String(row.dedupe_key || ''))
      .filter(Boolean));
    return buildBankImportPreviews(files, existing, legacy);
  }

  getBankAccounts(): Promise<BankAccountRecord[]> {
    return this.store.getBankAccounts();
  }

  getReceipts(): Promise<ImportReceipt[]> {
    return this.store.getImportReceipts();
  }

  commitBanks(
    rows: ImportPreviewRow[],
    context?: {
      bank_slugs?: string[];
      filenames?: string[];
      unresolved?: ImportRowNote[];
      account_displays?: string[];
      coverage?: ImportReceipt['coverage'];
      resume_receipt_id?: number;
      confirmed_bank_accounts?: Array<Omit<BankAccountRecord, 'id'> & { id?: number }>;
    }
  ): Promise<ImportCommitResult> {
    return commitBankImportRows(this.store, rows, context);
  }

  resumeBankReceipt(receiptId: number): Promise<ImportCommitResult> {
    return resumeBankImportReceipt(this.store, receiptId);
  }

  undoBankReceipt(receiptId: number): Promise<{ removed: number; edited: number; missing: number }> {
    return this.store.undoImportReceipt(receiptId);
  }

  commitBank(rows: ImportPreviewRow[]): Promise<ImportCommitResult> {
    return commitBankImportRows(this.store, rows);
  }

  listBrokerages(): FidelityImportOption[] {
    return listClientBrokerageImports();
  }

  async previewFidelity(file: File): Promise<FidelityPreviewResult> {
    return buildFidelityImportPreview(file.name, await file.text());
  }

  commitFidelity(
    filename: string,
    rows: FidelityPreviewRow[],
    selectedAccountMasks?: string[]
  ): Promise<FidelityCommitResult> {
    return commitFidelityImportRows(this.store, rows, selectedAccountMasks, filename);
  }

  getBrokerageAccounts(): Promise<BrokerageAccountRecord[]> {
    return this.store.getBrokerageAccounts();
  }

  getHoldingStages(): Promise<FidelityStageRecord[]> {
    return getResumableFidelityStages(this.store);
  }

  resumeHoldingStage(stageId: number): Promise<FidelityCommitResult> {
    return resumeFidelityImportStage(this.store, stageId);
  }

  setAccountNickname(accountId: number, nickname: string | null): Promise<unknown> {
    return this.store.setBrokerageAccountNickname(accountId, nickname);
  }
}
