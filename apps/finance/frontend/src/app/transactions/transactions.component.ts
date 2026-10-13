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
import { EMPTY, Subject, Subscription, catchError, debounceTime, filter, forkJoin, of, startWith, switchMap, takeUntil } from 'rxjs';
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
  normalizeSpendingLabel,
  spendingComparisonGroupKey,
  spendingComparisonGroupLabel,
  SpendingReviewDimension,
  UNASSIGNED_ACCOUNT_FILTER,
} from '../utils/spending-review.util';
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
    { value: 'needs', label: 'Needs review' },
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
  merchantFilter = '';
  accountFilter = '';
  receiptFilter = '';
  fromDate = '';
  throughDate = '';
  reviewCurrentPeriod: { start: string; end: string } | null = null;
  reviewPriorPeriod: { start: string; end: string } | null = null;
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
  transactionSaveError = '';
  loading = false;
  listError = '';
  newTx: TransactionCreate = this.emptyTx();
  editingTxId: number | null = null;
  editingImported = false;
  activeImportReceiptId: number | null = null;
  reattachReceiptId: number | null = null;
  reattachReceiptFilename: string | null = null;
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
  private importContextRefresh$ = new Subject<void>();
  private allTransactionsLoaded = false;
  private queryInitialized = false;
  private lastDeepLinkedEdit = '';

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
    if (this.typeFilter === 'expense') {
      this.sortColumn = 'amount';
      this.sortDirection = 'desc';
    }

    this.connectImportContextRefresh();
    this.route.queryParamMap.pipe(takeUntil(this.destroy$)).subscribe(params => this.applyRouteQuery(params));

    this.financeService.isLoading$.pipe(takeUntil(this.destroy$)).subscribe(l => {
      this.loading = l;
      this.cdr.markForCheck();
    });

    this.financeService.transactions$.pipe(takeUntil(this.destroy$)).subscribe(data => {
      this.transactions = data;
      this.financeService.getAllTransactions().pipe(takeUntil(this.destroy$)).subscribe(all => {
        this.allTransactions = all;
        this.allTransactionsLoaded = true;
        this.listError = '';
        this.applyFilterAndSort();
        this.openRouteTransactionIfReady();
      }, () => {
        this.allTransactionsLoaded = true;
        this.listError = 'Activity could not load all transactions. Try again or refresh the page.';
        this.applyFilterAndSort();
        this.cdr.markForCheck();
      });
      this.applyFilterAndSort();
      this.cdr.markForCheck();
    });

    this.reloadTransactionList();
  }

  private connectImportContextRefresh(): void {
    this.importContextRefresh$.pipe(
      startWith(undefined),
      debounceTime(60),
      switchMap(() => forkJoin({
        bankAccounts: this.financeService.getBankAccounts().pipe(catchError(() => of(null))),
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

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['typeFilter'] && !changes['typeFilter'].firstChange) {
      this.visibleRowCount = this.pageSize;
      this.applyFilterAndSort();
    }
  }

  private applyRouteQuery(params: any): void {
    const isInitial = !this.queryInitialized;
    this.searchTerm = params.get('q') || '';
    if (params.has('month')) {
      const month = params.get('month') || '';
      this.summaryMonth = month === 'all' ? '' : /^\d{4}-\d{2}$/.test(month) ? month : '';
    } else if (params.has('periodStart') || params.has('date') || params.has('from')) {
      this.summaryMonth = '';
    } else if (isInitial) {
      this.summaryMonth = this.currentMonthKey();
    }
    this.categoryFilter = params.get('category') ? normalizeSpendingLabel(params.get('category')) : '';
    this.merchantFilter = params.get('merchant') ? normalizeSpendingLabel(params.get('merchant')) : '';
    this.accountFilter = params.get('account') || '';
    this.receiptFilter = /^\d+$/.test(params.get('receipt') || '') ? params.get('receipt')! : '';
    this.reattachReceiptId = /^\d+$/.test(params.get('reattach') || '') ? Number(params.get('reattach')) : null;
    this.reattachReceiptFilename = params.get('reattach_file') || null;
    const review = params.get('review') || '';
    this.reviewFilter = review === 'needs' || review === 'unreviewed'
      ? 'unreviewed'
      : review === 'reviewed' ? 'reviewed' : 'all';
    this.fromDate = /^\d{4}-\d{2}-\d{2}$/.test(params.get('from') || '') ? params.get('from')! : '';
    this.throughDate = /^\d{4}-\d{2}-\d{2}$/.test(params.get('through') || '') ? params.get('through')! : '';
    const periodStart = params.get('periodStart') || '';
    const periodEnd = params.get('periodEnd') || '';
    const priorStart = params.get('priorStart') || '';
    const priorEnd = params.get('priorEnd') || '';
    this.reviewCurrentPeriod = /^\d{4}-\d{2}-\d{2}$/.test(periodStart) && /^\d{4}-\d{2}-\d{2}$/.test(periodEnd)
      ? { start: periodStart, end: periodEnd }
      : null;
    this.reviewPriorPeriod = /^\d{4}-\d{2}-\d{2}$/.test(priorStart) && /^\d{4}-\d{2}-\d{2}$/.test(priorEnd)
      ? { start: priorStart, end: priorEnd }
      : null;
    const calendarDate = params.get('date') || '';
    this.selectedCalendarDate = /^\d{4}-\d{2}-\d{2}$/.test(calendarDate) ? calendarDate : null;
    if (this.importsOnly && params.get('add') === '1' && !this.showImportModal) this.startImportWizard();
    if (!this.importsOnly && this.selectedCalendarDate && params.get('add') === '1' && !this.showModal) {
      this.newTx = { ...this.emptyTx(), date: this.selectedCalendarDate };
      this.showModal = true;
    }
    const editId = params.get('edit') || '';
    if (editId !== this.lastDeepLinkedEdit) {
      this.lastDeepLinkedEdit = editId;
      this.openRouteTransactionIfReady();
    }
    this.queryInitialized = true;
    this.visibleRowCount = this.pageSize;
    this.applyFilterAndSort();
  }

  private syncQueryParams(replaceUrl = false): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        q: this.searchTerm.trim() || null,
        month: this.summaryMonth || 'all',
        account: this.accountFilter || null,
        category: this.categoryFilter || null,
        merchant: this.merchantFilter || null,
        review: this.reviewFilter === 'all' ? null : this.reviewFilter === 'unreviewed' ? 'needs' : this.reviewFilter,
        from: this.fromDate || null,
        through: this.throughDate || null,
        receipt: this.receiptFilter || null,
        date: this.selectedCalendarDate || null,
        periodStart: this.reviewCurrentPeriod?.start || null,
        periodEnd: this.reviewCurrentPeriod?.end || null,
        priorStart: this.reviewPriorPeriod?.start || null,
        priorEnd: this.reviewPriorPeriod?.end || null,
      },
      queryParamsHandling: 'merge',
      replaceUrl,
    });
  }

  private openRouteTransactionIfReady(): void {
    if (!this.lastDeepLinkedEdit || !this.allTransactionsLoaded) return;
    const transaction = this.allTransactions.find(row => row.id === Number(this.lastDeepLinkedEdit));
    if (transaction) this.openTransactionEditor(transaction, false);
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

  retryActivityLoad(): void {
    this.listError = '';
    this.listLoading = true;
    this.financeService.getAllTransactions().pipe(takeUntil(this.destroy$)).subscribe({
      next: rows => {
        this.allTransactions = rows;
        this.allTransactionsLoaded = true;
        this.listLoading = false;
        this.applyFilterAndSort();
      },
      error: () => {
        this.listLoading = false;
        this.listError = 'Activity could not load all transactions. Try again or refresh the page.';
        this.cdr.markForCheck();
      },
    });
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

  get activityCategoryOptions(): string[] { return this.groupFilterOptions('category'); }

  get activityMerchantOptions(): string[] { return this.groupFilterOptions('merchant'); }

  get categorySelectOptions(): UiSelectOption[] {
    return [
      { value: '', label: 'All categories' },
      ...this.activityCategoryOptions.map(label => ({ value: normalizeSpendingLabel(label), label })),
    ];
  }

  get merchantSelectOptions(): UiSelectOption[] {
    return [
      { value: '', label: 'All merchants' },
      ...this.activityMerchantOptions.map(label => ({ value: normalizeSpendingLabel(label), label })),
    ];
  }

  get accountSelectOptions(): UiSelectOption[] {
    const accounts = new Map<string, string>();
    for (const account of this.bankAccounts) accounts.set(account.account_key, account.display_name);
    for (const row of this.allTransactions) {
      if (row.bank_account_key && !accounts.has(row.bank_account_key)) {
        accounts.set(row.bank_account_key, row.account_display || 'Bank account');
      }
    }
    return [
      { value: '', label: 'All accounts' },
      { value: UNASSIGNED_ACCOUNT_FILTER, label: 'Unassigned account' },
      ...[...accounts.entries()].sort((a, b) => a[1].localeCompare(b[1])).map(([value, label]) => ({ value, label })),
    ];
  }

  get categoryOptions(): string[] {
    const source = this.summaryMonth
      ? this.allTransactions.filter(row => row.date.startsWith(`${this.summaryMonth}-`))
      : this.allTransactions;
    return [...new Set(source.map(row => row.category).filter(category => !!category?.trim()))]
      .sort((a, b) => a.localeCompare(b));
  }

  get merchantOptions(): string[] {
    return Array.from(new Set(this.allTransactions.map(row => String(row.merchant || '').trim()).filter(Boolean)))
      .sort((a, b) => a.localeCompare(b));
  }

  private groupFilterOptions(dimension: SpendingReviewDimension): string[] {
    const source = this.allTransactionsLoaded ? this.allTransactions : (this.allTransactions.length ? this.allTransactions : this.transactions);
    const labels = new Map<string, string>();
    for (const row of source) {
      const key = spendingComparisonGroupKey(row, dimension);
      if (!labels.has(key)) labels.set(key, spendingComparisonGroupLabel(row, dimension));
    }
    return [...labels.values()].sort((a, b) => a.localeCompare(b));
  }

  get matchingTransactions(): Transaction[] {
    const source = this.allTransactionsLoaded ? this.allTransactions : (this.allTransactions.length ? this.allTransactions : this.transactions);
    return source.filter(row => this.matchesTransactionFilters(row));
  }

  get sortedMatchingTransactions(): Transaction[] {
    return [...this.matchingTransactions].sort((a, b) => {
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
  }

  private matchesTransactionFilters(row: Transaction): boolean {
    const query = this.searchTerm.trim().toLocaleLowerCase();
    if (query && ![row.description, row.category, row.merchant, row.account_display, row.kind]
      .some(value => String(value || '').toLocaleLowerCase().includes(query))) return false;
    if (this.typeFilter !== 'all' && (this.typeFilter === 'income'
      ? transactionEffects(row).income === 0
      : transactionEffects(row).spending === 0)) return false;
    if (this.summaryMonth && !row.date.startsWith(`${this.summaryMonth}-`)) return false;
    if (this.fromDate && row.date < this.fromDate) return false;
    if (this.throughDate && row.date > this.throughDate) return false;
    if (this.selectedCalendarDate && row.date !== this.selectedCalendarDate) return false;
    if (this.reviewCurrentPeriod && this.reviewPriorPeriod) {
      const inCurrent = row.date >= this.reviewCurrentPeriod.start && row.date <= this.reviewCurrentPeriod.end;
      const inPrior = row.date >= this.reviewPriorPeriod.start && row.date <= this.reviewPriorPeriod.end;
      if (!inCurrent && !inPrior) return false;
    }
    if (this.accountFilter === UNASSIGNED_ACCOUNT_FILTER && String(row.bank_account_key || '').trim()) return false;
    if (this.accountFilter && this.accountFilter !== UNASSIGNED_ACCOUNT_FILTER && row.bank_account_key !== this.accountFilter) return false;
    if (this.categoryFilter && spendingComparisonGroupKey(row, 'category') !== this.categoryFilter) return false;
    if (this.merchantFilter && spendingComparisonGroupKey(row, 'merchant') !== this.merchantFilter) return false;
    if (this.reviewFilter === 'unreviewed' && row.reviewed === true) return false;
    if (this.reviewFilter === 'reviewed' && row.reviewed !== true) return false;
    if (this.receiptFilter && Number(row.import_receipt_id) !== Number(this.receiptFilter)) return false;
    return true;
  }

  get sortPreset(): string {
    return `${this.sortColumn}-${this.sortDirection}`;
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

  private computeMonthTotals(matching = this.matchingTransactions) {
    const included = matching.filter(t => !['payment', 'transfer', 'ambiguous_credit'].includes(t.kind || ''));
    this.monthExpenseTotal = included.reduce((sum, t) => sum + transactionEffects(t).spending, 0);
    this.monthIncomeTotal = included.reduce((sum, t) => sum + transactionEffects(t).income, 0);
  }

  openImportModal() {
    if (this.importCommitting) return;
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { t: 'imports', add: '1' },
      queryParamsHandling: 'merge',
    });
  }

  reviewImportedReceipt(receipt: ImportReceipt): void {
    void this.router.navigate(['/spending'], {
      queryParams: {
        t: 'activity', v: 'spending', receipt: receipt.id, review: 'needs',
        month: null, date: null, from: null, through: null,
        periodStart: null, periodEnd: null, priorStart: null, priorEnd: null,
        edit: null, add: null,
      },
    });
  }

  reattachCorrectedCsv(receipt: ImportReceipt): void {
    const filename = this.receiptFirstParseFilename(receipt);
    void this.router.navigate(['/spending'], {
      queryParams: { t: 'imports', add: '1', reattach: receipt.id, reattach_file: filename },
    });
  }

  receiptHasReviewRows(receipt: ImportReceipt): boolean {
    return this.allTransactions.some(row => row.import_receipt_id === receipt.id && row.reviewed !== true);
  }

  receiptParseIssueCount(receipt: ImportReceipt): number {
    return (receipt.unresolved || []).filter(note => !/^Unclassified credit from /.test(note.reason)).length;
  }

  receiptFirstParseFilename(receipt: ImportReceipt): string {
    return (receipt.unresolved || []).find(note => !/^Unclassified credit from /.test(note.reason))?.filename || receipt.filenames[0] || '';
  }

  receiptReviewIssueCount(receipt: ImportReceipt): number {
    const importedNeedsReview = this.allTransactions.filter(row => row.import_receipt_id === receipt.id && row.reviewed !== true).length;
    const unresolvedCredits = (receipt.unresolved || []).filter(note => /^Unclassified credit from /.test(note.reason)).length;
    return Math.max(importedNeedsReview, unresolvedCredits);
  }

  private startImportWizard() {
    if (this.importCommitting) return;
    this.activeImportReceiptId = this.reattachReceiptId;
    this.showImportModal = true;
    this.cdr.markForCheck();
    this.financeService.getImportBanks().pipe(takeUntil(this.destroy$)).subscribe({
      next: banks => {
        this.importBanks = banks;
        this.cdr.markForCheck();
      },
    });
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
    this.activeImportReceiptId = null;
    this.cdr.markForCheck();
    if (this.route.snapshot.queryParamMap.get('add') === '1') {
      void this.router.navigate([], {
        relativeTo: this.route,
        queryParams: { add: null, reattach: null, reattach_file: null },
        queryParamsHandling: 'merge',
        replaceUrl: true,
      });
    }
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
    this.importContextRefresh$.next();
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
    const result = this.sortedMatchingTransactions;

    this.hasMore = result.length > this.visibleRowCount;
    this.filteredTransactions = result.slice(0, this.visibleRowCount);
    this.computeMonthTotals(result);
    this.cdr.markForCheck();
  }

  onSearchChange() {
    this.visibleRowCount = this.pageSize;
    this.syncQueryParams(true);
    this.reloadTransactionList();
  }

  onReviewFilterChange(value: string): void {
    this.reviewFilter = value as 'all' | 'unreviewed' | 'reviewed';
    this.visibleRowCount = this.pageSize;
    this.syncQueryParams();
    this.applyFilterAndSort();
  }

  onAccountFilterChange(): void {
    this.visibleRowCount = this.pageSize;
    this.syncQueryParams();
    this.applyFilterAndSort();
  }

  onMerchantFilterChange(): void {
    this.visibleRowCount = this.pageSize;
    this.syncQueryParams();
    this.applyFilterAndSort();
  }

  onDateRangeChange(): void {
    this.visibleRowCount = this.pageSize;
    this.summaryMonth = '';
    this.selectedCalendarDate = null;
    this.reviewCurrentPeriod = null;
    this.reviewPriorPeriod = null;
    this.syncQueryParams();
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
    this.fromDate = '';
    this.throughDate = '';
    this.selectedCalendarDate = null;
    this.reviewCurrentPeriod = null;
    this.reviewPriorPeriod = null;
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

  clearFilters(): void {
    this.searchTerm = '';
    this.categoryFilter = '';
    this.merchantFilter = '';
    this.accountFilter = '';
    this.receiptFilter = '';
    this.reviewFilter = 'all';
    this.summaryMonth = '';
    this.fromDate = '';
    this.throughDate = '';
    this.selectedCalendarDate = null;
    this.reviewCurrentPeriod = null;
    this.reviewPriorPeriod = null;
    this.visibleRowCount = this.pageSize;
    this.syncQueryParams();
    this.applyFilterAndSort();
  }

  get hasActiveFilters(): boolean {
    return !!(this.searchTerm || this.categoryFilter || this.merchantFilter || this.accountFilter || this.receiptFilter
      || this.reviewFilter !== 'all' || this.summaryMonth || this.fromDate || this.throughDate || this.selectedCalendarDate
      || this.reviewCurrentPeriod || this.reviewPriorPeriod);
  }

  get reviewPeriodCaption(): string {
    if (!this.reviewCurrentPeriod || !this.reviewPriorPeriod) return '';
    return `Spending review · ${this.reviewCurrentPeriod.start}–${this.reviewCurrentPeriod.end} compared with ${this.reviewPriorPeriod.start}–${this.reviewPriorPeriod.end}`;
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
    this.transactionSaveError = '';
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
        this.transactionSaveError = 'Could not save this transaction. Your changes are still here; try again.';
        this.toastService.error('Could not save transaction. Your changes are still here; try again.');
        this.cdr.markForCheck();
      },
    });
  }

  editTransaction(tx: Transaction) {
    this.openTransactionEditor(tx, true);
  }

  private openTransactionEditor(tx: Transaction, updateUrl: boolean): void {
    this.editingTxId = tx.id;
    this.editingImported = tx.source === 'import';
    this.transactionSaveError = '';
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
    if (updateUrl) {
      this.lastDeepLinkedEdit = String(tx.id);
      void this.router.navigate([], {
        relativeTo: this.route,
        queryParams: { edit: tx.id },
        queryParamsHandling: 'merge',
      });
    }
    this.cdr.markForCheck();
  }

  closeModal() {
    this.showModal = false;
    this.editingTxId = null;
    this.editingImported = false;
    this.transactionSaveError = '';
    this.newTx = this.emptyTx();
    this.lastDeepLinkedEdit = '';
    const params = this.route.snapshot.queryParamMap;
    if (params.get('add') === '1' || params.has('edit')) {
      void this.router.navigate([], {
        relativeTo: this.route,
        queryParams: { add: null, edit: null },
        queryParamsHandling: 'merge',
        replaceUrl: true,
      });
    }
    this.cdr.markForCheck();
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
      this.sortedMatchingTransactions.map(t => [
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
