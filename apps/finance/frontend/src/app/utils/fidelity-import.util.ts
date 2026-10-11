import {
  FidelityCommitResult,
  FidelityImportOption,
  FidelityPreviewResult,
  FidelityPreviewRow,
  Holding,
} from '../models/transaction.model';

export interface BrokerageAccountRecord {
  id: number;
  broker_slug: string;
  broker_name: string;
  account_mask: string;
  account_name?: string;
  nickname?: string | null;
  label?: string | null;
}

export type FidelityValuationSource =
  | 'reported_price'
  | 'derived_market_value'
  | 'provisional_cost_basis'
  | 'unavailable';

export interface FidelityAccountReplacementPreview {
  account_mask: string;
  account_display: string;
  existing_market_value: number | null;
  replacement_market_value: number | null;
  change: number | null;
  replacement_unvalued_positions: number;
  replacement_provisional_positions: number;
}

export interface FidelityStageRecord {
  id: number;
  source: 'fidelity';
  filename: string;
  status: 'staged' | 'verified' | 'activated' | 'interrupted';
  account_masks: string[];
  expected_row_count: number;
  selected_rows?: FidelityPreviewRow[];
  account_replacements: FidelityAccountReplacementPreview[];
  created_at: string;
  verified_at?: string | null;
  activated_at?: string | null;
  cleanup_complete?: boolean;
  error?: string | null;
}

export interface FidelityStageRow extends FidelityPreviewRow {
  brokerage_account_id: number;
  account_display: string;
  purchase_price: number | null;
  purchase_date: string | null;
  current_price: number | null;
  value: number | null;
  price_source: string;
  price_as_of: string | null;
  quote_date: string | null;
  position_as_of: string | null;
  cost_basis_status: 'known' | 'unknown';
  lifecycle_status: 'staged';
  portfolio_row_index: number;
}

export interface EncryptedFidelityStore {
  getHoldings(): Promise<Holding[]>;
  getBrokerageAccounts(): Promise<BrokerageAccountRecord[]>;
  upsertBrokerageAccount(
    body: Omit<BrokerageAccountRecord, 'id'> & { id?: number }
  ): Promise<BrokerageAccountRecord>;
  createHoldingImportStage(
    body: Omit<FidelityStageRecord, 'id' | 'selected_rows'>,
    rows: FidelityStageRow[]
  ): Promise<FidelityStageRecord>;
  getHoldingImportStages(): Promise<FidelityStageRecord[]>;
  getHoldingImportStageRows(stageId: number): Promise<FidelityPreviewRow[]>;
  verifyHoldingImportStage(stageId: number): Promise<FidelityStageRecord>;
  activateHoldingImportStage(stageId: number): Promise<FidelityCommitResult>;
}

interface ParsedFidelityRow {
  account_mask: string;
  account_name: string;
  symbol: string;
  shares: number;
  avg_cost_basis: number | null;
  cost_basis_total: number | null;
  market_price: number | null;
  market_value: number | null;
  position_as_of: string | null;
  valuation_source: FidelityValuationSource;
}

interface CsvRecord {
  row: string[];
  lineNo: number;
}

const FIDELITY_OPTION: FidelityImportOption = {
  slug: 'fidelity',
  name: 'Fidelity',
  hint: 'Fidelity positions CSV. Market price and market value are optional; imports preview each valuation source before activating account replacements.',
  file_extensions: ['.csv'],
};

const HEADER_ALIASES: Record<string, string[]> = {
  account_number: ['account number', 'account'],
  account_name: ['account name', 'account title', 'name'],
  symbol: ['symbol', 'ticker'],
  quantity: ['quantity', 'shares', 'share quantity'],
  average_cost_basis: ['average cost basis', 'avg cost basis', 'cost basis per share'],
  total_cost_basis: ['total cost basis', 'cost basis total'],
  market_price: ['last price', 'current price', 'market price', 'price'],
  market_value: ['current value', 'market value', 'value'],
  position_as_of: ['position date', 'as of date', 'date as of', 'valuation date', 'priced as of'],
};

const REQUIRED_HEADERS = ['account_number', 'symbol', 'quantity'];

export function listClientBrokerageImports(): FidelityImportOption[] {
  return [FIDELITY_OPTION];
}

export function buildFidelityImportPreview(filename: string, content: string): FidelityPreviewResult {
  const parsed = parseFidelityCsv(content);
  const grouped = new Map<string, ParsedFidelityRow[]>();
  for (const row of parsed) {
    const list = grouped.get(row.account_mask) || [];
    list.push(row);
    grouped.set(row.account_mask, list);
  }

  const accounts: string[] = [];
  const rows: FidelityPreviewRow[] = [];
  let knownCostTotal = 0;
  let allCostKnown = true;
  let knownMarketTotal = 0;
  let allMarketValuesKnown = true;
  let provisionalPositions = 0;
  let unavailablePositions = 0;
  let unknownBasisPositions = 0;

  for (const [mask, accountRows] of grouped) {
    accounts.push(accountDisplay(mask));
    for (const row of accountRows) {
      if (row.cost_basis_total == null) {
        allCostKnown = false;
        unknownBasisPositions += 1;
      } else {
        knownCostTotal += row.cost_basis_total;
      }
      if (row.market_value == null) {
        allMarketValuesKnown = false;
        unavailablePositions += 1;
      } else {
        knownMarketTotal += row.market_value;
      }
      if (row.valuation_source === 'provisional_cost_basis') provisionalPositions += 1;
      rows.push({
        account_mask: row.account_mask,
        account_display: accountDisplay(row.account_mask, row.account_name),
        symbol: row.symbol,
        shares: row.shares,
        avg_cost_basis: row.avg_cost_basis,
        cost_basis_total: row.cost_basis_total,
        market_price: row.market_price,
        market_value: row.market_value,
        position_as_of: row.position_as_of,
        valuation_source: row.valuation_source,
        status: 'replace',
      } as FidelityPreviewRow);
    }
  }

  return {
    broker: FIDELITY_OPTION.name,
    filename,
    accounts,
    rows,
    summary: {
      accounts: grouped.size,
      positions: rows.length,
      total_cost: allCostKnown ? roundMoney(knownCostTotal) : null,
      known_cost_total: roundMoney(knownCostTotal),
      total_market_value: allMarketValuesKnown ? roundMoney(knownMarketTotal) : null,
      provisional_positions: provisionalPositions,
      unavailable_positions: unavailablePositions,
      unknown_basis_positions: unknownBasisPositions,
    },
  } as FidelityPreviewResult;
}

export function parseFidelityCsv(content: string): ParsedFidelityRow[] {
  const { header, rows } = readCsvWithHeader(content, REQUIRED_HEADERS);
  const out: ParsedFidelityRow[] = [];
  for (const { row } of rows) {
    const accountMask = cell(row, header['account_number']).trim();
    const accountName = cell(row, header['account_name']).trim() || accountMask;
    const symbol = cell(row, header['symbol']).trim().toUpperCase().replace(/\*\*/g, '');
    const shares = parseOptionalAmount(cell(row, header['quantity']));
    if (!accountMask || shares == null || shares <= 0 || !symbol) continue;

    const averageCost = nonNegativeAmount(parseOptionalAmount(cell(row, header['average_cost_basis'])));
    const reportedTotalCost = nonNegativeAmount(parseOptionalAmount(cell(row, header['total_cost_basis'])));
    const costBasis = averageCost ?? (reportedTotalCost == null ? null : reportedTotalCost / shares);
    const costBasisTotal = reportedTotalCost ?? (costBasis == null ? null : shares * costBasis);

    const reportedPrice = positiveAmount(parseOptionalAmount(cell(row, header['market_price'])));
    const reportedMarketValue = nonNegativeAmount(parseOptionalAmount(cell(row, header['market_value'])));
    let marketPrice = reportedPrice;
    let marketValue = reportedMarketValue;
    let valuationSource: FidelityValuationSource;

    if (reportedPrice != null) {
      marketValue ??= shares * reportedPrice;
      valuationSource = 'reported_price';
    } else if (reportedMarketValue != null) {
      marketPrice = reportedMarketValue / shares;
      valuationSource = 'derived_market_value';
    } else if (costBasis != null && costBasis > 0) {
      marketPrice = costBasis;
      marketValue = shares * costBasis;
      valuationSource = 'provisional_cost_basis';
    } else {
      marketPrice = null;
      marketValue = null;
      valuationSource = 'unavailable';
    }

    out.push({
      account_mask: accountMask,
      account_name: accountName,
      symbol,
      shares: roundShares(shares),
      avg_cost_basis: averageCost == null ? (reportedTotalCost == null ? null : roundCost(reportedTotalCost / shares)) : roundCost(averageCost),
      cost_basis_total: costBasisTotal == null ? null : roundMoney(costBasisTotal),
      market_price: marketPrice == null ? null : roundCost(marketPrice),
      market_value: marketValue == null ? null : roundMoney(marketValue),
      position_as_of: parsePositionDate(cell(row, header['position_as_of'])),
      valuation_source: valuationSource,
    });
  }
  return out;
}

export function replacementPreviewForAccounts(
  rows: FidelityPreviewRow[],
  currentHoldings: Holding[],
  selectedMasks: Set<string> = new Set(rows.map(row => row.account_mask)),
  brokerageAccounts: BrokerageAccountRecord[] = [],
): FidelityAccountReplacementPreview[] {
  const selectedRows = rows.filter(row => selectedMasks.has(normalizeMask(row.account_mask)));
  const accounts = new Map<string, FidelityPreviewRow[]>();
  for (const row of selectedRows) {
    const mask = normalizeMask(row.account_mask);
    const list = accounts.get(mask) || [];
    list.push(row);
    accounts.set(mask, list);
  }

  return Array.from(accounts, ([mask, accountRows]) => {
    const existing = currentHoldings.filter(holding => holdingBelongsToMask(holding, mask, brokerageAccounts));
    const existingTotal = totalKnownMarketValue(existing);
    const replacementTotal = totalPreviewMarketValue(accountRows);
    const existingValue = existingTotal.complete ? roundMoney(existingTotal.value) : null;
    const replacementValue = replacementTotal.complete ? roundMoney(replacementTotal.value) : null;
    return {
      account_mask: mask,
      account_display: accountDisplay(mask),
      existing_market_value: existingValue,
      replacement_market_value: replacementValue,
      change: existingValue == null || replacementValue == null ? null : roundMoney(replacementValue - existingValue),
      replacement_unvalued_positions: accountRows.filter(row => row.market_value == null).length,
      replacement_provisional_positions: accountRows.filter(row => row.valuation_source === 'provisional_cost_basis').length,
    };
  });
}

export async function stageFidelityImportRows(
  store: EncryptedFidelityStore,
  filename: string,
  rows: FidelityPreviewRow[],
  selectedAccountMasks: string[] = Array.from(new Set(rows.map(row => row.account_mask))),
): Promise<FidelityStageRecord> {
  const masks = Array.from(new Set(selectedAccountMasks.map(normalizeMask).filter(Boolean)));
  const selectedRows = rows.filter(row => masks.includes(normalizeMask(row.account_mask)));
  if (!selectedRows.length || !masks.length) throw new Error('Select at least one Fidelity account with positions.');

  const [existingAccounts, holdings] = await Promise.all([
    store.getBrokerageAccounts(),
    store.getHoldings(),
  ]);
  const accountMap = new Map<string, BrokerageAccountRecord>();
  for (const mask of masks) {
    const normalized = normalizeMask(mask);
    let account = existingAccounts.find(candidate =>
      normalizeMask(candidate.account_mask) === normalized && isFidelityAccount(candidate, holdings)
    );
    if (!account) {
      account = await store.upsertBrokerageAccount({
        broker_slug: 'fidelity',
        broker_name: 'Fidelity',
        account_mask: normalized,
        account_name: normalized,
        nickname: null,
        label: accountDisplay(normalized),
      });
    } else if (!account.broker_slug) {
      account = await store.upsertBrokerageAccount({
        ...account,
        broker_slug: 'fidelity',
        broker_name: account.broker_name || 'Fidelity',
        account_mask: normalized,
        label: account.label || accountDisplay(normalized),
      });
    }
    accountMap.set(normalized, account);
  }

  const replacementRows = replacementPreviewForAccounts(selectedRows, holdings, new Set(masks), existingAccounts);
  const createdAt = new Date().toISOString();
  const stageRows = selectedRows.map((row, portfolioRowIndex) => {
    const mask = normalizeMask(row.account_mask);
    const account = accountMap.get(mask)!;
    const priceSource = row.valuation_source === 'reported_price'
      ? 'import_market_price'
      : row.valuation_source === 'derived_market_value'
        ? 'import_market_value'
        : row.valuation_source === 'provisional_cost_basis'
          ? 'provisional_cost_basis'
          : 'unavailable';
    return {
      ...row,
      account_mask: mask,
      account_display: displayForAccount(account),
      brokerage_account_id: Number(account.id),
      purchase_price: row.avg_cost_basis ?? null,
      purchase_date: null,
      current_price: row.market_price ?? null,
      value: row.market_value ?? null,
      price_source: priceSource,
      price_as_of: null,
      quote_date: null,
      position_as_of: row.position_as_of ?? null,
      cost_basis_status: row.avg_cost_basis == null ? 'unknown' as const : 'known' as const,
      lifecycle_status: 'staged' as const,
      portfolio_row_index: portfolioRowIndex,
    } satisfies FidelityStageRow;
  });

  return store.createHoldingImportStage({
    source: 'fidelity',
    filename,
    status: 'staged',
    account_masks: masks,
    expected_row_count: stageRows.length,
    account_replacements: replacementRows,
    created_at: createdAt,
    verified_at: null,
    activated_at: null,
    error: null,
  }, stageRows);
}

export async function resumeFidelityImportStage(
  store: EncryptedFidelityStore,
  stageId: number,
): Promise<FidelityCommitResult> {
  const stage = (await store.getHoldingImportStages()).find(row => row.id === stageId);
  if (!stage) throw new Error('Fidelity import stage not found.');
  if (stage.status === 'activated' && stage.cleanup_complete !== false) {
    return {
      accounts_replaced: stage.account_masks.length,
      holdings_replaced: 0,
      inserted: stage.expected_row_count,
      accounts: stage.account_replacements.map(row => row.account_display),
      stage_id: stage.id,
      status: stage.status,
    } as FidelityCommitResult;
  }

  const verified = await store.verifyHoldingImportStage(stageId);
  if (verified.status !== 'verified' && verified.status !== 'activated') {
    throw new Error(verified.error || 'Fidelity import stage could not be verified.');
  }
  const result = await store.activateHoldingImportStage(stageId);
  if (result.status !== 'activated') {
    throw new Error('Fidelity import stage was not activated.');
  }
  return result;
}

export async function getResumableFidelityStages(store: EncryptedFidelityStore): Promise<FidelityStageRecord[]> {
  return (await store.getHoldingImportStages())
    .filter(stage => stage.status === 'staged' || stage.status === 'verified' || stage.status === 'interrupted'
      || (stage.status === 'activated' && stage.cleanup_complete === false))
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export async function commitFidelityImportRows(
  store: EncryptedFidelityStore,
  rows: FidelityPreviewRow[],
  selectedAccountMasks?: string[],
  filename = 'Fidelity positions CSV',
): Promise<FidelityCommitResult> {
  const stage = await stageFidelityImportRows(store, filename, rows, selectedAccountMasks);
  return resumeFidelityImportStage(store, stage.id);
}

function normalizeMask(mask: string | null | undefined): string {
  return String(mask || '').trim();
}

function holdingBelongsToMask(holding: Holding, mask: string, accounts: BrokerageAccountRecord[]): boolean {
  const display = String(holding.account_display || '');
  if (holding.brokerage_account_id != null) {
    const linked = accounts.find(account => Number(account.id) === Number(holding.brokerage_account_id));
    if (linked) {
      return normalizeMask(linked.account_mask) === mask && isFidelityAccount(linked, [holding]);
    }
  }
  return isFidelityDisplay(display) && display.includes(mask);
}

function isFidelityAccount(account: BrokerageAccountRecord, holdings: Holding[]): boolean {
  const slug = String(account.broker_slug || '').trim().toLowerCase();
  if (slug) return slug === 'fidelity';
  const brokerName = String(account.broker_name || '').trim().toLowerCase();
  if (brokerName) return brokerName === 'fidelity';
  const label = String(account.label || '').trim();
  if (label) return isFidelityDisplay(label);
  return holdings.some(holding =>
    Number(holding.brokerage_account_id) === Number(account.id) && isFidelityDisplay(String(holding.account_display || ''))
  );
}

function isFidelityDisplay(value: string): boolean {
  return /^\s*fidelity\b/i.test(value);
}

function totalKnownMarketValue(rows: Holding[]): { value: number; complete: boolean } {
  let value = 0;
  let complete = true;
  for (const holding of rows) {
    const marketValue = holding.value ?? (
      holding.current_price == null ? null : Number(holding.current_price) * Number(holding.shares)
    );
    if (marketValue == null || !Number.isFinite(Number(marketValue))) complete = false;
    else value += Number(marketValue);
  }
  return { value, complete };
}

function totalPreviewMarketValue(rows: FidelityPreviewRow[]): { value: number; complete: boolean } {
  let value = 0;
  let complete = true;
  for (const row of rows) {
    const marketValue = (row as any).market_value as number | null | undefined;
    if (marketValue == null || !Number.isFinite(Number(marketValue))) complete = false;
    else value += Number(marketValue);
  }
  return { value, complete };
}

function accountDisplay(mask: string, name?: string): string {
  const label = 'Fidelity ···' + mask;
  const accountName = String(name || '').trim();
  return accountName && accountName !== mask ? label + ' (' + accountName + ')' : label;
}

function displayForAccount(acc: BrokerageAccountRecord): string {
  if (acc.nickname?.trim()) return acc.nickname.trim();
  if (acc.label?.trim()) return acc.label.trim();
  return accountDisplay(acc.account_mask, acc.account_name);
}

function readCsvWithHeader(content: string, required: string[]) {
  const records = parseCsv(content.replace(/^\ufeff/, ''));
  if (!records.length) throw new Error('CSV file is empty');
  const headerMap: Record<string, number> = {};
  records[0].forEach((name, index) => {
    headerMap[normalizeHeader(name)] = index;
  });

  const header: Record<string, number | undefined> = {};
  for (const [key, aliases] of Object.entries(HEADER_ALIASES)) {
    header[key] = aliases
      .map(alias => headerMap[normalizeHeader(alias)])
      .find(index => index != null);
  }
  const missing = required.filter(key => header[key] == null);
  if (missing.length) throw new Error('Missing required columns: ' + missing.map(key => HEADER_ALIASES[key][0]).sort().join(', '));

  const rows: CsvRecord[] = records
    .slice(1)
    .map((row, index) => ({ row: padRow(row, records[0].length), lineNo: index + 2 }))
    .filter(({ row }) => row.some(cell => cell.trim()));
  return { header, rows };
}

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ').replace(/\s*\([^)]*\)\s*/g, ' ').trim();
}

function cell(row: string[], index: number | undefined): string {
  return index == null ? '' : String(row[index] || '');
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

function parseOptionalAmount(raw: string): number | null {
  const trimmed = String(raw || '').trim();
  if (!trimmed || /^[-–—]$/.test(trimmed) || /^n\/a$/i.test(trimmed)) return null;
  let value = trimmed.replace(/[$,]/g, '');
  if (value.startsWith('(') && value.endsWith(')')) value = '-' + value.slice(1, -1);
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function positiveAmount(value: number | null): number | null {
  return value != null && value > 0 ? value : null;
}

function nonNegativeAmount(value: number | null): number | null {
  return value != null && value >= 0 ? value : null;
}

function parsePositionDate(raw: string): string | null {
  const value = String(raw || '').trim();
  if (!value) return null;
  const iso = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?$/);
  const us = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  let candidate: string | null = null;
  if (iso) {
    candidate = iso[1] + '-' + String(Number(iso[2])).padStart(2, '0') + '-' + String(Number(iso[3])).padStart(2, '0');
  } else if (us) {
    candidate = us[3] + '-' + String(Number(us[1])).padStart(2, '0') + '-' + String(Number(us[2])).padStart(2, '0');
  }
  if (!candidate) return null;
  const parsed = new Date(candidate + 'T00:00:00Z');
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === candidate ? candidate : null;
}

function roundMoney(value: number): number {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function roundCost(value: number): number {
  return Math.round((Number(value) || 0) * 10000) / 10000;
}

function roundShares(value: number): number {
  return Math.round((Number(value) || 0) * 1_000_000) / 1_000_000;
}
