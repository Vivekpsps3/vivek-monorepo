import {
  BankAccountRecord,
  BankImportOption,
  BankImportFile,
  BankImportFilePreview,
  ImportCommitResult,
  ImportPreviewResult,
  ImportPreviewRow,
  ImportRowNote,
  ImportReceipt,
  Transaction,
} from '../models/transaction.model';

interface ParsedBankRow {
  date: string;
  account_mask: string;
  description: string;
  category: string;
  amount: number;
  dedupe_key: string;
  legacy_dedupe_key?: string;
  kind: NonNullable<ImportPreviewRow['kind']>;
}

interface ParsedBankResult {
  rows: ParsedBankRow[];
  skipped: ImportRowNote[];
  errors: ImportRowNote[];
}

interface BankImporter {
  slug: string;
  name: string;
  hint: string;
  file_extensions: string[];
  parse(content: string, accountMaskOverride?: string): Promise<ParsedBankResult>;
}

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

const IMPORTERS: BankImporter[] = [
  {
    slug: 'capital_one',
    name: 'Capital One',
    hint: 'Capital One credit card CSV. Uses Transaction Date, Description, Category, and Debit. Card No. is optional when you select an account. Refunds are classified; payments and transfers are excluded; unclear credits need review.',
    file_extensions: ['.csv'],
    parse: parseCapitalOne,
  },
  {
    slug: 'chase',
    name: 'Chase',
    hint: 'Chase credit card CSV. Uses Transaction Date, Description, Category, Type, and Amount. Purchases are imported; refunds are classified; payments and transfers are excluded; unclear credits need review.',
    file_extensions: ['.csv'],
    parse: parseChase,
  },
  {
    slug: 'amex',
    name: 'American Express',
    hint: 'American Express credit card CSV. Uses Date, Description, Amount, and optional Category. Account # is optional when you select an account. Purchases are imported; refunds are classified; payments and transfers are excluded; unclear credits need review.',
    file_extensions: ['.csv'],
    parse: parseAmex,
  },
  {
    slug: 'citi',
    name: 'Citi',
    hint: 'Citi credit card CSV. Uses Status, Date, Description, Debit, and Credit. Member Name is optional when you select an account. Cleared purchases are imported; refunds are classified; payments and transfers are excluded; unclear credits need review.',
    file_extensions: ['.csv'],
    parse: parseCiti,
  },
  {
    slug: 'bank_of_america',
    name: 'Bank of America',
    hint: 'Bank of America credit card CSV. Uses Posted Date, Payee, and Amount. Purchases are imported; refunds are classified; payments and transfers are excluded; unclear credits need review.',
    file_extensions: ['.csv'],
    parse: parseBankOfAmerica,
  },
  {
    slug: 'x_money',
    name: 'X Money',
    hint: 'X Money CSV. Uses Date, Description, Type, Category, Amount, and Status. Account is optional when you select an account. Completed purchases are imported; refunds need review.',
    file_extensions: ['.csv'],
    parse: parseXMoney,
  },
];

const IMPORTER_ALIASES: Record<string, string> = {
  'capital-one': 'capital_one',
  capitalone: 'capital_one',
  american_express: 'amex',
  bofa: 'bank_of_america',
  boa: 'bank_of_america',
  bankofamerica: 'bank_of_america',
};

export function listClientBankImports(): BankImportOption[] {
  return IMPORTERS.map(({ slug, name, hint, file_extensions }) => ({
    slug,
    name,
    hint,
    file_extensions,
  }));
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
  const importer = getImporter(bankSlug);
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
      const importer = getImporter(entry.bank_slug);
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
  receiptContext?: { bank_slugs?: string[]; filenames?: string[]; unresolved?: ImportRowNote[]; account_displays?: string[]; coverage?: ImportReceipt['coverage']; resume_receipt_id?: number; confirmed_bank_accounts?: Array<Omit<BankAccountRecord, 'id'> & { id?: number }> }
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
  if (receipt && resume) {
    if (rows.length && store.saveImportReceiptRows) {
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
  const unresolved = [...(receipt?.unresolved || receiptContext?.unresolved || [])];
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

async function parseCapitalOne(content: string, accountMaskOverride?: string): Promise<ParsedBankResult> {
  const { header, rows } = readCsvWithHeader(content, [
    'transaction date',
    'description',
    'category',
    'debit',
    'credit',
  ]);
  const result: ParsedBankResult = { rows: [], skipped: [], errors: [] };
  for (const { row, lineNo } of rows) {
    const csvMask = row[header['card no.']];
    const legacyMask = historicalAccountMask(csvMask, '');
    const debit = parseAmount(row[header['debit']]);
    const credit = parseAmount(row[header['credit']]);
    if (debit <= 0 && credit > 0) {
      const accountMask = resolveAccountMask(csvMask, accountMaskOverride, '');
      if (!accountMask && accountMaskOverride === undefined) {
        result.errors.push({ line: lineNo, reason: 'missing card number' });
        continue;
      }
      try {
        const date = parseDate(row[header['transaction date']]);
        const description = normalizeDescription(row[header['description']]);
        const category = resolveCategory(description, row[header['category']]);
        await addCreditRow(result, 'capital_one', accountMask, date, description, category, credit, lineNo, '', legacyMask);
      } catch (error) {
        result.errors.push({ line: lineNo, reason: errorMessage(error) });
      }
      continue;
    }
    if (debit <= 0) {
      result.skipped.push({ line: lineNo, reason: 'no debit amount' });
      continue;
    }
    const accountMask = resolveAccountMask(csvMask, accountMaskOverride, '');
    if (!accountMask && accountMaskOverride === undefined) {
      result.errors.push({ line: lineNo, reason: 'missing card number' });
      continue;
    }
    try {
      const date = parseDate(row[header['transaction date']]);
      const description = normalizeDescription(row[header['description']]);
      const category = resolveCategory(description, row[header['category']]);
      result.rows.push(
        await parsedRow('capital_one', accountMask, date, description, category, debit, 'purchase', legacyMask)
      );
    } catch (error) {
      result.errors.push({ line: lineNo, reason: errorMessage(error) });
    }
  }
  return result;
}

async function parseChase(content: string, accountMaskOverride?: string): Promise<ParsedBankResult> {
  const { header, rows } = readCsvWithHeader(content, [
    'transaction date',
    'post date',
    'description',
    'category',
    'type',
    'amount',
    'memo',
  ]);
  const result: ParsedBankResult = { rows: [], skipped: [], errors: [] };
  for (const { row, lineNo } of rows) {
    const legacyMask = historicalAccountMask('', 'chase');
    const accountMask = resolveAccountMask('', accountMaskOverride, 'chase');
    const rowType = row[header['type']].trim().toLowerCase();
    const amountRaw = parseAmount(row[header['amount']]);
    if (amountRaw > 0) {
      try {
        const date = parseDate(row[header['transaction date']]);
        const description = normalizeDescription(row[header['description']]);
        const category = resolveCategory(description, row[header['category']]);
        await addCreditRow(result, 'chase', accountMask, date, description, category, amountRaw, lineNo, rowType, legacyMask);
      } catch (error) {
        result.errors.push({ line: lineNo, reason: errorMessage(error) });
      }
      continue;
    }
    if (rowType !== 'sale' || amountRaw >= 0) {
      const reason =
        rowType !== 'sale'
          ? `${rowType || 'unknown'} rows are not imported`
          : 'non-negative amounts are not imported as expenses';
      const kind = classifyCredit(row[header['description']], rowType);
      result.skipped.push({ line: lineNo, reason, ...(kind === 'payment' || kind === 'transfer' ? { kind } : {}) });
      continue;
    }
    try {
      const date = parseDate(row[header['transaction date']]);
      const description = normalizeDescription(row[header['description']]);
      const category = resolveCategory(description, row[header['category']]);
      result.rows.push(
        await parsedRow('chase', accountMask, date, description, category, Math.abs(amountRaw), 'purchase', legacyMask)
      );
    } catch (error) {
      result.errors.push({ line: lineNo, reason: errorMessage(error) });
    }
  }
  return result;
}

async function parseAmex(content: string, accountMaskOverride?: string): Promise<ParsedBankResult> {
  const { header, rows } = readCsvWithHeader(content, [
    'date',
    'description',
    'amount',
  ]);
  const result: ParsedBankResult = { rows: [], skipped: [], errors: [] };
  for (const { row, lineNo } of rows) {
    const csvMask = (row[header['account #']] || '').replace(/^-+/, '');
    const legacyMask = historicalAccountMask(csvMask, 'amex');
    const accountMask = resolveAccountMask(csvMask, accountMaskOverride, 'amex');
    const amount = parseAmount(row[header['amount']]);
    if (amount < 0) {
      try {
        const date = parseDate(row[header['date']]);
        const description = normalizeDescription(row[header['description']]);
        const categoryIndex = header['category'];
        const category = resolveCategory(description, categoryIndex == null ? '' : row[categoryIndex]);
        await addCreditRow(result, 'amex', accountMask, date, description, category, Math.abs(amount), lineNo, '', legacyMask);
      } catch (error) {
        result.errors.push({ line: lineNo, reason: errorMessage(error) });
      }
      continue;
    }
    if (amount === 0) {
      result.skipped.push({ line: lineNo, reason: 'zero amount is not imported' });
      continue;
    }
    try {
      const date = parseDate(row[header['date']]);
      const description = normalizeDescription(row[header['description']]);
      const categoryIndex = header['category'];
      const category = resolveCategory(description, categoryIndex == null ? '' : row[categoryIndex]);
      result.rows.push(await parsedRow('amex', accountMask, date, description, category, amount, 'purchase', legacyMask));
    } catch (error) {
      result.errors.push({ line: lineNo, reason: errorMessage(error) });
    }
  }
  return result;
}

async function parseCiti(content: string, accountMaskOverride?: string): Promise<ParsedBankResult> {
  const { header, rows } = readCsvWithHeader(content, [
    'status',
    'date',
    'description',
    'debit',
    'credit',
  ]);
  const result: ParsedBankResult = { rows: [], skipped: [], errors: [] };
  for (const { row, lineNo } of rows) {
    const csvMask = row[header['member name']] || '';
    const legacyMask = historicalAccountMask(csvMask, 'citi');
    const accountMask = resolveAccountMask(csvMask, accountMaskOverride, 'citi');
    const status = row[header['status']].trim().toLowerCase();
    if (status && status !== 'cleared') {
      result.skipped.push({ line: lineNo, reason: `${status} status is not imported` });
      continue;
    }
    const debit = parseAmount(row[header['debit']]);
    const credit = parseAmount(row[header['credit']]);
    if (debit <= 0 && credit > 0) {
      try {
        const date = parseDate(row[header['date']]);
        const description = normalizeDescription(row[header['description']]);
        await addCreditRow(result, 'citi', accountMask, date, description, resolveCategory(description), credit, lineNo, '', legacyMask);
      } catch (error) {
        result.errors.push({ line: lineNo, reason: errorMessage(error) });
      }
      continue;
    }
    if (debit <= 0) {
      result.skipped.push({ line: lineNo, reason: 'no debit amount' });
      continue;
    }
    try {
      const date = parseDate(row[header['date']]);
      const description = normalizeDescription(row[header['description']]);
      result.rows.push(
        await parsedRow('citi', accountMask, date, description, resolveCategory(description), debit, 'purchase', legacyMask)
      );
    } catch (error) {
      result.errors.push({ line: lineNo, reason: errorMessage(error) });
    }
  }
  return result;
}

async function parseBankOfAmerica(content: string, accountMaskOverride?: string): Promise<ParsedBankResult> {
  const { header, rows } = readCsvWithHeader(content, ['posted date', 'payee', 'amount']);
  const result: ParsedBankResult = { rows: [], skipped: [], errors: [] };
  for (const { row, lineNo } of rows) {
    const legacyMask = historicalAccountMask('', 'boa');
    const accountMask = resolveAccountMask('', accountMaskOverride, 'boa');
    const amountRaw = parseAmount(row[header['amount']]);
    if (amountRaw > 0) {
      try {
        const date = parseDate(row[header['posted date']]);
        const description = normalizeDescription(row[header['payee']]);
        await addCreditRow(result, 'bank_of_america', accountMask, date, description, resolveCategory(description), amountRaw, lineNo, '', legacyMask);
      } catch (error) {
        result.errors.push({ line: lineNo, reason: errorMessage(error) });
      }
      continue;
    }
    if (amountRaw === 0) {
      result.skipped.push({ line: lineNo, reason: 'zero amount is not imported' });
      continue;
    }
    try {
      const date = parseDate(row[header['posted date']]);
      const description = normalizeDescription(row[header['payee']]);
      result.rows.push(
        await parsedRow(
          'bank_of_america',
          accountMask,
          date,
          description,
          resolveCategory(description),
          Math.abs(amountRaw),
          'purchase',
          legacyMask
        )
      );
    } catch (error) {
      result.errors.push({ line: lineNo, reason: errorMessage(error) });
    }
  }
  return result;
}

async function parseXMoney(content: string, accountMaskOverride?: string): Promise<ParsedBankResult> {
  const { header, rows } = readCsvWithHeader(content, [
    'date',
    'description',
    'type',
    'category',
    'amount',
    'status',
  ]);
  const result: ParsedBankResult = { rows: [], skipped: [], errors: [] };
  for (const { row, lineNo } of rows) {
    const csvMask = row[header['account']];
    const legacyMask = historicalAccountMask(csvMask, '');
    const accountMask = resolveAccountMask(csvMask, accountMaskOverride, '');
    const rowType = row[header['type']].trim().toLowerCase();
    const status = row[header['status']].trim().toLowerCase();
    const amountRaw = parseAmount(row[header['amount']]);
    if (status === 'completed' && amountRaw > 0 && /refund|return|credit/i.test(rowType)) {
      if (!accountMask && accountMaskOverride === undefined) {
        result.errors.push({ line: lineNo, reason: 'missing account' });
        continue;
      }
      try {
        const date = parseDate(row[header['date']]);
        const description = normalizeDescription(row[header['description']]);
        const category = resolveCategory(description, row[header['category']]);
        result.rows.push(await parsedRow('x_money', accountMask, date, description, category, amountRaw, 'refund', legacyMask));
      } catch (error) {
        result.errors.push({ line: lineNo, reason: errorMessage(error) });
      }
      continue;
    }
    if (rowType !== 'card purchase' || status !== 'completed' || amountRaw >= 0) {
      const reason =
        rowType !== 'card purchase'
          ? `${rowType || 'unknown'} rows are not imported`
          : status !== 'completed'
            ? `${status || 'unknown'} status is not imported`
            : 'non-negative amounts are not imported as expenses';
      result.skipped.push({ line: lineNo, reason });
      continue;
    }
    if (!accountMask && accountMaskOverride === undefined) {
      result.errors.push({ line: lineNo, reason: 'missing account' });
      continue;
    }
    try {
      const date = parseDate(row[header['date']]);
      const description = normalizeDescription(row[header['description']]) || 'Card purchase';
      const category = resolveCategory(description, row[header['category']]);
      result.rows.push(
          await parsedRow('x_money', accountMask, date, description, category, Math.abs(amountRaw), 'purchase', legacyMask)
      );
    } catch (error) {
      result.errors.push({ line: lineNo, reason: errorMessage(error) });
    }
  }
  return result;
}

async function parsedRow(
  bankSlug: string,
  accountMask: string,
  date: string,
  description: string,
  category: string,
  amount: number,
  kind: NonNullable<ImportPreviewRow['kind']> = 'purchase',
  legacyAccountMask?: string
): Promise<ParsedBankRow> {
  const dedupeMask = legacyAccountMask ?? accountMask;
  const dedupe_key = await buildDedupeKey(bankSlug, dedupeMask, date, amount, description);
  return {
    date,
    account_mask: accountMask,
    description,
    category,
    amount: roundMoney(amount),
    dedupe_key,
    legacy_dedupe_key: legacyAccountMask ? dedupe_key : undefined,
    kind,
  };
}

function suggestMerchant(description: string): string | null {
  const cleaned = (description || '')
    .replace(/^\s*(card purchase|debit card|purchase|pos|visa|mastercard)\s*[:#-]?\s*/i, '')
    .replace(/\s+#?\d{4,}.*$/, '')
    .trim();
  if (!cleaned || cleaned.length < 2) return null;
  return cleaned.slice(0, 64);
}

async function addCreditRow(
  result: ParsedBankResult,
  bankSlug: string,
  accountMask: string,
  date: string,
  description: string,
  category: string,
  amount: number,
  line: number,
  rowType = '',
  legacyAccountMask?: string
): Promise<void> {
  const kind = classifyCredit(description, rowType);
  if (kind === 'payment' || kind === 'transfer') {
    result.skipped.push({
      line,
      reason: kind === 'payment' ? 'card payment is excluded from spending' : 'transfer is excluded from spending',
      kind,
    });
    return;
  }
  result.rows.push(await parsedRow(bankSlug, accountMask, date, description, category, amount, kind, legacyAccountMask));
}

function classifyCredit(description: string, rowType = ''): 'refund' | 'ambiguous_credit' | 'payment' | 'transfer' {
  const text = `${rowType} ${description}`.toLowerCase();
  if (/payment|autopay|thank you/.test(text)) return 'payment';
  if (/transfer|balance transfer/.test(text)) return 'transfer';
  if (/refund|return|reversal|merchant credit/.test(text) || /return|refund/.test(rowType.toLowerCase())) return 'refund';
  return 'ambiguous_credit';
}

function getImporter(slug: string): BankImporter {
  const normalized = IMPORTER_ALIASES[slug] || slug;
  const importer = IMPORTERS.find(item => item.slug === normalized);
  if (!importer) throw new Error('Unknown bank import type');
  return importer;
}

function readCsvWithHeader(content: string, required: string[]) {
  const records = parseCsv(content.replace(/^\ufeff/, ''));
  if (!records.length) throw new Error('CSV file is empty');
  const names = records[0].map(cell => cell.trim().toLowerCase());
  const missing = required.filter(name => !names.includes(name));
  if (missing.length) throw new Error(`Missing required columns: ${missing.sort().join(', ')}`);
  const header: Record<string, number> = {};
  names.forEach((name, index) => {
    header[name] = index;
  });
  const rows = records.slice(1)
    .map((row, index) => ({ row: padRow(row, names.length), lineNo: index + 2 }))
    .filter(({ row }) => row.some(cell => cell.trim()));
  return { header, rows };
}

function parseCsv(content: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;
  for (let i = 0; i < content.length; i += 1) {
    const ch = content[i];
    if (ch === '"') {
      if (inQuotes && content[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      row.push(cell);
      cell = '';
    } else if ((ch === '\n' || ch === '\r') && !inQuotes) {
      if (ch === '\r' && content[i + 1] === '\n') i += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += ch;
    }
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

function padRow(row: string[], length: number): string[] {
  return row.length >= length ? row : [...row, ...Array.from({ length: length - row.length }, () => '')];
}

function parseDate(raw: string): string {
  const value = (raw || '').trim();
  let match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (match) return `${match[1]}-${match[2]}-${match[3]}`;
  match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value);
  if (match) {
    return `${match[3]}-${match[1].padStart(2, '0')}-${match[2].padStart(2, '0')}`;
  }
  throw new Error(`Unrecognized date: ${JSON.stringify(value)}`);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function parseAmount(raw: string): number {
  let value = (raw || '').trim().replace(/[$,]/g, '');
  if (!value) return 0;
  if (value.startsWith('(') && value.endsWith(')')) value = `-${value.slice(1, -1)}`;
  return roundMoney(Number(value));
}

function roundMoney(value: number): number {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function normalizeDescription(text: string): string {
  return (text || '').trim().replace(/\s+/g, ' ');
}

function resolveAccountMask(csvValue: string | undefined, override: string | undefined, fallback: string): string {
  const parsed = csvValue?.trim() || '';
  if (parsed) return parsed;
  const selected = override?.trim() || '';
  if (selected) return selected;
  return fallback;
}

function historicalAccountMask(csvValue: string | undefined, fallback: string): string | undefined {
  const parsed = csvValue?.trim() || '';
  return parsed || fallback.trim() || undefined;
}

function resolveCategory(description: string, bankCategory = ''): string {
  if (`${description} ${bankCategory}`.toLowerCase().includes('costco')) return 'Costco';
  return bankCategory.trim() || 'Uncategorized';
}

function accountDisplay(bankName: string, accountMask: string): string {
  return `${bankName} ···${accountMask}`;
}

async function buildDedupeKey(
  bankSlug: string,
  accountMask: string,
  date: string,
  amount: number,
  description: string
): Promise<string> {
  const payload = [
    bankSlug,
    accountMask.trim(),
    date,
    roundMoney(amount).toFixed(2),
    normalizeDescription(description).toLowerCase(),
  ].join('|');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(digest))
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');
}
