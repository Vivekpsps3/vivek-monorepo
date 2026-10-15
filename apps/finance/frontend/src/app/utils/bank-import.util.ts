import {
  BankAccountRecord,
  BankImportFile,
  BankImportFilePreview,
  ImportCommitResult,
  ImportPreviewResult,
  ImportPreviewRow,
  ImportRowNote,
  ImportReceipt,
  Transaction,
} from '../models/transaction.model';

import { accountDisplay, buildDedupeKey, errorMessage, getBankImporter, listClientBankImports, suggestMerchant } from './bank-import.parsers';
export { listClientBankImports, suggestMerchant };

interface EncryptedImportStore {
  getTransactions(): Promise<Transaction[]>;
  addTransaction(row: any): Promise<Transaction>;
  updateTransaction?(id: number, row: Partial<Transaction>): Promise<Transaction>;
  addImportReceipt?(row: Omit<ImportReceipt, 'id'>): Promise<ImportReceipt>;
  addImportReceiptWithRows?(row: Omit<ImportReceipt, 'id'>, rows: ImportPreviewRow[]): Promise<ImportReceipt>;
  saveImportReceiptRows?(id: number, rows: ImportPreviewRow[]): Promise<void>;
  getImportReceiptRows?(id: number): Promise<ImportPreviewRow[]>;
  updateImportReceipt?(id: number, row: Partial<ImportReceipt>): Promise<ImportReceipt>;
  getImportReceipt?(id: number): Promise<ImportReceipt | null>;
  upsertBankAccount?(row: Omit<BankAccountRecord, 'id'> & { id?: number }): Promise<BankAccountRecord>;
}



export async function buildBankImportPreview(
  bankSlug: string,
  filename: string,
  content: string,
  existingDedupeKeys: Set<string>,
  accountDisplayOverride?: string,
  accountKey?: string,
  explicitlyMappedLegacyAccount = false,
  legacyDedupeKeys = existingDedupeKeys,
  accountMaskOverride?: string
): Promise<ImportPreviewResult> {
  const importer = getBankImporter(bankSlug);
  const parsed = await importer.parse(content, accountKey ? (accountMaskOverride ?? '') : accountMaskOverride);
  const seenInFile = new Set<string>();
  let newCount = 0;
  let duplicateCount = 0;
  const rows: ImportPreviewRow[] = await Promise.all(parsed.rows.map(async (row): Promise<ImportPreviewRow> => {
    const legacyDedupeKey = row.legacy_dedupe_key;
    const dedupe_key = accountKey
      ? await buildDedupeKey(bankSlug, `account:${accountKey}`, row.date, row.amount, row.description)
      : row.dedupe_key;
    const stableDuplicate = existingDedupeKeys.has(dedupe_key) || seenInFile.has(dedupe_key);
    const legacyMatch = !!legacyDedupeKey && explicitlyMappedLegacyAccount && !stableDuplicate && legacyDedupeKeys.has(legacyDedupeKey);
    const duplicate = stableDuplicate || legacyMatch;
    const requiresReview = row.kind === 'ambiguous_credit';
    if (duplicate) {
      duplicateCount += 1;
    } else {
      newCount += 1;
        seenInFile.add(dedupe_key);
    }
    return {
      ...row,
      dedupe_key,
      account_key: accountKey,
      bank_slug: bankSlug,
      source_account_mask: row.account_mask,
      legacy_dedupe_key: legacyMatch ? legacyDedupeKey : undefined,
      account_display: accountDisplayOverride?.trim() || accountDisplay(importer.name, row.account_mask),
      status: duplicate ? 'duplicate' : requiresReview ? 'review' : 'new',
      kind: row.kind,
      review_reason: requiresReview ? 'Credit type is unclear. Choose how to record it before importing.' : undefined,
      merchant_suggestion: suggestMerchant(row.description),
    };
  }));
  return {
    bank: importer.name,
    filename,
    rows,
    skipped: parsed.skipped,
    errors: parsed.errors,
    summary: {
      total_parsed: rows.length,
      new: newCount,
      duplicate: duplicateCount,
      skipped: parsed.skipped.length,
      errors: parsed.errors.length,
    },
  };
}

/** Preview in file order so overlapping statements share one dedupe set. */
export async function buildBankImportPreviews(
  files: BankImportFile[],
  existingDedupeKeys: Set<string>,
  legacyDedupeKeys = existingDedupeKeys
): Promise<BankImportFilePreview[]> {
  const seen = new Set(existingDedupeKeys);
  const results: BankImportFilePreview[] = [];
  for (const entry of files) {
    const result: BankImportFilePreview = {
      id: entry.id, bank_slug: entry.bank_slug, filename: entry.file.name, preview: null, error: null,
    };
    try {
      const importer = getBankImporter(entry.bank_slug);
      if (!importer.file_extensions.some(ext => entry.file.name.toLowerCase().endsWith(ext.toLowerCase()))) {
        throw new Error(`Choose a ${importer.file_extensions.join(', ')} file for ${importer.name}.`);
      }
      result.preview = await buildBankImportPreview(
        entry.bank_slug,
        entry.file.name,
        await entry.file.text(),
        seen,
        entry.account_display,
        entry.account_key,
        entry.map_legacy_account === true,
        legacyDedupeKeys,
        entry.account_mask_override
      );
      for (const row of result.preview.rows) row.source_filename = entry.file.name;
      for (const row of result.preview.rows) seen.add(row.dedupe_key);
    } catch (error) {
      result.error = errorMessage(error);
    }
    results.push(result);
  }
  return results;
}

export async function commitBankImportRows(
  store: EncryptedImportStore,
  rows: ImportPreviewRow[],
  receiptContext?: { bank_slugs?: string[]; filenames?: string[]; unresolved?: ImportRowNote[]; account_displays?: string[]; coverage?: ImportReceipt['coverage']; resume_receipt_id?: number; replace_filename?: string; confirmed_bank_accounts?: Array<Omit<BankAccountRecord, 'id'> & { id?: number }> }
): Promise<ImportCommitResult> {
  const transactions = await store.getTransactions();
  const existing = new Map(
    transactions.map(tx => [String(tx.dedupe_key || ''), tx] as const).filter(([key]) => !!key)
  );
  const resume = receiptContext?.resume_receipt_id && store.getImportReceipt
    ? await store.getImportReceipt(receiptContext.resume_receipt_id)
    : null;
  for (const account of receiptContext?.confirmed_bank_accounts || []) {
    if (store.upsertBankAccount) await store.upsertBankAccount({ ...account, confirmed: true });
  }
  const coverage = (receiptContext?.coverage || []).filter(row => row.confirmed && row.account_key && row.start_date && row.end_date && row.end_date >= row.start_date);
  const coverageStart = coverage.length ? coverage.map(row => row.start_date).sort()[0] : null;
  const coverageEnd = coverage.length ? coverage.map(row => row.end_date).sort().at(-1) || null : null;
  const receiptBody: Omit<ImportReceipt, 'id'> = {
    bank_slugs: receiptContext?.bank_slugs || [],
    filenames: receiptContext?.filenames || [],
    status: 'staged',
    started_at: new Date().toISOString(),
    completed_at: null,
    selected_row_count: rows.length,
    inserted_count: 0,
    completed_dedupe_keys: [],
    unresolved: receiptContext?.unresolved || [],
    coverage_start: coverageStart,
    coverage_end: coverageEnd,
    coverage,
    account_displays: receiptContext?.account_displays || Array.from(new Set(rows.map(row => row.account_display))),
    undo_summary: null,
  };
  let receipt = resume || (store.addImportReceiptWithRows
    ? await store.addImportReceiptWithRows(receiptBody, rows)
    : store.addImportReceipt
      ? await store.addImportReceipt({ ...receiptBody, selected_rows: rows })
      : null);
  let replacementReceiptFields: Partial<ImportReceipt> = {};
  if (receipt && resume) {
    if (receiptContext?.replace_filename) {
      const existingRows = store.getImportReceiptRows ? await store.getImportReceiptRows(receipt.id) : [];
      const combined = [...existingRows.filter(row => row.source_filename !== receiptContext.replace_filename), ...rows];
      const byDedupeKey = new Map<string, ImportPreviewRow>();
      for (const row of combined) byDedupeKey.set(row.dedupe_key, row);
      rows = [...byDedupeKey.values()];
      if (store.saveImportReceiptRows) await store.saveImportReceiptRows(receipt.id, rows);
      const filenames = Array.from(new Set([
        ...receipt.filenames.filter(filename => filename !== receiptContext.replace_filename),
        ...(receiptContext.filenames || []),
      ]));
      const coverage = Array.from(new Map([
        ...(receipt.coverage || []),
        ...(receiptContext.coverage || []),
      ].map(entry => [`${entry.account_key || ''}:${entry.start_date}:${entry.end_date}`, entry] as const)).values());
      replacementReceiptFields = {
        bank_slugs: Array.from(new Set([...receipt.bank_slugs, ...(receiptContext.bank_slugs || [])])),
        filenames,
        unresolved: [
          ...receipt.unresolved.filter(note => note.filename !== receiptContext.replace_filename),
          ...(receiptContext.unresolved || []),
        ],
        account_displays: Array.from(new Set([...receipt.account_displays, ...(receiptContext.account_displays || [])])),
        coverage,
        coverage_start: coverage.length ? coverage.map(row => row.start_date).sort()[0] : null,
        coverage_end: coverage.length ? coverage.map(row => row.end_date).sort().at(-1) || null : null,
      };
      await store.updateImportReceipt?.(receipt.id, replacementReceiptFields);
      receipt = await store.getImportReceipt?.(receipt.id) || { ...receipt, ...replacementReceiptFields };
    } else if (rows.length && store.saveImportReceiptRows) {
      await store.saveImportReceiptRows(receipt.id, rows);
      receipt = await store.getImportReceipt?.(receipt.id) || receipt;
    } else if (store.getImportReceiptRows) {
      rows = await store.getImportReceiptRows(receipt.id);
    }
  }
  if (receipt && !resume && store.saveImportReceiptRows && !store.addImportReceiptWithRows) {
    await store.saveImportReceiptRows(receipt.id, rows);
  }
  let inserted = 0;
  let skipped = 0;
  const seen = new Set<string>();
  const unresolved = [...(receiptContext?.replace_filename
    ? replacementReceiptFields.unresolved || receiptContext.unresolved || []
    : receipt?.unresolved || receiptContext?.unresolved || [])];
  try {
  for (const row of rows) {
    const legacy = row.legacy_dedupe_key ? existing.get(row.legacy_dedupe_key) : undefined;
    if (legacy && !legacy.bank_account_key) {
      if (!row.account_key || !store.updateTransaction) {
        throw new Error('Legacy account mapping is unavailable. Reopen the CSV preview and try again.');
      }
      const mapped = await store.updateTransaction(legacy.id, {
        account_display: row.account_display,
        bank_account_key: row.account_key,
        source_bank: row.bank_slug || null,
        source_account_mask: row.source_account_mask || row.account_mask,
        dedupe_key: row.dedupe_key,
      });
      existing.delete(row.legacy_dedupe_key!);
      existing.set(row.dedupe_key, mapped);
    }
    if (row.status === 'duplicate' || existing.has(row.dedupe_key) || seen.has(row.dedupe_key)) {
      skipped += 1;
      continue;
    }
    const type = row.kind === 'income' ? 'income' : 'expense';
    const saved = await store.addTransaction({
      date: row.date,
      type,
      category: row.category,
      amount: row.amount,
      description: row.description,
      source: 'import',
      account_display: row.account_display,
      bank_account_key: row.account_key || null,
      source_bank: row.bank_slug || null,
      source_account_mask: row.source_account_mask || row.account_mask,
      dedupe_key: row.dedupe_key,
      kind: row.kind || 'purchase',
      merchant: row.merchant || null,
      reviewed: row.reviewed === true,
      review_reason: row.kind === 'ambiguous_credit' ? (row.review_reason || 'Credit type is unclear. Classify as refund, income, payment, or transfer.') : null,
      import_receipt_id: receipt?.id,
      import_edited: false,
      import_snapshot: {
        date: row.date,
        type,
        category: row.category,
        amount: row.amount,
        description: row.description,
        account_display: row.account_display,
        bank_account_key: row.account_key || null,
        source_bank: row.bank_slug || null,
        source_account_mask: row.source_account_mask || row.account_mask,
        kind: row.kind || 'purchase',
        merchant: row.merchant || null,
        reviewed: row.reviewed === true,
        review_reason: row.kind === 'ambiguous_credit' ? (row.review_reason || 'Credit type is unclear. Classify as refund, income, payment, or transfer.') : null,
      },
    });
    inserted += 1;
    seen.add(row.dedupe_key);
    existing.set(row.dedupe_key, saved);
    if (row.kind === 'ambiguous_credit') unresolved.push({ line: 0, reason: `Unclassified credit from ${row.date}: ${row.description}`, filename: receipt?.filenames[0] });
  }
  if (receipt && store.updateImportReceipt) {
    const linkedCount = (await store.getTransactions()).filter(tx => tx.import_receipt_id === receipt.id).length;
    try {
      await store.updateImportReceipt(receipt.id, {
        ...replacementReceiptFields,
        status: 'complete',
        completed_at: new Date().toISOString(),
        inserted_count: linkedCount,
        unresolved,
        last_error: null,
        completed_dedupe_keys: [],
      });
    } catch (error) {
      if (error && typeof error === 'object') (error as any).receipt_id = receipt.id;
      throw error;
    }
  }
  } catch (error) {
    if (receipt && store.updateImportReceipt) {
      await store.updateImportReceipt(receipt.id, {
        status: 'partial',
        last_error: errorMessage(error),
      }).catch(() => undefined);
      if (error && typeof error === 'object') (error as any).receipt_id = receipt.id;
    }
    throw error;
  }
  return {
    inserted,
    skipped,
    batch_id: receipt?.id || 0,
    ...(receipt ? { receipt_id: receipt.id, unresolved: unresolved.length, coverage_start: receipt.coverage_start, coverage_end: receipt.coverage_end } : {}),
  };
}

export async function resumeBankImportReceipt(store: EncryptedImportStore & {
  getImportReceipt?: (id: number) => Promise<import('../models/transaction.model').ImportReceipt | null>;
  getImportReceiptRows?: (id: number) => Promise<ImportPreviewRow[]>;
}, receiptId: number): Promise<ImportCommitResult> {
  if (!store.getImportReceipt) throw new Error('Import receipts are not available');
  const receipt = await store.getImportReceipt(receiptId);
  if (!receipt) throw new Error('Import receipt not found');
  if (receipt.status === 'withdrawn') throw new Error('This import was undone and cannot be resumed');
  if (receipt.status === 'undoing') throw new Error('This import is being undone. Resume the undo from Imports.');
  if (receipt.status === 'complete') return {
    inserted: 0,
    skipped: receipt.selected_row_count || receipt.selected_rows?.length || 0,
    batch_id: receipt.id,
    receipt_id: receipt.id,
    unresolved: receipt.unresolved.length,
    coverage_start: receipt.coverage_start,
    coverage_end: receipt.coverage_end,
  };
  const rows = store.getImportReceiptRows
    ? await store.getImportReceiptRows(receipt.id)
    : receipt.selected_rows || [];
  if (rows.length !== receipt.selected_row_count) throw new Error('This receipt is missing staged rows and cannot be resumed. Re-import the original CSV.');
  return commitBankImportRows(store, [], { resume_receipt_id: receipt.id });
}
