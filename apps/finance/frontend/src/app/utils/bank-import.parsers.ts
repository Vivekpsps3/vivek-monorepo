import { BankImportOption, CustomCsvMapping, ImportPreviewRow, ImportRowNote } from '../models/transaction.model';

export interface ParsedBankRow {
  date: string;
  account_mask: string;
  description: string;
  category: string;
  amount: number;
  dedupe_key: string;
  legacy_dedupe_key?: string;
  kind: NonNullable<ImportPreviewRow['kind']>;
  /** The account cell identifies this row, so the file-level account must not replace it. */
  row_account?: boolean;
}

export interface ParsedBankResult {
  rows: ParsedBankRow[];
  skipped: ImportRowNote[];
  errors: ImportRowNote[];
}

export interface BankImporter {
  slug: string;
  name: string;
  hint: string;
  file_extensions: string[];
  parse(content: string, accountMaskOverride?: string): Promise<ParsedBankResult>;
}


const IMPORTERS: BankImporter[] = [
  {
    slug: 'capital_one',
    name: 'Capital One',
    hint: 'Capital One credit card CSV. Uses Transaction Date, Description, Category, and Debit. Card No. is optional when you select an account. Refunds are classified; payments and transfers are excluded; unclear credits stay out of totals until classified.',
    file_extensions: ['.csv'],
    parse: parseCapitalOne,
  },
  {
    slug: 'chase',
    name: 'Chase',
    hint: 'Chase credit card CSV. Uses Transaction Date, Description, Category, Type, and Amount. Purchases are imported; refunds are classified; payments and transfers are excluded; unclear credits stay out of totals until classified.',
    file_extensions: ['.csv'],
    parse: parseChase,
  },
  {
    slug: 'amex',
    name: 'American Express',
    hint: 'American Express credit card CSV. Uses Date, Description, Amount, and optional Category. Account # is optional when you select an account. Purchases are imported; refunds are classified; payments and transfers are excluded; unclear credits stay out of totals until classified.',
    file_extensions: ['.csv'],
    parse: parseAmex,
  },
  {
    slug: 'citi',
    name: 'Citi',
    hint: 'Citi credit card CSV. Uses Status, Date, Description, Debit, and Credit. Member Name is optional when you select an account. Cleared purchases are imported; refunds are classified; payments and transfers are excluded; unclear credits stay out of totals until classified.',
    file_extensions: ['.csv'],
    parse: parseCiti,
  },
  {
    slug: 'bank_of_america',
    name: 'Bank of America',
    hint: 'Bank of America credit card CSV. Uses Posted Date, Payee, and Amount. Purchases are imported; refunds are classified; payments and transfers are excluded; unclear credits stay out of totals until classified.',
    file_extensions: ['.csv'],
    parse: parseBankOfAmerica,
  },
  {
    slug: 'x_money',
    name: 'X Money',
    hint: 'X Money CSV. Uses Date, Description, Type, Category, Amount, and Status. Account is optional when you select an account. Completed purchases and recognized refunds are imported; other rows are skipped.',
    file_extensions: ['.csv'],
    parse: parseXMoney,
  },
  {
    slug: 'custom_csv',
    name: 'Custom CSV',
    hint: 'Map date, description, and amount or debit and credit columns. A currency column must be USD. Refunds follow the description or the sign you choose.',
    file_extensions: ['.csv'],
    parse: async () => {
      throw new Error('Choose the date, description, and amount columns before preview.');
    },
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
  legacyAccountMask?: string,
  rowAccount = false
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
    row_account: rowAccount || undefined,
  };
}

export function suggestMerchant(description: string): string | null {
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
  legacyAccountMask?: string,
  rowAccount = false
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
  result.rows.push(await parsedRow(bankSlug, accountMask, date, description, category, amount, kind, legacyAccountMask, rowAccount));
}

function classifyCredit(description: string, rowType = ''): 'refund' | 'ambiguous_credit' | 'payment' | 'transfer' {
  const text = `${rowType} ${description}`.toLowerCase();
  if (/payment|autopay|thank you/.test(text)) return 'payment';
  if (/transfer|balance transfer/.test(text)) return 'transfer';
  if (/refund|return|reversal|merchant credit/.test(text) || /return|refund/.test(rowType.toLowerCase())) return 'refund';
  return 'ambiguous_credit';
}

const CSV_DELIMITERS = [',', ';', '\t', '|'] as const;
export type CsvDelimiter = (typeof CSV_DELIMITERS)[number];

export interface CustomCsvShape {
  delimiter: CsvDelimiter;
  headers: string[];
  header_row: boolean;
  sample_date: string;
}

export function detectCsvDelimiter(content: string): CsvDelimiter {
  const counts: Record<CsvDelimiter, number> = { ',': 0, ';': 0, '\t': 0, '|': 0 };
  let inQuotes = false;
  for (let i = 0; i < content.length; i += 1) {
    const ch = content[i];
    if (ch === '"') {
      if (inQuotes && content[i + 1] === '"') {
        i += 1;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }
    if (!inQuotes && (ch === '\n' || ch === '\r')) break;
    if (!inQuotes && (ch === ',' || ch === ';' || ch === '\t' || ch === '|')) counts[ch] += 1;
  }
  let best: CsvDelimiter = ',';
  let bestCount = 0;
  for (const delimiter of CSV_DELIMITERS) {
    if (counts[delimiter] > bestCount) {
      best = delimiter;
      bestCount = counts[delimiter];
    }
  }
  return best;
}

function csvRecords(content: string): { delimiter: CsvDelimiter; records: string[][] } {
  const text = content.replace(/^\ufeff/, '');
  const delimiter = detectCsvDelimiter(text);
  return { delimiter, records: parseCsv(text, delimiter) };
}

function looksLikeHeader(cells: string[]): boolean {
  const filled = cells.map(cell => cell.trim()).filter(Boolean);
  if (!filled.length) return false;
  const dataLike = (cell: string) => /^\d{4}-\d{2}-\d{2}$/.test(cell)
    || /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(cell)
    || /^-?\(?\$?\d[\d,]*(\.\d+)?\)?$/.test(cell);
  if (filled.every(dataLike)) return false;
  return filled.some(cell => /[A-Za-z]/.test(cell));
}

function headerNames(cells: string[], useRow: boolean, width: number): string[] {
  const count = Math.max(width, cells.length, 1);
  if (!useRow) return Array.from({ length: count }, (_, index) => `Column ${index + 1}`);
  const seen = new Map<string, number>();
  return Array.from({ length: count }, (_, index) => {
    const base = (cells[index] || '').trim() || `Column ${index + 1}`;
    const next = (seen.get(base) || 0) + 1;
    seen.set(base, next);
    return next === 1 ? base : `${base} (${next})`;
  });
}

export function inspectCustomCsv(content: string): CustomCsvShape {
  if (!content.replace(/^\ufeff/, '').trim()) throw new Error('CSV file is empty');
  const { delimiter, records } = csvRecords(content);
  const filled = records.filter(row => row.some(cell => cell.trim()));
  if (!filled.length) throw new Error('CSV file is empty');
  const width = Math.max(...filled.map(row => row.length));
  const header_row = looksLikeHeader(filled[0]);
  const headers = headerNames(filled[0], header_row, width);
  const sample = (header_row ? filled[1] : filled[0]) || [];
  const dateIndex = headers.findIndex(header => /date/i.test(header));
  return {
    delimiter,
    headers,
    header_row,
    sample_date: (sample[dateIndex >= 0 ? dateIndex : 0] || '').trim(),
  };
}

export function customCsvHeaders(content: string, headerRow: boolean): string[] {
  const { records } = csvRecords(content);
  const width = Math.max(1, ...records.map(row => row.length));
  return headerNames(records[0] || [], headerRow, width);
}

function sniffDateFormat(value: string): CustomCsvMapping['date_format'] {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value.trim())) return 'iso';
  return 'mdy';
}

function headerByName(headers: string[], ...names: string[]): string {
  return headers.find(header => names.includes(header.trim().toLowerCase())) || '';
}

export function suggestCustomCsvMapping(shape: CustomCsvShape): CustomCsvMapping {
  const date = headerByName(shape.headers, 'date', 'transaction date', 'posted date', 'post date');
  const description = headerByName(shape.headers, 'description', 'details', 'payee', 'memo', 'name');
  const amount = headerByName(shape.headers, 'amount');
  const debit = headerByName(shape.headers, 'debit');
  const credit = headerByName(shape.headers, 'credit');
  const split = !amount && !!debit && !!credit;
  return {
    version: 1,
    date_column: date,
    description_column: description,
    amount_column: split ? undefined : amount,
    debit_column: split ? debit : undefined,
    credit_column: split ? credit : undefined,
    account_column: headerByName(shape.headers, 'account', 'account name', 'account #') || undefined,
    category_column: headerByName(shape.headers, 'category') || undefined,
    currency_column: headerByName(shape.headers, 'currency') || undefined,
    date_format: sniffDateFormat(shape.sample_date),
    amount_mode: split ? 'debit_credit' : 'signed',
    outflow_sign: 'negative',
    refund_mode: 'description',
    header_row: shape.header_row,
  };
}

function columnIndex(headers: string[], name: string | undefined): number {
  if (!name) return -1;
  const exact = headers.indexOf(name);
  if (exact >= 0) return exact;
  const lower = name.trim().toLowerCase();
  return headers.findIndex(header => header.trim().toLowerCase() === lower);
}

export function customMappingProblems(mapping: CustomCsvMapping | undefined, headers: string[] = []): string | null {
  if (!mapping || mapping.version !== 1) return 'Choose a supported mapping profile.';
  if (!mapping.date_column) return 'Choose a date column before preview.';
  if (!mapping.description_column) return 'Choose a description column before preview.';
  if (mapping.amount_mode === 'debit_credit') {
    if (!mapping.debit_column || !mapping.credit_column) return 'Choose the debit and credit columns before preview.';
  } else if (!mapping.amount_column) {
    return 'Choose an amount column before preview.';
  }
  const required: Array<[string | undefined, string]> = [
    [mapping.date_column, 'date'],
    [mapping.description_column, 'description'],
    [mapping.amount_column, 'amount'],
    [mapping.debit_column, 'debit'],
    [mapping.credit_column, 'credit'],
    [mapping.account_column, 'account'],
    [mapping.category_column, 'category'],
    [mapping.currency_column, 'currency'],
  ];
  if (headers.length) {
    for (const [name, label] of required) {
      if (name && columnIndex(headers, name) < 0) return `Choose a ${label} column that exists in this file.`;
    }
  }
  return null;
}

function parseMappedDate(raw: string, format: CustomCsvMapping['date_format']): string {
  const value = (raw || '').trim();
  if (format === 'dmy') {
    const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value);
    if (!match) throw new Error(`Unrecognized date: ${JSON.stringify(value)}`);
    return parseDate(`${match[2]}/${match[1]}/${match[3]}`);
  }
  if (format === 'iso' && !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`Unrecognized date: ${JSON.stringify(value)}`);
  }
  if (format === 'mdy' && !/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(value)) {
    throw new Error(`Unrecognized date: ${JSON.stringify(value)}`);
  }
  return parseDate(value);
}

function currencyVerdict(raw: string): 'USD' | 'missing' | 'unsupported' {
  const value = raw.trim().toUpperCase().replace(/\s+/g, ' ');
  if (!value) return 'missing';
  if (value === 'USD' || value === 'US$' || value === '$' || value === 'US DOLLAR' || value === 'US DOLLARS') return 'USD';
  return 'unsupported';
}

export async function parseCustomCsv(content: string, mapping: CustomCsvMapping): Promise<ParsedBankResult> {
  const problem = customMappingProblems(mapping);
  if (problem) throw new Error(problem);
  if (!content.replace(/^\ufeff/, '').trim()) throw new Error('CSV file is empty');
  const { records } = csvRecords(content);
  if (!records.some(row => row.some(cell => cell.trim()))) throw new Error('CSV file is empty');
  const width = Math.max(1, ...records.map(row => row.length));
  const headers = headerNames(records[0] || [], mapping.header_row !== false, width);
  const mapped = customMappingProblems(mapping, headers);
  if (mapped) throw new Error(mapped);
  const rows = records
    .map((row, index) => ({ row: padRow(row, headers.length), lineNo: index + 1 }))
    .slice(mapping.header_row === false ? 0 : 1)
    .filter(({ row }) => row.some(cell => cell.trim()));
  if (!rows.length) throw new Error('CSV file is empty');
  const result: ParsedBankResult = { rows: [], skipped: [], errors: [] };
  const cell = (row: string[], name: string | undefined) => {
    const index = columnIndex(headers, name);
    return index < 0 ? '' : (row[index] || '');
  };
  for (const { row, lineNo } of rows) {
    const currencyName = mapping.currency_column;
    if (currencyName) {
      const verdict = currencyVerdict(cell(row, currencyName));
      if (verdict !== 'USD') {
        const code = cell(row, currencyName).trim();
        result.errors.push({
          line: lineNo,
          reason: verdict === 'missing'
            ? 'missing currency. Finance records USD only.'
            : `unsupported currency ${code || 'blank'}. Finance records USD only.`,
        });
        continue;
      }
    }
    const description = normalizeDescription(cell(row, mapping.description_column));
    if (!description) {
      result.errors.push({ line: lineNo, reason: 'missing description' });
      continue;
    }
    const accountName = mapping.account_column;
    const accountCell = accountName ? cell(row, accountName).trim() : '';
    if (accountName && !accountCell) {
      result.errors.push({ line: lineNo, reason: 'missing account' });
      continue;
    }
    try {
      const date = parseMappedDate(cell(row, mapping.date_column), mapping.date_format);
      const category = resolveCategory(description, mapping.category_column ? cell(row, mapping.category_column) : '');
      const accountMask = accountCell || 'custom';
      if (mapping.amount_mode === 'debit_credit') {
        const debit = parseAmount(cell(row, mapping.debit_column));
        const credit = parseAmount(cell(row, mapping.credit_column));
        if (debit > 0 && credit > 0) {
          result.errors.push({ line: lineNo, reason: 'a row cannot have both a debit and a credit.' });
          continue;
        }
        if (debit <= 0 && credit <= 0) {
          result.skipped.push({ line: lineNo, reason: 'zero amount is not imported' });
          continue;
        }
        if (debit > 0) {
          result.rows.push(await parsedRow('custom_csv', accountMask, date, description, category, debit, 'purchase', undefined, !!accountName));
        } else {
          await pushCustomCredit(result, accountMask, date, description, category, credit, lineNo, mapping, !!accountName);
        }
        continue;
      }
      const signed = parseAmount(cell(row, mapping.amount_column));
      if (!signed) {
        result.skipped.push({ line: lineNo, reason: 'zero amount is not imported' });
        continue;
      }
      const outflow = mapping.outflow_sign === 'positive' ? signed > 0 : signed < 0;
      if (outflow) {
        result.rows.push(await parsedRow('custom_csv', accountMask, date, description, category, Math.abs(signed), 'purchase', undefined, !!accountName));
      } else {
        await pushCustomCredit(result, accountMask, date, description, category, Math.abs(signed), lineNo, mapping, !!accountName);
      }
    } catch (error) {
      result.errors.push({ line: lineNo, reason: errorMessage(error) });
    }
  }
  return result;
}

async function pushCustomCredit(
  result: ParsedBankResult,
  accountMask: string,
  date: string,
  description: string,
  category: string,
  amount: number,
  line: number,
  mapping: CustomCsvMapping,
  rowAccount: boolean
): Promise<void> {
  if (mapping.refund_mode === 'inflow') {
    const kind = classifyCredit(description);
    if (kind === 'payment' || kind === 'transfer') {
      result.skipped.push({
        line,
        reason: kind === 'payment' ? 'card payment is excluded from spending' : 'transfer is excluded from spending',
        kind,
      });
      return;
    }
    result.rows.push(await parsedRow('custom_csv', accountMask, date, description, category, amount, 'refund', undefined, rowAccount));
    return;
  }
  await addCreditRow(result, 'custom_csv', accountMask, date, description, category, amount, line, '', undefined, rowAccount);
}

export function getBankImporter(slug: string): BankImporter {
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

function parseCsv(content: string, delimiter = ','): string[][] {
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
    } else if (ch === delimiter && !inQuotes) {
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

export function errorMessage(error: unknown): string {
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

export function accountDisplay(bankName: string, accountMask: string): string {
  return `${bankName} ···${accountMask}`;
}

export async function buildDedupeKey(
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
