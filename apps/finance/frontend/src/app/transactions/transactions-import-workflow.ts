import { ChangeDetectorRef, Injectable, OnDestroy } from '@angular/core';
import { EMPTY, Observable, Subject, Subscription, catchError, debounceTime, defaultIfEmpty, filter, forkJoin, of, startWith, switchMap, takeUntil } from 'rxjs';
import { ActivatedRoute, Router } from '@angular/router';
import { FinanceService } from '../services/finance.service';
import {
  BankImportOption,
  BankAccountRecord,
  CsvMappingProfile,
  CustomCsvMapping,
  ImportCommitResult,
  BankImportFile,
  BankImportFilePreview,
  ImportPreviewRow,
  ImportReceipt,
  Transaction,
} from '../models/transaction.model';
import { ToastService, ConfirmService } from '@vivek/ui';
import { plural } from '@vivek/browser';
import { bindLockSnapshots } from '../crypto/lock-finance';
import {
  bankExportHelp,
  importButtonLabel,
  importFileError,
  importSummaryLine,
  receiptLine,
  undoConfirmBody,
} from '../utils/bank-import-copy';
import { customCommitRefusal } from '../utils/bank-import.util';
import {
  customCsvHeaders,
  customMappingProblems,
  detectCsvDelimiter,
  errorMessage,
  inspectCustomCsv,
  suggestCustomCsvMapping,
} from '../utils/bank-import.parsers';

@Injectable()
export class TransactionsImportWorkflow implements OnDestroy {
  importBanks: BankImportOption[] = [];
  bankAccounts: BankAccountRecord[] = [];
  importReceipts: ImportReceipt[] = [];
  showImportModal = false;
  importStep: 'upload' | 'preview' = 'upload';
  importFiles: BankImportFile[] = [];
  importPreviews: BankImportFilePreview[] = [];
  importSelected = new Set<string>();
  importParsing = false;
  importCommitting = false;
  activeImportReceiptId: number | null = null;
  reattachReceiptFilename: string | null = null;
  importError = '';
  csvProfiles: CsvMappingProfile[] = [];
  private nextImportFileId = 1;
  private releaseImportLock: () => void;
  private importPreviewRequest?: Subscription;
  private destroy$ = new Subject<void>();
  private importContextRefresh$ = new Subject<void>();

  constructor(
    private financeService: FinanceService,
    private toastService: ToastService,
    private confirmService: ConfirmService,
    private cdr: ChangeDetectorRef,
    private route: ActivatedRoute,
    private router: Router,
  ) {
    this.releaseImportLock = bindLockSnapshots(() => this.discardImportPlaintext());
  }

  connectImportContextRefresh(): void {
    this.importContextRefresh$.pipe(
      startWith(undefined),
      debounceTime(60),
      switchMap(() => forkJoin({
        bankAccounts: this.lookupOrClear(this.financeService.getBankAccounts()),
        importReceipts: this.financeService.getImportReceipts().pipe(catchError(() => of(null))),
      })),
      takeUntil(this.destroy$),
    ).subscribe(result => {
      if (result.bankAccounts) this.bankAccounts = result.bankAccounts;
      if (result.importReceipts) this.importReceipts = result.importReceipts;
      this.cdr.markForCheck();
    });

    (this.financeService.dataChanges$ || EMPTY).pipe(
      filter(change => change.collections.some(collection =>
        collection === 'bank_accounts' || collection === 'import_batches')),
      debounceTime(60),
      takeUntil(this.destroy$),
    ).subscribe(() => {
      this.importContextRefresh$.next();
    });
  }

  importBank(slug: string): BankImportOption | undefined {
    return this.importBanks.find(bank => bank.slug === slug);
  }

  /** Bank to preselect for a new file: the last receipt's bank, else the only account's bank. */
  get defaultBankSlug(): string {
    const fromReceipt = this.importReceipts.find(receipt => receipt.bank_slugs?.length)?.bank_slugs[0];
    if (fromReceipt) return fromReceipt;
    const slugs = new Set(this.bankAccounts.map(account => account.bank_slug).filter(Boolean));
    return slugs.size === 1 ? [...slugs][0] : '';
  }

  importBankHelp(slug: string): string {
    return bankExportHelp(slug);
  }

  importFileError(raw: string | null | undefined): string {
    return importFileError(raw);
  }

  /** Rows that could be imported from the current previews, selected or not. */
  get importableCount(): number {
    return this.importRows.filter(row => row.status === 'new').length;
  }

  get importSummaryText(): string {
    return importSummaryLine(this.importSummary, this.importableCount);
  }

  receiptLineFor(receipt: ImportReceipt): string {
    const parsed = new Date(receipt.started_at);
    const dateLabel = Number.isNaN(parsed.getTime())
      ? receipt.started_at
      : parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    return receiptLine({
      filenames: receipt.filenames,
      dateLabel,
      status: receipt.status,
      saved: receipt.inserted_count || 0,
      needFixing: receipt.unresolved?.length || 0,
    });
  }

  /** Sentence-case badge text for a preview row. */
  importStatusLabel(row: ImportPreviewRow): string {
    if (row.status === 'duplicate') return 'Already imported';
    if (row.kind === 'refund') return 'Refund';
    if (row.kind === 'purchase') return 'Purchase';
    if (row.kind === 'income') return 'Income';
    if (row.kind === 'payment') return 'Card payment';
    if (row.kind === 'transfer') return 'Transfer';
    if (row.status === 'new') return 'New';
    return row.status;
  }

  get canPreviewImport(): boolean {
    return this.importFiles.length > 0 && this.importFiles.every(entry => this.entryReady(entry));
  }

  private entryReady(entry: BankImportFile): boolean {
    if (!this.importBank(entry.bank_slug)) return false;
    if (entry.bank_slug === 'custom_csv') {
      return !customMappingProblems(entry.csv_mapping, entry.csv_headers || [])
        && (!!entry.csv_mapping?.account_column || !!entry.bank_account_id || !!entry.new_account_label?.trim());
    }
    return !!entry.bank_account_id || !!entry.new_account_label?.trim();
  }

  get canSaveImport(): boolean {
    const confirmedCoverage = this.importFiles.some(file => file.confirm_coverage && !!file.account_key
      && !!file.coverage_start && !!file.coverage_end && file.coverage_end >= file.coverage_start);
    const durableDiagnostics = this.importPreviews.some(file => !!file.error || !!file.preview?.errors.length);
    return this.selectedImportCount > 0 || confirmedCoverage || durableDiagnostics;
  }

  get importRows(): ImportPreviewRow[] {
    return this.importPreviews.flatMap(entry => entry.preview?.rows || []);
  }

  get importSummary() {
    return this.importPreviews.reduce((total, entry) => {
      if (entry.preview) {
        for (const field of ['total_parsed', 'new', 'duplicate', 'skipped', 'errors'] as const) {
          total[field] += entry.preview.summary[field] || 0;
        }
      }
      return total;
    }, { total_parsed: 0, new: 0, duplicate: 0, skipped: 0, errors: 0 });
  }

  startImportWizard(reattachReceiptId: number | null = null) {
    if (this.importCommitting) return;
    this.activeImportReceiptId = reattachReceiptId;
    this.showImportModal = true;
    this.cdr.markForCheck();
    this.financeService.getImportBanks().pipe(takeUntil(this.destroy$)).subscribe({
      next: banks => {
        this.importBanks = banks;
        this.cdr.markForCheck();
      },
    });
    if (typeof this.financeService.listCsvMappingProfiles === 'function') {
      this.financeService.listCsvMappingProfiles().pipe(takeUntil(this.destroy$)).subscribe({
        next: profiles => {
          this.csvProfiles = profiles || [];
          this.cdr.markForCheck();
        },
        error: () => undefined,
      });
    }
    this.importContextRefresh$.next();
  }

  onImportBankChange() {
    this.importPreviews = [];
    this.importStep = 'upload';
    this.importSelected.clear();
    this.importError = '';
    this.cdr.markForCheck();
  }

  onImportBankSelectionChange(entry: BankImportFile, value: string): void {
    entry.bank_slug = value;
    entry.bank_account_id = null;
    entry.account_display = '';
    entry.new_account_label = '';
    entry.account_key = undefined;
    entry.account_mask_override = undefined;
    entry.map_legacy_account = false;
    entry.csv_mapping = undefined;
    entry.csv_headers = undefined;
    entry.csv_delimiter = undefined;
    this.onImportBankChange();
    if (value === 'custom_csv') void this.loadCustomCsvShape(entry);
  }

  accountOptionsFor(entry: BankImportFile): BankAccountRecord[] {
    return this.bankAccounts.filter(account => account.bank_slug === entry.bank_slug);
  }

  onImportAccountChange(entry: BankImportFile, value: string): void {
    const accountId = Number(value) || null;
    entry.bank_account_id = accountId;
    if (accountId) {
      const account = this.bankAccounts.find(row => row.id === accountId);
      entry.account_display = account?.display_name || '';
      entry.account_key = account?.account_key || `legacy-bank-account:${account!.id}`;
      entry.account_mask_override = account?.account_mask || '';
      entry.new_account_label = '';
      entry.map_legacy_account = false;
    } else {
      entry.account_display = '';
      entry.account_key = undefined;
      entry.account_mask_override = undefined;
      entry.new_account_label = '';
      entry.map_legacy_account = false;
    }
    this.onImportBankChange();
  }

  onNewAccountLabelChange(entry: BankImportFile): void {
    entry.account_display = entry.new_account_label?.trim() || '';
    if (entry.account_display && !entry.account_key) entry.account_key = this.createImportAccountKey();
    if (!entry.account_display) entry.account_key = undefined;
    this.onImportBankChange();
  }

  onLegacyAccountMappingChange(entry: BankImportFile, checked: boolean): void {
    entry.map_legacy_account = checked;
    this.onImportBankChange();
  }

  closeImportModal(): boolean {
    if (this.importCommitting) return false;
    this.discardImportPlaintext();
    if (this.route.snapshot?.queryParamMap.get('add') === '1') {
      void this.router.navigate([], {
        relativeTo: this.route,
        queryParams: { add: null, reattach: null, reattach_file: null },
        queryParamsHandling: 'merge',
        replaceUrl: true,
      });
    }
    return true;
  }

  onImportFileSelected(event: Event) {
    if (this.importParsing || this.importCommitting) return;
    const input = event.target as HTMLInputElement;
    for (const file of Array.from(input.files || [])) {
      const entry: BankImportFile = { id: this.nextImportFileId++, bank_slug: this.defaultBankSlug, file, account_key: undefined };
      this.importFiles.push(entry);
      if (entry.bank_slug === 'custom_csv') void this.loadCustomCsvShape(entry);
    }
    input.value = '';
    this.onImportBankChange();
  }

  removeImportFile(id: number) {
    if (this.importParsing || this.importCommitting) return;
    this.importFiles = this.importFiles.filter(entry => entry.id !== id);
    this.onImportBankChange();
  }

  backToImportFiles() {
    if (this.importCommitting) return;
    this.onImportBankChange();
  }

  runImportPreview() {
    if (this.importParsing || this.importCommitting) return;
    if (!this.canPreviewImport) {
      const missingBank = this.importFiles.find(entry => !this.importBank(entry.bank_slug));
      const custom = this.importFiles.find(entry => entry.bank_slug === 'custom_csv' && !this.entryReady(entry));
      this.importError = missingBank
        ? `Choose the bank for ${missingBank.file.name} first.`
        : custom
          ? (customMappingProblems(custom.csv_mapping, custom.csv_headers || [])
            || 'Choose an account for this file, or map an account column.')
          : 'Choose CSV files and select a bank for every file.';
      this.cdr.markForCheck();
      return;
    }
    this.importParsing = true;
    this.importError = '';
    this.importPreviewRequest = this.financeService
      .previewBankImports(this.importFiles.map(entry => ({
        ...entry,
        account_display: entry.account_display || entry.new_account_label?.trim() || '',
        account_key: entry.account_key,
        account_mask_override: entry.account_mask_override,
        map_legacy_account: entry.map_legacy_account === true,
      })))
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: previews => {
          this.importParsing = false;
          this.importPreviews = previews;
          this.importStep = 'preview';
          this.importSelected = new Set(this.importRows.filter(row => row.status === 'new').map(row => row.dedupe_key));
          this.cdr.markForCheck();
        },
        error: (err: any) => {
          this.importParsing = false;
          this.importError = this.importFailureMessage(err, 'Could not preview the files. Please try again.');
          this.cdr.markForCheck();
        },
      });
  }

  toggleImportRow(row: ImportPreviewRow) {
    if (this.importCommitting || row.status === 'duplicate' || row.kind === 'ambiguous_credit') return;
    if (this.importSelected.has(row.dedupe_key)) {
      this.importSelected.delete(row.dedupe_key);
    } else {
      this.importSelected.add(row.dedupe_key);
    }
    this.cdr.markForCheck();
  }

  isImportRowSelected(row: ImportPreviewRow): boolean {
    return row.status !== 'duplicate' && (row.kind === 'ambiguous_credit' || this.importSelected.has(row.dedupe_key));
  }

  selectAllNewImportRows() {
    if (this.importCommitting) return;
    for (const row of this.importRows) {
      if (row.status !== 'duplicate' && row.kind !== 'ambiguous_credit') {
        this.importSelected.add(row.dedupe_key);
      }
    }
    this.cdr.markForCheck();
  }

  clearImportSelection() {
    if (this.importCommitting) return;
    this.importSelected.clear();
    this.cdr.markForCheck();
  }

  get selectedImportCount(): number {
    return this.importSelected.size
      + this.importRows.filter(row => row.status !== 'duplicate' && row.kind === 'ambiguous_credit').length
      + this.legacyMappingCount;
  }

  get legacyMappingCount(): number {
    return this.importRows.filter(row => row.status === 'duplicate' && !!row.legacy_dedupe_key).length;
  }

  get importActionLabel(): string {
    if (this.legacyMappingCount && this.importSelected.size) return `Import and map ${plural(this.selectedImportCount, 'row')}`;
    if (this.legacyMappingCount && !this.importSelected.size) return `Map ${plural(this.legacyMappingCount, 'legacy transaction')}`;
    return importButtonLabel(this.importableCount, this.selectedImportCount);
  }

  get selectedImportExpenseTotal(): number {
    return this.importRows
      .filter(row => row.status !== 'duplicate' && this.importSelected.has(row.dedupe_key))
      .reduce((sum, row) => sum + (row.kind === 'refund' ? -Math.abs(Number(row.amount) || 0) : row.kind === 'purchase' ? Math.abs(Number(row.amount) || 0) : 0), 0);
  }

  setImportKind(row: ImportPreviewRow, value: string): void {
    row.kind = value as Transaction['kind'];
    row.review_reason = row.kind === 'ambiguous_credit' ? 'Credit type is unclear. Classify it after import.' : null;
    if (row.kind !== 'ambiguous_credit') {
      this.importSelected.add(row.dedupe_key);
    }
    this.cdr.markForCheck();
  }

  useMerchantSuggestion(row: ImportPreviewRow): void {
    row.merchant = row.merchant_suggestion || null;
    this.cdr.markForCheck();
  }

  get supportedImporterNames(): string {
    return this.importBanks.map(bank => bank.name).join(', ') || 'the listed banks';
  }

  commitImport() {
    if (this.importCommitting || this.importParsing) return;
    const rows = this.importRows.filter(row =>
      (row.status !== 'duplicate' && (row.kind === 'ambiguous_credit' || this.importSelected.has(row.dedupe_key)))
      || (row.status === 'duplicate' && !!row.legacy_dedupe_key)
    );
    const refusal = customCommitRefusal(this.importFiles, this.importPreviews, rows.length);
    if (refusal) {
      this.importError = this.importFailureMessage({ message: importFileError(refusal) }, 'Fix the column mapping, then preview again. Nothing was saved.');
      this.cdr.markForCheck();
      return;
    }
    if (!rows.length && !this.canSaveImport) {
      this.importError = 'Select a transaction or confirm statement coverage.';
      this.cdr.markForCheck();
      return;
    }
    const remembered: Array<{ name: string; mapping: CustomCsvMapping }> = [];
    for (const file of this.importFiles) {
      if (file.bank_slug === 'custom_csv' && file.csv_mapping) {
        remembered.push({ name: file.csv_profile_name?.trim() || 'Custom CSV', mapping: file.csv_mapping });
      }
    }
    this.importCommitting = true;
    this.importError = '';
    this.financeService
      .commitBankImports(rows, {
        bank_slugs: Array.from(new Set(this.importFiles.map(file => file.bank_slug))),
        filenames: this.importFiles.map(file => file.file.name),
        unresolved: this.importPreviews.flatMap(file => [
          ...(file.preview?.errors || []).map(note => ({ ...note, filename: file.filename })),
          ...(file.error ? [{ line: 0, filename: file.filename, reason: file.error }] : []),
        ]),
        account_displays: Array.from(new Set(rows.map(row => row.account_display))),
        resume_receipt_id: this.activeImportReceiptId || undefined,
        replace_filename: this.reattachReceiptFilename || undefined,
        coverage: this.importFiles.filter(file => {
          const preview = this.importPreviews.find(row => row.id === file.id);
          return file.confirm_coverage && file.coverage_start && file.coverage_end && !!preview?.preview
            && !preview.error && !preview.preview.errors.length;
        }).map(file => ({
          account_display: file.account_display || file.new_account_label?.trim() || '',
          account_key: file.account_key,
          bank_account_id: file.bank_account_id,
          start_date: file.coverage_start!, end_date: file.coverage_end!, confirmed: true as const,
        })),
        confirmed_bank_accounts: this.importPreviews.flatMap(preview => {
          const file = this.importFiles.find(row => row.id === preview.id);
          if (!file?.account_key) return [];
          const display_name = file?.account_display || file?.new_account_label?.trim() || '';
          const account_mask = file.account_mask_override?.trim() || preview.preview?.rows[0]?.account_mask || '';
          return [{
            id: file.bank_account_id || undefined,
            bank_slug: preview.bank_slug, account_mask,
            account_key: file.account_key, display_name, confirmed: true,
          }];
        }),
      } as any)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res: ImportCommitResult) => {
          this.importCommitting = false;
          this.activeImportReceiptId = null;
          this.rememberCustomMappings(remembered);
          this.closeImportModal();
          this.refreshImportReceipts();
          this.toastService.success(`Imported ${plural(res.inserted, 'transaction')}${res.skipped ? `; skipped ${plural(res.skipped, 'duplicate')}` : ''}`);
          this.cdr.markForCheck();
        },
        error: (err: any) => {
          this.importCommitting = false;
          this.activeImportReceiptId = Number(err?.receipt_id || err?.error?.receipt_id) || this.activeImportReceiptId;
          this.importError = this.importFailureMessage(err, 'Import failed.') + ' Some rows may already be saved. Retry safely skips those duplicates.';
          this.cdr.markForCheck();
        },
      });
  }

  private refreshImportReceipts(): void {
    this.importContextRefresh$.next();
  }

  /** A lock or owner switch clears the cached accounts. Other failures keep them. */
  private lookupOrClear<T>(source: Observable<T[]>): Observable<T[] | null> {
    return source.pipe(
      defaultIfEmpty([] as T[]),
      catchError(err => {
        const message = err instanceof Error ? err.message : '';
        if (message === 'Vault locked' || message === 'Vault session changed') return of([]);
        return of(null);
      }),
    );
  }

  resumeImport(receipt: ImportReceipt): void {
    if (receipt.status === 'undoing') {
      this.financeService.undoBankImport(receipt.id).pipe(takeUntil(this.destroy$)).subscribe({
        next: result => {
          this.toastService.success(`Undo resumed: removed ${result.removed}; kept ${plural(result.edited, 'edited transaction')}`);
          this.refreshImportReceipts();
        },
        error: err => this.toastService.error(this.importFailureMessage(err, 'Could not resume undo.')),
      });
      return;
    }
    this.financeService.resumeBankImport(receipt.id).pipe(takeUntil(this.destroy$)).subscribe({
      next: result => {
        this.toastService.success(`Resumed import: ${plural(result.inserted, 'transaction')} added`);
        this.refreshImportReceipts();
      },
      error: err => this.toastService.error(this.importFailureMessage(err, 'Could not resume this import.')),
    });
  }

  async undoImport(receipt: ImportReceipt): Promise<void> {
    // Preview first (F9): the confirm dialog names the real counts.
    let counts: { removable: number; editedKept: number; alreadyGone: number };
    try {
      counts = await new Promise((resolve, reject) => {
        this.financeService.previewUndoImportReceipt(receipt.id).pipe(takeUntil(this.destroy$)).subscribe({ next: resolve, error: reject });
      });
    } catch (err) {
      this.toastService.error(this.importFailureMessage(err, 'Could not check this import.'));
      return;
    }
    const ok = await this.confirmService.ask(
      'Undo this import?',
      undoConfirmBody(counts),
      'Undo import', 'Cancel'
    );
    if (!ok) return;
    this.financeService.undoBankImport(receipt.id).pipe(takeUntil(this.destroy$)).subscribe({
      next: result => {
        this.toastService.success(`Removed ${result.removed}; kept ${plural(result.edited, 'edited transaction')}`);
        this.refreshImportReceipts();
      },
      error: err => this.toastService.error(this.importFailureMessage(err, 'Could not undo this import.')),
    });
  }

  async deleteImportReceipt(receipt: ImportReceipt): Promise<void> {
    const ok = await this.confirmService.ask(
      'Delete this receipt record?',
      "The transactions stay. You just won't be able to undo this import later.",
      'Delete receipt', 'Cancel'
    );
    if (!ok) return;
    this.financeService.deleteImportReceipt(receipt.id).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.toastService.success('Receipt deleted. The transactions stay.');
        this.refreshImportReceipts();
      },
      error: err => this.toastService.error(this.importFailureMessage(err, 'Could not delete this receipt.')),
    });
  }

  private importFailureMessage(err: any, fallback: string): string {
    const detail = err?.error?.detail ?? err?.message;
    return typeof detail === 'string' && detail.trim() ? detail : fallback;
  }

  private createImportAccountKey(): string {
    return `bank-account:${crypto.randomUUID()}`;
  }

  /** Lock and cancel drop the file and the preview. The mapping profile stays encrypted. */
  discardImportPlaintext(): void {
    this.importPreviewRequest?.unsubscribe();
    this.importParsing = false;
    this.showImportModal = false;
    this.importStep = 'upload';
    this.importFiles = [];
    this.importPreviews = [];
    this.importSelected.clear();
    this.importError = '';
    this.activeImportReceiptId = null;
    this.reattachReceiptFilename = null;
    this.cdr.markForCheck();
  }

  delimiterLabel(entry: BankImportFile): string {
    const labels: Record<string, string> = { ',': 'comma', ';': 'semicolon', '\t': 'tab', '|': 'pipe' };
    return labels[entry.csv_delimiter || ','] || 'comma';
  }

  async loadCustomCsvShape(entry: BankImportFile): Promise<void> {
    if (entry.bank_slug !== 'custom_csv') return;
    try {
      const text = await entry.file.text();
      const shape = inspectCustomCsv(text);
      const headerRow = entry.csv_mapping?.header_row ?? shape.header_row;
      entry.csv_delimiter = detectCsvDelimiter(text.replace(/^\ufeff/, ''));
      entry.csv_headers = customCsvHeaders(text, headerRow);
      if (!entry.csv_mapping) entry.csv_mapping = suggestCustomCsvMapping({ ...shape, headers: entry.csv_headers, header_row: headerRow });
      else entry.csv_mapping = { ...entry.csv_mapping, header_row: headerRow };
    } catch (error) {
      entry.csv_headers = [];
      this.importError = importFileError(errorMessage(error));
    }
    this.cdr.markForCheck();
  }

  setCsvField(entry: BankImportFile, field: keyof CustomCsvMapping, value: string): void {
    const current = entry.csv_mapping || {
      version: 1 as const,
      date_column: '',
      description_column: '',
      date_format: 'mdy' as const,
      amount_mode: 'signed' as const,
      outflow_sign: 'negative' as const,
      refund_mode: 'description' as const,
      header_row: true,
    };
    const stored = value === '' ? undefined : value;
    entry.csv_mapping = { ...current, [field]: stored } as CustomCsvMapping;
    this.onImportBankChange();
  }

  setCsvHeaderRow(entry: BankImportFile, checked: boolean): void {
    if (entry.csv_mapping) entry.csv_mapping = { ...entry.csv_mapping, header_row: checked };
    void this.loadCustomCsvShape(entry);
    this.onImportBankChange();
  }

  applyCsvProfile(entry: BankImportFile, profileId: string): void {
    const profile = this.csvProfiles.find(row => String(row.id) === profileId);
    if (!profile) return;
    entry.csv_mapping = { ...profile.mapping, version: 1 };
    entry.csv_profile_name = profile.name;
    void this.loadCustomCsvShape(entry);
    this.onImportBankChange();
  }

  private rememberCustomMappings(profiles: Array<{ name: string; mapping: CustomCsvMapping }>): void {
    if (typeof this.financeService.saveCsvMappingProfile !== 'function') return;
    for (const profile of profiles) {
      this.financeService.saveCsvMappingProfile(profile).pipe(takeUntil(this.destroy$)).subscribe({
        next: saved => {
          this.csvProfiles = [...this.csvProfiles.filter(row => row.name !== saved.name), saved]
            .sort((a, b) => a.name.localeCompare(b.name));
        },
        error: () => undefined,
      });
    }
  }

  ngOnDestroy(): void {
    this.releaseImportLock();
    this.importPreviewRequest?.unsubscribe();
    this.destroy$.next();
    this.destroy$.complete();
  }
}
