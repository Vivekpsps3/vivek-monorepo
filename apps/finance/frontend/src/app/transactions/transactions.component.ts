import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  Input,
  OnChanges,
  OnDestroy,
  OnInit,
  SimpleChanges,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject, Subscription, takeUntil } from 'rxjs';
import { FinanceService } from '../services/finance.service';
import { transactionEffects } from '../crypto/client-finance';
import {
  BankImportOption,
  BankAccountRecord,
  ImportCommitResult,
  BankImportFile,
  BankImportFilePreview,
  ImportPreviewRow,
  ImportReceipt,
  ImportRowNote,
  Transaction,
  TransactionCreate,
} from '../models/transaction.model';
import { ToastService } from '../services/toast.service';
import { ConfirmService } from '../services/confirm.service';
import { todayIsoDate } from '../utils/date.util';
import { downloadCsv } from '../utils/export.util';
import {
  UiBadgeComponent,
  UiButtonComponent,
  UiCardComponent,
  UiEmptyStateComponent,
  UiPageHeaderComponent,
  UiIconComponent,
  UiSelectComponent,
  UiSelectOption,
  UiDataTableComponent,
  UiDialogComponent,
} from '../shared/ui';

@Component({
  selector: 'app-transactions',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    UiPageHeaderComponent,
    UiButtonComponent,
    UiCardComponent,
    UiBadgeComponent,
    UiEmptyStateComponent,
    UiIconComponent,
    UiSelectComponent,
    UiDataTableComponent,
    UiDialogComponent,
  ],
  templateUrl: './transactions.component.html',
  styleUrl: './transactions.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TransactionsComponent implements OnInit, OnChanges, OnDestroy {
  readonly transactionEffects = transactionEffects;
  readonly reviewOptions: UiSelectOption[] = [
    { value: 'all', label: 'All review states' },
    { value: 'unreviewed', label: 'Needs review' },
    { value: 'reviewed', label: 'Reviewed' },
  ];
  @Input() embedded = false;
  @Input() importsOnly = false;
  @Input() typeFilter: 'all' | 'income' | 'expense' = 'all';
  transactions: Transaction[] = [];
  filteredTransactions: Transaction[] = [];
  allTransactions: Transaction[] = [];
  searchTerm = '';
  categoryFilter = '';
  reviewFilter: 'all' | 'unreviewed' | 'reviewed' = 'all';
  sortColumn: 'date' | 'category' | 'amount' = 'date';
  sortDirection: 'asc' | 'desc' = 'desc';

  /** YYYY-MM — drives monthly totals on this page */
  summaryMonth = this.currentMonthKey();

  showModal = false;
  showImportModal = false;
  importBanks: BankImportOption[] = [];
  bankAccounts: BankAccountRecord[] = [];
  importReceipts: ImportReceipt[] = [];

  get importBankSelectOptions(): UiSelectOption[] {
    return [{ value: '', label: 'Select bank' }, ...this.importBanks.map(b => ({ value: b.slug, label: b.name }))];
  }
  importStep: 'upload' | 'preview' = 'upload';
  importFiles: BankImportFile[] = [];
  importPreviews: BankImportFilePreview[] = [];
  private nextImportFileId = 1;
  private importPreviewRequest?: Subscription;
  importSelected = new Set<string>();
  importParsing = false;
  importCommitting = false;
  importError = '';
  saving = false;
  loading = false;
  newTx: TransactionCreate = this.emptyTx();
  editingTxId: number | null = null;
  editingImported = false;
  activeImportReceiptId: number | null = null;
  selectedCalendarDate: string | null = null;

  monthExpenseTotal = 0;
  monthIncomeTotal = 0;
  categoryMergeFrom = '';
  categoryMergeTo = '';
  categoryMergeSaving = false;
  categoryBulkRows: { fromCategory: string; toCategory: string }[] = [this.emptyBulkRenameRow()];
  bulkMerchant = '';
  bulkMerchantCategory = '';

  readonly pageSize = 100;
  visibleRowCount = this.pageSize;
  loadingMore = false;
  hasMore = true;
  listLoading = false;

  private destroy$ = new Subject<void>();

  constructor(
    private financeService: FinanceService,
    private toastService: ToastService,
    private confirmService: ConfirmService,
    private cdr: ChangeDetectorRef,
    private route: ActivatedRoute,
    private router: Router
  ) {}

  private currentMonthKey(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }

  private emptyTx(): TransactionCreate {
    return {
      date: todayIsoDate(),
      type: 'expense',
      category: '',
      amount: 0,
      description: '',
      reviewed: true,
    };
  }

  private emptyBulkRenameRow(): { fromCategory: string; toCategory: string } {
    return { fromCategory: '', toCategory: '' };
  }

  ngOnInit() {
    const q = this.route.snapshot.queryParamMap;
    const search = q.get('q');
    if (search) this.searchTerm = search;
    const month = q.get('month');
    if (month && /^\d{4}-\d{2}$/.test(month)) this.summaryMonth = month;
    const category = q.get('category');
    if (category) this.categoryFilter = category;
    const calendarDate = q.get('date');
    if (calendarDate && /^\d{4}-\d{2}-\d{2}$/.test(calendarDate)) {
      this.selectedCalendarDate = calendarDate;
      if (q.get('add') === '1') {
        this.newTx = { ...this.emptyTx(), date: calendarDate };
        this.showModal = true;
      }
    }
    if (this.typeFilter === 'expense') {
      this.sortColumn = 'amount';
      this.sortDirection = 'desc';
    }

    this.financeService.isLoading$.pipe(takeUntil(this.destroy$)).subscribe(l => {
      this.loading = l;
      this.cdr.markForCheck();
    });

    this.financeService.transactions$.pipe(takeUntil(this.destroy$)).subscribe(data => {
      this.transactions = data;
      this.financeService.getAllTransactions().pipe(takeUntil(this.destroy$)).subscribe(all => {
        this.allTransactions = all;
        this.applyFilterAndSort();
      });
      this.applyFilterAndSort();
      this.cdr.markForCheck();
    });

    this.refreshImportReceipts();

    this.reloadTransactionList();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['typeFilter'] && !changes['typeFilter'].firstChange) {
      this.visibleRowCount = this.pageSize;
      this.applyFilterAndSort();
    }
  }

  private syncQueryParams(): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        q: this.searchTerm.trim() || null,
        month: this.summaryMonth || null,
        category: this.categoryFilter.trim() || null,
      },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  private reloadTransactionList(): void {
    this.visibleRowCount = this.pageSize;
    this.applyFilterAndSort();
  }

  loadMoreTransactions(): void {
    if (!this.hasMore) return;
    this.visibleRowCount += this.pageSize;
    this.applyFilterAndSort();
  }

  ngOnDestroy() {
    this.importPreviewRequest?.unsubscribe();
    this.destroy$.next();
    this.destroy$.complete();
  }

  importBank(slug: string): BankImportOption | undefined {
    return this.importBanks.find(bank => bank.slug === slug);
  }

  get canPreviewImport(): boolean {
    return this.importFiles.length > 0 && this.importFiles.every(entry =>
      !!this.importBank(entry.bank_slug) && (!!entry.bank_account_id || !!entry.new_account_label?.trim())
    );
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

  get summaryMonthLabel(): string {
    if (!this.summaryMonth) return 'All months';
    const [y, m] = this.summaryMonth.split('-');
    const d = new Date(parseInt(y, 10), parseInt(m, 10) - 1, 1);
    return d.toLocaleString(undefined, { month: 'long', year: 'numeric' });
  }

  get categoryOptions(): string[] {
    const source = this.summaryMonth
      ? this.allTransactions.filter(t => t.date.startsWith(`${this.summaryMonth}-`))
      : this.allTransactions;
    return Array.from(
      new Set(source.map(t => t.category).filter(category => !!category?.trim()))
    ).sort((a, b) => a.localeCompare(b));
  }

  get merchantOptions(): string[] {
    return Array.from(new Set(this.allTransactions.map(row => String(row.merchant || '').trim()).filter(Boolean)))
      .sort((a, b) => a.localeCompare(b));
  }

  get sortPreset(): string {
    return `${this.sortColumn}-${this.sortDirection}`;
  }

  get categorySelectOptions(): UiSelectOption[] {
    return [
      { value: '', label: 'All categories' },
      ...this.categoryOptions.map(category => ({ value: category, label: category })),
    ];
  }

  get sortSelectOptions(): UiSelectOption[] {
    return [
      { value: 'date-desc', label: 'Newest' },
      { value: 'date-asc', label: 'Oldest' },
      { value: 'amount-desc', label: 'Highest amount' },
      { value: 'amount-asc', label: 'Lowest amount' },
      { value: 'category-asc', label: 'Category A–Z' },
    ];
  }

  get loadedCategoryMergeCount(): number {
    const from = this.categoryMergeFrom.trim();
    if (!from) return 0;
    return this.transactions.filter(t => t.category === from).length;
  }

  get canMergeCategory(): boolean {
    const from = this.categoryMergeFrom.trim();
    const to = this.categoryMergeTo.trim();
    return !!from && !!to && from !== to && !this.categoryMergeSaving;
  }

  get validBulkRenameRows(): { fromCategory: string; toCategory: string }[] {
    const seen = new Set<string>();
    const rows: { fromCategory: string; toCategory: string }[] = [];
    for (const row of this.categoryBulkRows) {
      const fromCategory = row.fromCategory.trim();
      const toCategory = row.toCategory.trim();
      if (!fromCategory || !toCategory || fromCategory === toCategory || seen.has(fromCategory)) {
        continue;
      }
      seen.add(fromCategory);
      rows.push({ fromCategory, toCategory });
    }
    return rows;
  }

  get canBulkRenameCategories(): boolean {
    return this.validBulkRenameRows.length > 0 && !this.categoryMergeSaving;
  }

  private computeMonthTotals() {
    const inMonth = this.summaryMonth
      ? this.allTransactions.filter(t => t.date.startsWith(`${this.summaryMonth}-`))
      : this.allTransactions;
    const included = inMonth.filter(t => !['payment', 'transfer', 'ambiguous_credit'].includes(t.kind || ''));
    this.monthExpenseTotal = included.reduce((sum, t) => sum + transactionEffects(t).spending, 0);
    this.monthIncomeTotal = included.reduce((sum, t) => sum + transactionEffects(t).income, 0);
  }

  openImportModal() {
    if (this.importCommitting) return;
    this.closeImportModal();
    this.activeImportReceiptId = null;
    this.showImportModal = true;
    this.cdr.markForCheck();
    this.financeService.getImportBanks().pipe(takeUntil(this.destroy$)).subscribe({
      next: banks => {
        this.importBanks = banks;
        this.cdr.markForCheck();
      },
    });
    this.financeService.getBankAccounts().pipe(takeUntil(this.destroy$)).subscribe({
      next: accounts => {
        this.bankAccounts = accounts.filter(account => account.confirmed);
        this.cdr.markForCheck();
      },
    });
  }

  onImportBankChange() {
    this.importPreviews = [];
    this.importStep = 'upload';
    this.importSelected.clear();
    this.importError = '';
    this.activeImportReceiptId = null;
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
    this.onImportBankChange();
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

  closeImportModal() {
    if (this.importCommitting) return;
    this.importPreviewRequest?.unsubscribe();
    this.importParsing = false;
    this.showImportModal = false;
    this.importStep = 'upload';
    this.importFiles = [];
    this.importPreviews = [];
    this.importSelected.clear();
    this.importError = '';
    this.cdr.markForCheck();
  }

  onImportFileSelected(event: Event) {
    if (this.importParsing || this.importCommitting) return;
    const input = event.target as HTMLInputElement;
    for (const file of Array.from(input.files || [])) {
      this.importFiles.push({ id: this.nextImportFileId++, bank_slug: '', file, account_key: undefined });
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
      this.toastService.error('Choose CSV files and select a bank for every file.');
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
    if (!this.selectedImportCount) return 'Save receipt';
    if (this.legacyMappingCount && !this.importSelected.size) return `Map ${this.legacyMappingCount} legacy transaction(s)`;
    if (this.legacyMappingCount) return `Import and map ${this.selectedImportCount} row(s)`;
    return `Import ${this.selectedImportCount} transaction(s)`;
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
      (row as ImportPreviewRow & { reviewed?: boolean }).reviewed = true;
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
    if (!rows.length && !this.canSaveImport) {
      this.toastService.error('Select a transaction or confirm statement coverage.');
      return;
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
      })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res: ImportCommitResult) => {
          this.importCommitting = false;
          this.activeImportReceiptId = null;
          this.closeImportModal();
          this.refreshImportReceipts();
          this.toastService.success(`Imported ${res.inserted} transaction(s)${res.skipped ? `; skipped ${res.skipped} duplicate(s)` : ''}`);
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
    this.financeService.getImportReceipts().pipe(takeUntil(this.destroy$)).subscribe({
      next: rows => { this.importReceipts = rows; this.cdr.markForCheck(); },
      error: () => { this.importReceipts = []; this.cdr.markForCheck(); },
    });
  }

  resumeImport(receipt: ImportReceipt): void {
    if (receipt.status === 'undoing') {
      this.financeService.undoBankImport(receipt.id).pipe(takeUntil(this.destroy$)).subscribe({
        next: result => {
          this.toastService.success(`Undo resumed: removed ${result.removed}; kept ${result.edited} edited transaction(s)`);
          this.refreshImportReceipts();
        },
        error: err => this.toastService.error(this.importFailureMessage(err, 'Could not resume undo.')),
      });
      return;
    }
    this.financeService.resumeBankImport(receipt.id).pipe(takeUntil(this.destroy$)).subscribe({
      next: result => {
        this.toastService.success(`Resumed import: ${result.inserted} transaction(s) added`);
        this.refreshImportReceipts();
      },
      error: err => this.toastService.error(this.importFailureMessage(err, 'Could not resume this import.')),
    });
  }

  async undoImport(receipt: ImportReceipt): Promise<void> {
    const ok = await this.confirmService.ask(
      'Undo this import?',
      'Remove only import-created transactions that still match their saved values. Edited rows stay in the ledger, and this receipt no longer counts as coverage.',
      'Undo import', 'Cancel'
    );
    if (!ok) return;
    this.financeService.undoBankImport(receipt.id).pipe(takeUntil(this.destroy$)).subscribe({
      next: result => {
        this.toastService.success(`Removed ${result.removed}; kept ${result.edited} edited transaction(s)`);
        this.refreshImportReceipts();
      },
      error: err => this.toastService.error(this.importFailureMessage(err, 'Could not undo this import.')),
    });
  }

  private importFailureMessage(err: any, fallback: string): string {
    const detail = err?.error?.detail ?? err?.message;
    return typeof detail === 'string' && detail.trim() ? detail : fallback;
  }

  private createImportAccountKey(): string {
    return `bank-account:${crypto.randomUUID()}`;
  }

  openAddModal() {
    this.editingTxId = null;
    this.editingImported = false;
    this.newTx = { ...this.emptyTx(), ...(this.selectedCalendarDate ? { date: this.selectedCalendarDate } : {}) };
    this.showModal = true;
  }

  applyFilterAndSort() {
    let result = [...(this.allTransactions.length ? this.allTransactions : this.transactions)];
    const query = this.searchTerm.trim().toLocaleLowerCase();
    if (query) result = result.filter(row => [row.description, row.category, row.merchant, row.account_display, row.kind]
      .some(value => String(value || '').toLocaleLowerCase().includes(query)));
    if (this.typeFilter !== 'all') {
      result = result.filter(row => this.typeFilter === 'income'
        ? transactionEffects(row).income !== 0
        : transactionEffects(row).spending !== 0);
    }
    if (this.summaryMonth) {
      result = result.filter(row => row.date.startsWith(`${this.summaryMonth}-`));
    }
    if (this.categoryFilter.trim()) {
      result = result.filter(row => row.category === this.categoryFilter.trim());
    }
    if (this.reviewFilter === 'unreviewed') result = result.filter(row => row.reviewed !== true);
    if (this.reviewFilter === 'reviewed') result = result.filter(row => row.reviewed === true);

    result.sort((a, b) => {
      let valA: string | number;
      let valB: string | number;
      if (this.sortColumn === 'date') {
        valA = a.date;
        valB = b.date;
      } else if (this.sortColumn === 'amount') {
        valA = a.amount;
        valB = b.amount;
      } else {
        valA = a.category;
        valB = b.category;
      }
      if (valA < valB) return this.sortDirection === 'asc' ? -1 : 1;
      if (valA > valB) return this.sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

    this.hasMore = result.length > this.visibleRowCount;
    this.filteredTransactions = result.slice(0, this.visibleRowCount);
    this.computeMonthTotals();
    this.cdr.markForCheck();
  }

  onSearchChange() {
    this.visibleRowCount = this.pageSize;
    this.syncQueryParams();
    this.reloadTransactionList();
  }

  onReviewFilterChange(value: string): void {
    this.reviewFilter = value as 'all' | 'unreviewed' | 'reviewed';
    this.visibleRowCount = this.pageSize;
    this.applyFilterAndSort();
  }

  markReviewed(tx: Transaction): void {
    this.financeService.updateTransaction(tx.id, { reviewed: true }).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => this.toastService.success('Transaction marked reviewed'),
      error: () => this.toastService.error('Could not update review status'),
    });
  }

  transactionLabel(tx: Transaction): string {
    return tx.kind || tx.type;
  }

  transactionAmountPrefix(tx: Transaction): string {
    const effects = transactionEffects(tx);
    if (effects.income > 0) return '+';
    if (effects.spending < 0) return '+';
    if (effects.spending > 0) return '−';
    return '';
  }

  transactionAmountClass(tx: Transaction): string {
    const effects = transactionEffects(tx);
    return effects.income > 0 || effects.spending < 0 ? 'positive' : effects.spending > 0 ? 'negative' : '';
  }

  onSummaryMonthChange() {
    this.visibleRowCount = this.pageSize;
    if (this.categoryFilter && !this.categoryOptions.includes(this.categoryFilter)) {
      this.categoryFilter = '';
    }
    this.syncQueryParams();
    this.applyFilterAndSort();
  }

  onCategoryFilterChange() {
    this.visibleRowCount = this.pageSize;
    this.syncQueryParams();
    this.applyFilterAndSort();
  }

  onSortPresetChange(value: string) {
    const [column, direction] = value.split('-') as ['date' | 'category' | 'amount', 'asc' | 'desc'];
    this.sortColumn = column;
    this.sortDirection = direction;
    this.applyFilterAndSort();
  }

  clearMonthFilter() {
    this.summaryMonth = '';
    this.onSummaryMonthChange();
  }

  async mergeCategory(): Promise<void> {
    const from = this.categoryMergeFrom.trim();
    const to = this.categoryMergeTo.trim();
    if (!from || !to) {
      this.toastService.error('Choose a source and target category.');
      return;
    }
    if (from === to) {
      this.toastService.error('Choose two different categories.');
      return;
    }

    const ok = await this.confirmService.ask(
      'Merge category?',
      `Rename every "${from}" transaction to "${to}"?`,
      'Merge',
      'Cancel'
    );
    if (!ok) return;

    this.categoryMergeSaving = true;
    this.financeService
      .renameCategory(from, to)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: result => {
          this.categoryMergeSaving = false;
          this.categoryMergeFrom = '';
          this.categoryMergeTo = '';
          this.applyFilterAndSort();
          this.toastService.success(`Updated ${result.updated} transaction(s)`);
          this.cdr.markForCheck();
        },
        error: () => {
          this.categoryMergeSaving = false;
          this.cdr.markForCheck();
        },
      });
  }

  addBulkRenameRow(): void {
    this.categoryBulkRows = [...this.categoryBulkRows, this.emptyBulkRenameRow()];
    this.cdr.markForCheck();
  }

  removeBulkRenameRow(index: number): void {
    this.categoryBulkRows = this.categoryBulkRows.filter((_, i) => i !== index);
    if (this.categoryBulkRows.length === 0) {
      this.categoryBulkRows = [this.emptyBulkRenameRow()];
    }
    this.cdr.markForCheck();
  }

  async bulkRenameCategories(): Promise<void> {
    const rows = this.validBulkRenameRows;
    if (!rows.length) {
      this.toastService.error('Add at least one valid category rename.');
      return;
    }

    const ok = await this.confirmService.ask(
      'Bulk rename categories?',
      `Apply ${rows.length} category rename(s) across all transactions?`,
      'Rename',
      'Cancel'
    );
    if (!ok) return;

    this.categoryMergeSaving = true;
    this.financeService
      .bulkRenameCategories(rows)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: result => {
          this.categoryMergeSaving = false;
          this.categoryBulkRows = [this.emptyBulkRenameRow()];
          this.applyFilterAndSort();
          this.toastService.success(`Updated ${result.updated} transaction(s)`);
          this.cdr.markForCheck();
        },
        error: () => {
          this.categoryMergeSaving = false;
          this.cdr.markForCheck();
        },
      });
  }

  async bulkCategorizeMerchant(): Promise<void> {
    const merchant = this.bulkMerchant.trim();
    const category = this.bulkMerchantCategory.trim();
    if (!merchant || !category) {
      this.toastService.error('Choose a merchant and a category.');
      return;
    }
    const ok = await this.confirmService.ask(
      'Categorize merchant?',
      `Set every transaction for "${merchant}" to "${category}"?`,
      'Apply', 'Cancel'
    );
    if (!ok) return;
    this.categoryMergeSaving = true;
    this.financeService.bulkCategorizeMerchant(merchant, category).pipe(takeUntil(this.destroy$)).subscribe({
      next: result => {
        this.categoryMergeSaving = false;
        this.bulkMerchant = '';
        this.bulkMerchantCategory = '';
        this.toastService.success(`Updated ${result.updated} transaction(s)`);
        this.cdr.markForCheck();
      },
      error: () => { this.categoryMergeSaving = false; this.cdr.markForCheck(); },
    });
  }

  toggleSort(column: 'date' | 'category' | 'amount') {
    if (this.sortColumn === column) {
      this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortColumn = column;
      this.sortDirection = 'desc';
    }
    this.applyFilterAndSort();
  }

  sortIcon(column: string): string {
    if (this.sortColumn !== column) return '↕';
    return this.sortDirection === 'asc' ? '↑' : '↓';
  }

  saveTransaction() {
    if (this.saving) return;
    if (!this.newTx.category?.trim() || this.newTx.amount <= 0) {
      this.toastService.error('Category and a positive amount are required.');
      return;
    }

    this.saving = true;
    const payload: TransactionCreate = {
      ...this.newTx,
      category: this.newTx.category.trim(),
      amount: Math.round(this.newTx.amount * 100) / 100,
    };

    const req =
      this.editingTxId !== null
        ? this.financeService.updateTransaction(this.editingTxId, payload)
        : this.financeService.addTransaction(payload);

    req.pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.saving = false;
        const wasEditing = this.editingTxId !== null;
        this.closeModal();
        this.toastService.success(
          wasEditing ? 'Transaction updated' : 'Transaction added'
        );
        this.cdr.markForCheck();
      },
      error: () => {
        this.saving = false;
        this.cdr.markForCheck();
      },
    });
  }

  editTransaction(tx: Transaction) {
    this.editingTxId = tx.id;
    this.editingImported = tx.source === 'import';
    this.newTx = {
      date: tx.date,
      type: tx.type,
      category: tx.category,
      amount: tx.amount,
      description: tx.description || '',
      merchant: tx.merchant || null,
      kind: tx.kind || (tx.type === 'income' ? 'income' : 'purchase'),
      reviewed: tx.reviewed === true,
    };
    this.showModal = true;
  }

  closeModal() {
    this.showModal = false;
    this.editingTxId = null;
    this.editingImported = false;
    this.newTx = this.emptyTx();
    if (this.route.snapshot.queryParamMap.get('add') === '1') {
      void this.router.navigate([], { relativeTo: this.route, queryParams: { add: null }, queryParamsHandling: 'merge', replaceUrl: true });
    }
  }

  async deleteTransaction(tx: Transaction) {
    const ok = await this.confirmService.ask(
      'Delete transaction?',
      `Remove ${tx.category} (${tx.date}) permanently?`,
      'Delete',
      'Cancel'
    );
    if (!ok) return;

    const backup: TransactionCreate = {
      date: tx.date,
      type: tx.type,
      category: tx.category,
      amount: tx.amount,
      description: tx.description,
    };

    this.financeService.deleteTransaction(tx.id).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.toastService.success('Transaction deleted', () => {
          this.financeService.addTransaction(backup).subscribe();
        });
      },
    });
  }

  exportToCsv() {
    downloadCsv(
      'transactions.csv',
      ['Date', 'Type', 'Account', 'Category', 'Description', 'Amount'],
      this.filteredTransactions.map(t => [
        t.date,
        t.type,
        t.account_display || '',
        t.category,
        t.description || '',
        t.amount,
      ])
    );
  }

  trackByTxId(_: number, tx: Transaction) {
    return tx.id;
  }
}
