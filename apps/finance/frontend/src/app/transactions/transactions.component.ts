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
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { FinanceService } from '../services/finance.service';
import { TransactionsImportWorkflow } from './transactions-import-workflow';
import { TransactionsEditorWorkflow } from './transactions-editor-workflow';
import {
  filterTransactionActivity,
  paginateTransactionActivity,
  sortTransactionActivity,
  transactionActivityTotals,
} from './transactions-activity-query';
import { computeCashflowSummary, monthEnd, transactionEffects } from '../crypto/client-finance';
import {
  BankImportOption,
  BankAccountRecord,
  BankImportFile,
  BankImportFilePreview,
  ImportPreviewRow,
  ImportReceipt,
  IncomeCashflowOccurrence,
  JobIncome,
  Transaction,
  TransactionCreate,
} from '../models/transaction.model';
import { ConfirmService, ToastService, failureCopy } from '@vivek/ui';
import { downloadCsv, excludedAmountNote, plural } from '@vivek/browser';
import { focusField } from '../shared/form-validation';
import {
  normalizeSpendingLabel,
  spendingGroupKey,
  spendingGroupLabel,
  SpendingGroupDimension,
  UNASSIGNED_ACCOUNT_FILTER,
} from '../utils/spending-filter.util';
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
} from '@vivek/ui';
import { InfoTipComponent } from '../shared/info-tip.component';
import { MoneyPipe } from '../shared/pipes/money.pipe';
import { AppDatePipe } from '../shared/pipes/app-date.pipe';
import { PluralPipe } from '../shared/pipes/plural.pipe';

@Component({
  selector: 'app-transactions',
  standalone: true,
  imports: [
    PluralPipe,
    AppDatePipe,
    MoneyPipe,
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
    RouterLink,
    InfoTipComponent,
  ],
  templateUrl: './transactions.component.html',
  styleUrl: './transactions.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [TransactionsImportWorkflow, TransactionsEditorWorkflow],
})
export class TransactionsComponent implements OnInit, OnChanges, OnDestroy {
  readonly transactionEffects = transactionEffects;
  @Input() embedded = false;
  @Input() typeFilter: 'all' | 'income' | 'expense' = 'all';
  @Input() receiptsOpen = false;
  receiptsDetailsOpen = false;
  readonly activityViewOptions: UiSelectOption[] = [
    { value: 'all', label: 'All' },
    { value: 'spending', label: 'Spending' },
    { value: 'income', label: 'Income' },
  ];
  transactions: Transaction[] = [];
  filteredTransactions: Transaction[] = [];
  allTransactions: Transaction[] = [];
  jobIncomes: JobIncome[] = [];
  searchTerm = '';
  categoryFilter = '';
  merchantFilter = '';
  accountFilter = '';
  receiptFilter = '';
  fromDate = '';
  throughDate = '';
  sortColumn: 'date' | 'category' | 'amount' = 'date';
  sortDirection: 'asc' | 'desc' = 'desc';

  /** YYYY-MM — drives monthly totals on this page */
  summaryMonth = this.currentMonthKey();

  get showModal(): boolean { return this.transactionEditor.showModal; }
  set showModal(value: boolean) { this.transactionEditor.showModal = value; }
  get newTx(): TransactionCreate { return this.transactionEditor.newTx; }
  set newTx(value: TransactionCreate) { this.transactionEditor.newTx = value; }
  get editingTxId(): number | null { return this.transactionEditor.editingTxId; }
  get editingImported(): boolean { return this.transactionEditor.editingImported; }
  get saving(): boolean { return this.transactionEditor.saving; }
  get transactionSaveError(): string { return this.transactionEditor.transactionSaveError; }
  get showImportModal(): boolean { return this.importWorkflow.showImportModal; }
  set showImportModal(value: boolean) { this.importWorkflow.showImportModal = value; }
  get importBanks(): BankImportOption[] { return this.importWorkflow.importBanks; }
  set importBanks(value: BankImportOption[]) { this.importWorkflow.importBanks = value; }
  get bankAccounts(): BankAccountRecord[] { return this.importWorkflow.bankAccounts; }
  set bankAccounts(value: BankAccountRecord[]) { this.importWorkflow.bankAccounts = value; }
  get importReceipts(): ImportReceipt[] { return this.importWorkflow.importReceipts; }
  set importReceipts(value: ImportReceipt[]) { this.importWorkflow.importReceipts = value; }
  get importBankSelectOptions(): UiSelectOption[] {
    return [{ value: '', label: 'Select bank' }, ...this.importBanks.map(b => ({ value: b.slug, label: b.name }))];
  }
  get importStep(): 'upload' | 'preview' { return this.importWorkflow.importStep; }
  set importStep(value: 'upload' | 'preview') { this.importWorkflow.importStep = value; }
  get importFiles(): BankImportFile[] { return this.importWorkflow.importFiles; }
  set importFiles(value: BankImportFile[]) { this.importWorkflow.importFiles = value; }
  get importPreviews(): BankImportFilePreview[] { return this.importWorkflow.importPreviews; }
  set importPreviews(value: BankImportFilePreview[]) { this.importWorkflow.importPreviews = value; }
  get importSelected(): Set<string> { return this.importWorkflow.importSelected; }
  get importParsing(): boolean { return this.importWorkflow.importParsing; }
  get importCommitting(): boolean { return this.importWorkflow.importCommitting; }
  get importError(): string { return this.importWorkflow.importError; }
  set importError(value: string) { this.importWorkflow.importError = value; }
  get activeImportReceiptId(): number | null { return this.importWorkflow.activeImportReceiptId; }
  set activeImportReceiptId(value: number | null) { this.importWorkflow.activeImportReceiptId = value; }
  get reattachReceiptFilename(): string | null { return this.importWorkflow.reattachReceiptFilename; }
  set reattachReceiptFilename(value: string | null) { this.importWorkflow.reattachReceiptFilename = value; }
  loading = false;
  listError = '';
  jobIncomeLoading = true;
  jobIncomeLoadError = false;
  reattachReceiptId: number | null = null;
  selectedCalendarDate: string | null = null;

  monthExpenseTotal = 0;
  monthIncomeTotal = 0;
  purchaseCount = 0;
  incomeCount = 0;
  excludedCount = 0;
  categoryMergeFrom = '';
  categoryMergeTo = '';
  categoryMergeSaving = false;
  categoryToolError = '';
  categoryBulkRows: { fromCategory: string; toCategory: string }[] = [this.emptyBulkRenameRow()];
  bulkMerchant = '';
  bulkMerchantCategory = '';

  readonly pageSize = 100;
  visibleRowCount = this.pageSize;
  loadingMore = false;
  hasMore = true;
  listLoading = false;

  private destroy$ = new Subject<void>();
  private allTransactionsLoaded = false;
  private queryInitialized = false;
  private lastDeepLinkedEdit = '';

  constructor(
    private financeService: FinanceService,
    private toastService: ToastService,
    private confirmService: ConfirmService,
    private cdr: ChangeDetectorRef,
    private route: ActivatedRoute,
    private router: Router,
    readonly importWorkflow: TransactionsImportWorkflow,
    readonly transactionEditor: TransactionsEditorWorkflow,
  ) {}

  private currentMonthKey(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
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

    this.financeService.jobIncomes$.pipe(takeUntil(this.destroy$)).subscribe(rows => {
      this.jobIncomes = rows;
      this.cdr.markForCheck();
    });

    this.financeService.getJobIncomes().pipe(takeUntil(this.destroy$)).subscribe({
      next: rows => {
        this.jobIncomes = rows;
        this.jobIncomeLoading = false;
        this.jobIncomeLoadError = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.jobIncomeLoading = false;
        this.jobIncomeLoadError = true;
        this.cdr.markForCheck();
      },
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
    this.importWorkflow.connectImportContextRefresh();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['receiptsOpen']) this.receiptsDetailsOpen = this.receiptsOpen;
    if (changes['typeFilter'] && !changes['typeFilter'].firstChange) {
      this.visibleRowCount = this.pageSize;
      this.applyFilterAndSort();
    }
  }

  get activityView(): 'all' | 'spending' | 'income' {
    return this.typeFilter === 'income' ? 'income' : this.typeFilter === 'expense' ? 'spending' : 'all';
  }

  onActivityViewChange(value: string): void {
    const view = value === 'income' || value === 'spending' ? value : 'all';
    if (view === this.activityView) return;
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { v: view },
      queryParamsHandling: 'merge',
    });
  }

  onReceiptsToggle(event: Event): void {
    const details = event.target as HTMLDetailsElement | null;
    if (details) this.receiptsDetailsOpen = details.open;
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
    this.fromDate = /^\d{4}-\d{2}-\d{2}$/.test(params.get('from') || '') ? params.get('from')! : '';
    this.throughDate = /^\d{4}-\d{2}-\d{2}$/.test(params.get('through') || '') ? params.get('through')! : '';
    const calendarDate = params.get('date') || '';
    this.selectedCalendarDate = /^\d{4}-\d{2}-\d{2}$/.test(calendarDate) ? calendarDate : null;
    if (params.get('add') === '1' && !this.selectedCalendarDate && !this.showImportModal) this.startImportWizard();
    if (this.selectedCalendarDate && params.get('add') === '1' && !this.showModal) {
      this.transactionEditor.openAddModal(this.selectedCalendarDate);
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
        from: this.fromDate || null,
        through: this.throughDate || null,
        receipt: this.receiptFilter || null,
        date: this.selectedCalendarDate || null,
        review: null,
        periodStart: null,
        periodEnd: null,
        priorStart: null,
        priorEnd: null,
        group: null,
        dimension: null,
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
    this.destroy$.next();
    this.destroy$.complete();
  }

  importBank(slug: string): BankImportOption | undefined { return this.importWorkflow.importBank(slug); }
  get canPreviewImport(): boolean { return this.importWorkflow.canPreviewImport; }
  get canSaveImport(): boolean { return this.importWorkflow.canSaveImport; }
  get importRows(): ImportPreviewRow[] { return this.importWorkflow.importRows; }
  get importSummary() { return this.importWorkflow.importSummary; }

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

  private groupFilterOptions(dimension: SpendingGroupDimension): string[] {
    const source = this.allTransactionsLoaded ? this.allTransactions : (this.allTransactions.length ? this.allTransactions : this.transactions);
    const labels = new Map<string, string>();
    for (const row of source) {
      const key = spendingGroupKey(row, dimension);
      if (!labels.has(key)) labels.set(key, spendingGroupLabel(row, dimension));
    }
    return [...labels.values()].sort((a, b) => a.localeCompare(b));
  }

  private get activityFilters() {
    return {
      searchTerm: this.searchTerm,
      typeFilter: this.typeFilter,
      summaryMonth: this.summaryMonth,
      fromDate: this.fromDate,
      throughDate: this.throughDate,
      selectedCalendarDate: this.selectedCalendarDate,
      accountFilter: this.accountFilter,
      categoryFilter: this.categoryFilter,
      merchantFilter: this.merchantFilter,
      receiptFilter: this.receiptFilter,
    };
  }

  get matchingTransactions(): Transaction[] {
    const source = this.allTransactionsLoaded ? this.allTransactions : (this.allTransactions.length ? this.allTransactions : this.transactions);
    return filterTransactionActivity(source, this.activityFilters);
  }

  /** Scheduled work income is only summarized over an explicit, finite date scope. */
  get workIncomePeriod(): { start: string; end: string; label: string } | null {
    const hasMonth = /^\d{4}-\d{2}$/.test(this.summaryMonth);
    const hasSelectedDate = /^\d{4}-\d{2}-\d{2}$/.test(this.selectedCalendarDate || '');
    const hasFromDate = /^\d{4}-\d{2}-\d{2}$/.test(this.fromDate);
    const hasThroughDate = /^\d{4}-\d{2}-\d{2}$/.test(this.throughDate);
    let start: string;
    let end: string;
    if (hasSelectedDate) {
      start = this.selectedCalendarDate!;
      end = this.selectedCalendarDate!;
    } else if (hasMonth) {
      start = `${this.summaryMonth}-01`;
      end = monthEnd(this.summaryMonth);
    } else if (hasFromDate && hasThroughDate) {
      start = this.fromDate;
      end = this.throughDate;
    } else {
      return null;
    }

    // Activity filters can combine a month, date, and range. Keep this summary
    // on the same date intersection as the ledger table.
    if (hasMonth) {
      const monthStart = `${this.summaryMonth}-01`;
      const monthLastDay = monthEnd(this.summaryMonth);
      if (monthStart > start) start = monthStart;
      if (monthLastDay < end) end = monthLastDay;
    }
    if (hasFromDate && this.fromDate > start) start = this.fromDate;
    if (hasThroughDate && this.throughDate < end) end = this.throughDate;
    if (start > end) return null;
    return {
      start,
      end,
      label: start === end ? start : `${start}–${end}`,
    };
  }

  get workIncomeSummary() {
    const period = this.workIncomePeriod;
    if (!period || !this.allTransactionsLoaded || this.listError || this.jobIncomeLoading || this.jobIncomeLoadError) return null;
    return computeCashflowSummary(period.start, period.end, this.allTransactions, this.jobIncomes, [], []);
  }

  get workIncomeLoading(): boolean {
    return !this.allTransactionsLoaded || this.jobIncomeLoading;
  }

  get workIncomeSources(): IncomeCashflowOccurrence[] {
    return this.workIncomeSummary?.income_occurrences.filter(row => row.kind !== 'posted') || [];
  }

  get sortedMatchingTransactions(): Transaction[] {
    return sortTransactionActivity(this.matchingTransactions, this.sortColumn, this.sortDirection);
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


  openImportModal() {
    if (this.importWorkflow.importCommitting) return;
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { t: 'activity', receipts: '1', add: '1' },
      queryParamsHandling: 'merge',
    });
  }

  viewImportedTransactions(receipt: ImportReceipt): void {
    void this.router.navigate(['/spending'], {
      queryParams: {
        t: 'activity', v: 'all', receipt: receipt.id, receipts: null,
        month: null, date: null, from: null, through: null,
        periodStart: null, periodEnd: null, priorStart: null, priorEnd: null,
        group: null, dimension: null, review: null, edit: null, add: null,
      },
    });
  }

  reattachCorrectedCsv(receipt: ImportReceipt): void {
    const filename = this.receiptFirstParseFilename(receipt);
    void this.router.navigate(['/spending'], {
      queryParams: { t: 'activity', receipts: '1', add: '1', reattach: receipt.id, reattach_file: filename },
    });
  }

  receiptTransactionCount(receipt: ImportReceipt): number {
    return this.allTransactions.filter(row => row.import_receipt_id === receipt.id).length;
  }

  receiptNeedsClassificationCount(receipt: ImportReceipt): number {
    return this.allTransactions.filter(row => row.import_receipt_id === receipt.id && row.kind === 'ambiguous_credit').length;
  }

  receiptParseIssueCount(receipt: ImportReceipt): number {
    return (receipt.unresolved || []).filter(note => !/^Unclassified credit from /.test(note.reason)).length;
  }

  receiptFirstParseFilename(receipt: ImportReceipt): string {
    return (receipt.unresolved || []).find(note => !/^Unclassified credit from /.test(note.reason))?.filename || receipt.filenames[0] || '';
  }

  private startImportWizard(): void {
    this.importWorkflow.startImportWizard(this.reattachReceiptId);
  }

  onImportBankChange(): void { this.importWorkflow.onImportBankChange(); }
  onImportBankSelectionChange(entry: BankImportFile, value: string): void { this.importWorkflow.onImportBankSelectionChange(entry, value); }
  accountOptionsFor(entry: BankImportFile): BankAccountRecord[] { return this.importWorkflow.accountOptionsFor(entry); }
  onImportAccountChange(entry: BankImportFile, value: string): void { this.importWorkflow.onImportAccountChange(entry, value); }
  onNewAccountLabelChange(entry: BankImportFile): void { this.importWorkflow.onNewAccountLabelChange(entry); }
  onLegacyAccountMappingChange(entry: BankImportFile, checked: boolean): void { this.importWorkflow.onLegacyAccountMappingChange(entry, checked); }
  closeImportModal(): void { this.importWorkflow.closeImportModal(); }
  onImportFileSelected(event: Event): void { this.importWorkflow.onImportFileSelected(event); }
  removeImportFile(id: number): void { this.importWorkflow.removeImportFile(id); }
  backToImportFiles(): void { this.importWorkflow.backToImportFiles(); }
  runImportPreview(): void { this.importWorkflow.runImportPreview(); }
  toggleImportRow(row: ImportPreviewRow): void { this.importWorkflow.toggleImportRow(row); }
  isImportRowSelected(row: ImportPreviewRow): boolean { return this.importWorkflow.isImportRowSelected(row); }
  selectAllNewImportRows(): void { this.importWorkflow.selectAllNewImportRows(); }
  clearImportSelection(): void { this.importWorkflow.clearImportSelection(); }
  get selectedImportCount(): number { return this.importWorkflow.selectedImportCount; }
  get legacyMappingCount(): number { return this.importWorkflow.legacyMappingCount; }
  get importActionLabel(): string { return this.importWorkflow.importActionLabel; }
  get selectedImportExpenseTotal(): number { return this.importWorkflow.selectedImportExpenseTotal; }
  setImportKind(row: ImportPreviewRow, value: string): void { this.importWorkflow.setImportKind(row, value); }
  useMerchantSuggestion(row: ImportPreviewRow): void { this.importWorkflow.useMerchantSuggestion(row); }
  get supportedImporterNames(): string { return this.importWorkflow.supportedImporterNames; }
  commitImport(): void { this.importWorkflow.commitImport(); }
  resumeImport(receipt: ImportReceipt): void { this.importWorkflow.resumeImport(receipt); }
  undoImport(receipt: ImportReceipt): Promise<void> { return this.importWorkflow.undoImport(receipt); }

  focusNamed(field: string): void {
    focusField(document.getElementById('transaction-form'), field);
  }

  openAddModal(): void {
    this.transactionEditor.openAddModal(this.selectedCalendarDate);
  }

  applyFilterAndSort() {
    const result = this.sortedMatchingTransactions;
    const page = paginateTransactionActivity(result, this.visibleRowCount);
    const totals = transactionActivityTotals(result);

    this.hasMore = page.hasMore;
    this.filteredTransactions = page.rows;
    this.monthExpenseTotal = totals.monthExpenseTotal;
    this.monthIncomeTotal = totals.monthIncomeTotal;
    this.purchaseCount = totals.purchaseCount;
    this.incomeCount = totals.incomeCount;
    this.excludedCount = totals.excludedCount;
    this.cdr.markForCheck();
  }

  onSearchChange() {
    this.visibleRowCount = this.pageSize;
    this.syncQueryParams(true);
    this.reloadTransactionList();
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
    this.syncQueryParams();
    this.applyFilterAndSort();
  }

  transactionLabel(tx: Transaction): string {
    return tx.kind === 'ambiguous_credit' ? 'Credit type needed' : tx.kind || tx.type;
  }

  transactionNeedsFixing(tx: Transaction): boolean {
    return !!transactionEffects(tx).excluded;
  }

  excludedNote(): string | null {
    return excludedAmountNote(this.excludedCount);
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
    this.summaryMonth = '';
    this.fromDate = '';
    this.throughDate = '';
    this.selectedCalendarDate = null;
    this.visibleRowCount = this.pageSize;
    this.syncQueryParams();
    this.applyFilterAndSort();
  }

  get hasActiveFilters(): boolean {
    return !!(this.searchTerm || this.categoryFilter || this.merchantFilter || this.accountFilter || this.receiptFilter
      || this.summaryMonth || this.fromDate || this.throughDate || this.selectedCalendarDate);
  }

  async mergeCategory(): Promise<void> {
    const from = this.categoryMergeFrom.trim();
    const to = this.categoryMergeTo.trim();
    if (!from || !to) {
      this.categoryToolError = 'Choose a source and target category.';
      this.cdr.markForCheck();
      return;
    }
    if (from === to) {
      this.categoryToolError = 'Choose two different categories.';
      this.cdr.markForCheck();
      return;
    }
    this.categoryToolError = '';

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
          this.toastService.success(`Updated ${plural(result.updated, 'transaction')}`);
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
      this.categoryToolError = 'Add at least one valid category rename.';
      this.cdr.markForCheck();
      return;
    }
    this.categoryToolError = '';

    const ok = await this.confirmService.ask(
      'Bulk rename categories?',
      `Apply ${plural(rows.length, 'category rename')} across all transactions?`,
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
          this.toastService.success(`Updated ${plural(result.updated, 'transaction')}`);
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
      this.categoryToolError = 'Choose a merchant and a category.';
      this.cdr.markForCheck();
      return;
    }
    this.categoryToolError = '';
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
        this.toastService.success(`Updated ${plural(result.updated, 'transaction')}`);
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

  saveTransaction(): void {
    this.transactionEditor.saveTransaction();
  }

  editTransaction(tx: Transaction) {
    this.openTransactionEditor(tx, true);
  }

  private openTransactionEditor(tx: Transaction, updateUrl: boolean): void {
    this.transactionEditor.openTransactionEditor(tx);
    if (updateUrl) {
      this.lastDeepLinkedEdit = String(tx.id);
      void this.router.navigate([], {
        relativeTo: this.route,
        queryParams: { edit: tx.id },
        queryParamsHandling: 'merge',
      });
    }
  }

  closeModal(): void {
    this.transactionEditor.closeModal();
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

    this.removeTransaction(tx, backup);
  }

  private removeTransaction(tx: Transaction, backup: TransactionCreate): void {
    this.financeService.deleteTransaction(tx.id, true).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.toastService.success('Transaction deleted', () => this.restoreTransaction(backup));
      },
      error: () => {
        this.toastService.error(failureCopy('delete', 'this transaction'), {
          label: 'Try again',
          run: () => this.removeTransaction(tx, backup),
        });
      },
    });
  }

  private restoreTransaction(backup: TransactionCreate): void {
    // Keep the error toast if the user leaves this page while the restore is in flight.
    this.financeService.addTransaction(backup, true).subscribe({
      error: () => {
        this.toastService.error(failureCopy('restore', 'this transaction'), {
          label: 'Try again',
          run: () => this.restoreTransaction(backup),
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
