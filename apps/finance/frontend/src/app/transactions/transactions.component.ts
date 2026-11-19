import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  Input,
  inject,
  OnChanges,
  OnDestroy,
  OnInit,
  SimpleChanges,
  ViewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { catchError, merge, of, Subject, switchMap, take, takeUntil, tap } from 'rxjs';
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
import { ConfirmService, SESSION_CONTEXT, ToastService, failureCopy, isReturnDate } from '@vivek/ui';
import { readLockEpoch } from '../crypto/dek-holder';
import { bindLockSnapshots } from '../crypto/lock-finance';
import { normalizeTripId, tripTagChoices, type TripTagHome } from './trip-tag';
import { downloadCsv, formatDate, plural } from '@vivek/browser';
import { excludedAmountNote } from '../utils/validators';
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
  UiSelectComponent,
  UiSelectOption,
  UiDataTableComponent,
  UiDialogComponent,
} from '@vivek/ui';
import { MoneyPipe } from '@vivek/ui';
import { AppDatePipe } from '@vivek/ui';
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
    UiSelectComponent,
    UiDataTableComponent,
    UiDialogComponent,
    RouterLink,
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
  tripFilter = '';
  private tripHome: TripTagHome | null = null;
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
  refundCount = 0;
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

  private readonly destroy$ = new Subject<void>();
  private readonly retryRows$ = new Subject<void>();
  private readonly session = inject(SESSION_CONTEXT, { optional: true });
  private readonly openedLock = readLockEpoch();
  private readonly releaseLock = bindLockSnapshots(() => this.invalidateActivity());
  private active = true;
  private readonly deleting = new Set<number>();
  private readonly rowToastIds = new Set<number>();
  private allTransactionsLoaded = false;
  private queryInitialized = false;
  private lastDeepLinkedEdit = '';
  /** The edit id already opened, so a later ledger refresh does not reopen a closed dialog. */
  private consumedEditLink = '';
  private datedAddLink: string | null = null;

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

    this.session?.cleared$?.pipe(takeUntil(this.destroy$)).subscribe(() => this.invalidateActivity());
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

    merge(
      this.financeService.transactions$.pipe(tap(rows => { this.transactions = rows; })),
      this.retryRows$,
    ).pipe(
      switchMap(() => {
        if (!this.allTransactionsLoaded) this.listLoading = true;
        this.applyFilterAndSort();
        return this.financeService.getAllTransactions().pipe(catchError(() => of(null)));
      }),
      takeUntil(this.destroy$),
    ).subscribe(rows => {
      this.listLoading = false;
      this.allTransactionsLoaded = true;
      if (rows) {
        this.allTransactions = rows;
        this.listError = '';
        this.openRouteTransactionIfReady();
      } else {
        this.listError = 'Activity could not load all transactions. Try again or refresh the page.';
      }
      this.applyFilterAndSort();
    });
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
    } else if (params.has('periodStart') || params.has('date') || params.has('from') || params.has('through')) {
      this.summaryMonth = '';
    } else if (isInitial) {
      this.summaryMonth = this.currentMonthKey();
    }
    this.categoryFilter = normalizeSpendingLabel(params.get('category') || '');
    this.merchantFilter = normalizeSpendingLabel(params.get('merchant') || '');
    this.accountFilter = params.get('account') || '';
    this.receiptFilter = /^\d+$/.test(params.get('receipt') || '') ? params.get('receipt')! : '';
    this.reattachReceiptId = /^\d+$/.test(params.get('reattach') || '') ? Number(params.get('reattach')) : null;
    this.reattachReceiptFilename = params.get('reattach_file') || null;
    const trip = params.get('trip') || '';
    this.tripFilter = trip === 'none' || normalizeTripId(trip) !== null ? trip : '';
    const from = params.get('from') || '';
    const through = params.get('through') || '';
    this.fromDate = isReturnDate(from) ? from : '';
    this.throughDate = isReturnDate(through) ? through : '';
    const calendarDate = params.get('date') || '';
    this.selectedCalendarDate = isReturnDate(calendarDate) ? calendarDate : null;
    if (params.get('add') === '1' && !params.has('date') && !this.showImportModal) this.startImportWizard();
    const addDate = params.get('add') === '1' ? this.selectedCalendarDate : null;
    const editId = params.get('edit') || '';
    if ((this.lastDeepLinkedEdit && this.lastDeepLinkedEdit !== editId)
      || (this.datedAddLink && this.datedAddLink !== addDate)) {
      this.transactionEditor.dismiss();
    }
    this.datedAddLink = addDate;
    if (addDate && !this.showModal) this.transactionEditor.openAddModal(addDate);
    if (editId !== this.lastDeepLinkedEdit) {
      this.lastDeepLinkedEdit = editId;
      this.consumedEditLink = '';
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
        trip: this.tripFilter || null,
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
    if (this.consumedEditLink === this.lastDeepLinkedEdit) return;
    const transaction = this.allTransactions.find(row => row.id === Number(this.lastDeepLinkedEdit));
    if (transaction) this.openTransactionEditor(transaction, false);
  }

  loadMoreTransactions(): void {
    if (!this.hasMore) return;
    this.visibleRowCount += this.pageSize;
    this.applyFilterAndSort();
  }

  retryActivityLoad(): void {
    this.listError = '';
    this.listLoading = true;
    this.retryRows$.next();
  }

  ngOnDestroy(): void {
    this.releaseLock();
    this.invalidateActivity();
    this.destroy$.complete();
    this.retryRows$.complete();
  }

  private invalidateActivity(): void {
    if (!this.active) return;
    this.active = false;
    this.destroy$.next();
    this.transactionEditor.dismiss();
    for (const id of this.rowToastIds) this.toastService.dismiss(id);
    this.rowToastIds.clear();
    this.deleting.clear();
    this.restoreInFlight.clear();
    this.tripHome = null;
    this.transactions = [];
    this.allTransactions = [];
    this.jobIncomes = [];
    this.categoryMergeFrom = '';
    this.categoryMergeTo = '';
    this.categoryBulkRows = [this.emptyBulkRenameRow()];
    this.bulkMerchant = '';
    this.bulkMerchantCategory = '';
    this.applyFilterAndSort();
  }

  private isCurrent(session: number): boolean {
    return this.active && this.openedLock === readLockEpoch() && this.financeService.sessionToken === session;
  }

  importBank(slug: string): BankImportOption | undefined { return this.importWorkflow.importBank(slug); }
  get canPreviewImport(): boolean { return this.importWorkflow.canPreviewImport; }
  get canSaveImport(): boolean { return this.importWorkflow.canSaveImport; }
  get importRows(): ImportPreviewRow[] { return this.importWorkflow.importRows; }
  get importSummary() { return this.importWorkflow.importSummary; }

  get summaryMonthLabel(): string {
    return this.summaryMonth ? formatDate(`${this.summaryMonth}-01`, 'month') : 'All time';
  }

  get periodMonthName(): string {
    return this.summaryMonth ? formatDate(`${this.summaryMonth}-01`, 'month').split(' ')[0] : '';
  }

  /** The month alone is not a narrowing filter; the eyebrow already shows it. */
  get hasNarrowingFilters(): boolean {
    return !!(this.searchTerm || this.categoryFilter || this.merchantFilter || this.accountFilter
      || this.receiptFilter || this.tripFilter || this.fromDate || this.throughDate || this.selectedCalendarDate
      || (!this.embedded && this.activityView !== 'all'));
  }

  get periodEyebrow(): string {
    if (this.selectedCalendarDate) return formatDate(this.selectedCalendarDate, 'heading');
    if (this.fromDate && this.throughDate) return `${formatDate(this.fromDate, 'table')} – ${formatDate(this.throughDate, 'table')}`;
    if (this.fromDate) return `From ${formatDate(this.fromDate, 'table')}`;
    if (this.throughDate) return `Through ${formatDate(this.throughDate, 'table')}`;
    return this.summaryMonthLabel + (this.hasNarrowingFilters ? ' · filtered' : '');
  }

  get showPeriodFigures(): boolean {
    return this.matchingTransactions.length > 0;
  }

  get spentCountLabel(): string {
    const parts: string[] = [];
    if (this.purchaseCount > 0) parts.push(plural(this.purchaseCount, 'purchase'));
    if (this.refundCount > 0) parts.push(plural(this.refundCount, 'refund'));
    return parts.length ? parts.join(', ') : 'No purchases';
  }

  get incomeCountLabel(): string {
    return this.incomeCount ? plural(this.incomeCount, 'deposit') : 'No income';
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

  get tripSelectOptions(): UiSelectOption[] {
    const names = new Map(tripTagChoices(this.tripHome, null).map(choice => [choice.id, choice.label]));
    const ids = new Set(this.allTransactions.map(row => normalizeTripId(row.trip_id)));
    ids.add(normalizeTripId(this.tripFilter));
    const tags = [...ids].filter(id => id !== null).sort((a, b) => a - b);
    return [
      { value: '', label: 'All trips' },
      { value: 'none', label: 'No trip' },
      ...tags.map(id => ({ value: String(id), label: names.get(id) ?? `Trip #${id}` })),
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
      tripFilter: this.tripFilter,
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
      queryParams: { t: null, receipts: '1', add: '1' },
      queryParamsHandling: 'merge',
    });
  }

  viewImportedTransactions(receipt: ImportReceipt): void {
    void this.router.navigate(['/finance/spending'], {
      queryParams: {
        t: null, v: 'all', receipt: receipt.id, receipts: null,
        month: null, date: null, from: null, through: null,
        periodStart: null, periodEnd: null, priorStart: null, priorEnd: null,
        group: null, dimension: null, review: null, edit: null, add: null,
      },
    });
  }

  reattachCorrectedCsv(receipt: ImportReceipt): void {
    const filename = this.receiptFirstParseFilename(receipt);
    void this.router.navigate(['/finance/spending'], {
      queryParams: { t: null, receipts: '1', add: '1', reattach: receipt.id, reattach_file: filename },
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
    this.refundCount = totals.refundCount;
    this.incomeCount = totals.incomeCount;
    this.excludedCount = totals.excludedCount;
    this.cdr.markForCheck();
  }

  applyFilters(replaceUrl = false): void {
    this.visibleRowCount = this.pageSize;
    this.syncQueryParams(replaceUrl);
    this.applyFilterAndSort();
  }

  onExactDateChange(date: string): void {
    this.selectedCalendarDate = isReturnDate(date) ? date : null;
    this.summaryMonth = '';
    this.fromDate = '';
    this.throughDate = '';
    this.applyFilters();
  }

  onDateRangeChange(): void {
    this.summaryMonth = '';
    this.selectedCalendarDate = null;
    this.applyFilters();
  }

  transactionLabel(tx: Transaction): string {
    return tx.kind === 'ambiguous_credit' ? 'Credit type needed' : tx.kind || tx.type;
  }

  /** IMP-06 kind badge; purchases get none — the sign and colour say it. */
  transactionBadge(tx: Transaction): { label: string; variant: 'default' | 'success' | 'warning' } | null {
    if (this.transactionNeedsFixing(tx)) return { label: 'Needs fixing', variant: 'warning' };
    switch (tx.kind) {
      case 'ambiguous_credit': return { label: 'Credit type needed', variant: 'warning' };
      case 'refund': return { label: 'Refund', variant: 'success' };
      case 'income': return { label: 'Income', variant: 'success' };
      case 'transfer': return { label: 'Transfer', variant: 'default' };
      case 'payment': return { label: 'Payment', variant: 'default' };
      default: return null;
    }
  }

  rowName(tx: Transaction): string {
    return tx.merchant || tx.description || tx.category || 'Transaction';
  }

  rowDetail(tx: Transaction): string {
    return [tx.category, tx.account_display].filter(Boolean).join(' · ');
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
    this.fromDate = '';
    this.throughDate = '';
    this.selectedCalendarDate = null;
    this.applyFilters();
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
    this.tripFilter = '';
    this.summaryMonth = '';
    this.fromDate = '';
    this.throughDate = '';
    this.selectedCalendarDate = null;
    this.applyFilters();
  }

  get hasActiveFilters(): boolean {
    return !!(this.searchTerm || this.categoryFilter || this.merchantFilter || this.accountFilter || this.receiptFilter
      || this.tripFilter || this.summaryMonth || this.fromDate || this.throughDate || this.selectedCalendarDate);
  }

  filtersOpen = false;
  @ViewChild('filterToggle') filterToggle?: ElementRef<HTMLButtonElement>;

  get panelFilterCount(): number {
    let count = 0;
    if (!this.embedded && this.activityView !== 'all') count += 1;
    if (this.categoryFilter) count += 1;
    if (this.merchantFilter) count += 1;
    if (this.accountFilter) count += 1;
    if (this.tripFilter) count += 1;
    if (this.selectedCalendarDate) count += 1;
    if (this.fromDate) count += 1;
    if (this.throughDate) count += 1;
    return count;
  }

  get filterChips(): { key: string; label: string }[] {
    const chips: { key: string; label: string }[] = [];
    if (!this.embedded && this.activityView !== 'all') {
      chips.push({ key: 'type', label: `Type: ${this.activityView === 'spending' ? 'Spending' : 'Income'}` });
    }
    if (this.categoryFilter) {
      const label = this.categorySelectOptions.find(option => option.value === this.categoryFilter)?.label ?? this.categoryFilter;
      chips.push({ key: 'category', label: `Category: ${label}` });
    }
    if (this.merchantFilter) {
      const label = this.merchantSelectOptions.find(option => option.value === this.merchantFilter)?.label ?? this.merchantFilter;
      chips.push({ key: 'merchant', label: `Merchant: ${label}` });
    }
    if (this.accountFilter) {
      const label = this.accountSelectOptions.find(option => option.value === this.accountFilter)?.label ?? this.accountFilter;
      chips.push({ key: 'account', label: `Account: ${label}` });
    }
    if (this.tripFilter) {
      const label = this.tripSelectOptions.find(option => option.value === this.tripFilter)?.label ?? 'Saved trip';
      chips.push({ key: 'trip', label: `Trip: ${label}` });
    }
    if (this.fromDate) chips.push({ key: 'from', label: `From: ${formatDate(this.fromDate, 'table')}` });
    if (this.throughDate) chips.push({ key: 'through', label: `Through: ${formatDate(this.throughDate, 'table')}` });
    if (this.selectedCalendarDate) chips.push({ key: 'day', label: `Day: ${formatDate(this.selectedCalendarDate, 'table')}` });
    if (this.receiptFilter) chips.push({ key: 'receipt', label: 'From one import' });
    return chips;
  }

  toggleFilters(): void {
    this.filtersOpen = !this.filtersOpen;
    this.cdr.markForCheck();
    if (this.filtersOpen) {
      if (!this.tripHome) this.transactionEditor.tripHome$.pipe(takeUntil(this.destroy$)).subscribe({
        next: home => {
          this.tripHome = home;
          this.cdr.markForCheck();
        },
        error: () => { /* The encrypted tags still work with their saved ids. */ },
      });
      setTimeout(() => {
        if (this.active && this.filtersOpen) document.getElementById('tx-type-filter')?.focus();
      });
    }
  }

  closeFiltersPanel(): void {
    if (!this.filtersOpen) return;
    this.filtersOpen = false;
    this.cdr.markForCheck();
    this.filterToggle?.nativeElement.focus();
  }

  removeChip(key: string): void {
    const index = this.filterChips.findIndex(chip => chip.key === key);
    switch (key) {
      case 'type':
        this.onActivityViewChange('all');
        break;
      case 'category':
        this.categoryFilter = '';
        this.applyFilters();
        break;
      case 'merchant':
        this.merchantFilter = '';
        this.applyFilters();
        break;
      case 'account':
        this.accountFilter = '';
        this.applyFilters();
        break;
      case 'trip':
        this.tripFilter = '';
        this.applyFilters();
        break;
      case 'from':
        this.fromDate = '';
        this.onDateRangeChange();
        break;
      case 'through':
        this.throughDate = '';
        this.onDateRangeChange();
        break;
      case 'day':
        this.selectedCalendarDate = null;
        this.applyFilters();
        break;
      case 'receipt':
        this.receiptFilter = '';
        this.applyFilters();
        break;
      default:
        return;
    }
    this.cdr.markForCheck();
    setTimeout(() => {
      if (!this.active) return;
      const host = this.filterToggle?.nativeElement.closest('app-transactions');
      const chips = host?.querySelectorAll<HTMLButtonElement>('.filter-chip');
      const target = chips && chips.length ? chips[Math.min(Math.max(index, 0), chips.length - 1)] : undefined;
      (target ?? this.filterToggle?.nativeElement)?.focus();
    });
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
    this.consumedEditLink = String(tx.id);
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

  async deleteTransaction(tx: Transaction): Promise<void> {
    const session = this.financeService.sessionToken;
    if (!this.isCurrent(session) || this.deleting.has(tx.id)) return;
    const ok = await this.confirmService.ask(
      'Delete transaction?',
      `Remove ${tx.category} (${tx.date})? You can undo this after it is removed.`,
      'Delete',
      'Cancel',
    );
    if (ok) this.removeTransaction(tx.id, session);
  }

  isDeleting(id: number): boolean { return this.deleting.has(id); }

  private removeTransaction(id: number, session: number): void {
    if (!this.isCurrent(session) || this.deleting.has(id)) return;
    const tx = this.allTransactions.find(row => row.id === id);
    if (!tx) return;
    // Keep the exact encrypted-ledger record in the recovery action's memory.
    const backup = { ...tx };
    this.deleting.add(id);
    this.cdr.markForCheck();
    this.financeService.deleteTransaction(id, true).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        if (!this.finishDelete(id, session)) return;
        this.showRowRecovery(() => this.toastService.success('Transaction deleted', () => this.restoreTransaction(backup, session)));
      },
      error: () => {
        if (!this.finishDelete(id, session)) return;
        this.showRowRecovery(() => this.toastService.error(failureCopy('delete', 'this transaction'), {
          label: 'Try again',
          run: () => this.removeTransaction(id, session),
        }));
      },
    });
  }

  private finishDelete(id: number, session: number): boolean {
    this.deleting.delete(id);
    if (!this.isCurrent(session)) return false;
    this.cdr.markForCheck();
    return true;
  }

  private readonly restoreInFlight = new Set<number>();

  private restoreTransaction(backup: Transaction, session: number): void {
    if (!this.isCurrent(session) || this.restoreInFlight.has(backup.id)) return;
    this.restoreInFlight.add(backup.id);
    this.financeService.restoreTransaction(backup, true).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.restoreInFlight.delete(backup.id);
      },
      error: (err: unknown) => {
        this.restoreInFlight.delete(backup.id);
        if (!this.isCurrent(session)) return;
        if (err instanceof Error && err.message === 'Transaction changed after it was deleted') {
          this.toastService.error(failureCopy('restore', 'this transaction', 'It changed after it was deleted.'));
          return;
        }
        this.showRowRecovery(() => this.toastService.error(failureCopy('restore', 'this transaction'), {
          label: 'Try again',
          run: () => this.restoreTransaction(backup, session),
        }));
      },
    });
  }

  private showRowRecovery(show: () => void): void {
    show();
    this.toastService.toasts$.pipe(take(1)).subscribe(toasts => {
      for (const id of this.rowToastIds) {
        if (!toasts.some(toast => toast.id === id)) this.rowToastIds.delete(id);
      }
      const latest = toasts.at(-1);
      if (latest?.action) this.rowToastIds.add(latest.id);
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
