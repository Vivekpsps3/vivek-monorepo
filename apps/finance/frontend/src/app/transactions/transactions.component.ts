import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  Input,
  OnDestroy,
  OnInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject, Subscription, takeUntil } from 'rxjs';
import { FinanceService } from '../services/finance.service';
import {
  BankImportOption,
  ImportCommitResult,
  BankImportFile,
  BankImportFilePreview,
  ImportPreviewRow,
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
export class TransactionsComponent implements OnInit, OnDestroy {
  @Input() embedded = false;
  @Input() typeFilter: 'all' | 'income' | 'expense' = 'all';
  transactions: Transaction[] = [];
  filteredTransactions: Transaction[] = [];
  searchTerm = '';
  categoryFilter = '';
  sortColumn: 'date' | 'category' | 'amount' = 'date';
  sortDirection: 'asc' | 'desc' = 'desc';

  /** YYYY-MM — drives monthly totals on this page */
  summaryMonth = this.currentMonthKey();

  showModal = false;
  showImportModal = false;
  importBanks: BankImportOption[] = [];

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

  monthExpenseTotal = 0;
  monthIncomeTotal = 0;
  categoryMergeFrom = '';
  categoryMergeTo = '';
  categoryMergeSaving = false;
  categoryBulkRows: { fromCategory: string; toCategory: string }[] = [this.emptyBulkRenameRow()];

  readonly pageSize = 5000;
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
      this.applyFilterAndSort();
      this.cdr.markForCheck();
    });

    this.reloadTransactionList();
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
    this.listLoading = true;
    this.hasMore = true;
    this.cdr.markForCheck();
    const search = this.searchTerm.trim() || undefined;
    this.financeService
      .getTransactions({ search, skip: 0, limit: this.pageSize, append: false })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: rows => {
          this.listLoading = false;
          this.hasMore = rows.length >= this.pageSize;
          this.cdr.markForCheck();
        },
        error: () => {
          this.listLoading = false;
          this.cdr.markForCheck();
        },
      });
  }

  loadMoreTransactions(): void {
    if (this.loadingMore || !this.hasMore) return;
    this.loadingMore = true;
    const search = this.searchTerm.trim() || undefined;
    const skip = this.transactions.length;
    this.financeService
      .getTransactions({ search, skip, limit: this.pageSize, append: true })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: rows => {
          this.loadingMore = false;
          this.hasMore = rows.length >= this.pageSize;
          this.cdr.markForCheck();
        },
        error: () => {
          this.loadingMore = false;
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
    return this.importFiles.length > 0 && this.importFiles.every(entry => !!this.importBank(entry.bank_slug));
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
      ? this.transactions.filter(t => t.date.startsWith(`${this.summaryMonth}-`))
      : this.transactions;
    return Array.from(
      new Set(source.map(t => t.category).filter(category => !!category?.trim()))
    ).sort((a, b) => a.localeCompare(b));
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
      ? this.transactions.filter(t => t.date.startsWith(`${this.summaryMonth}-`))
      : this.transactions;
    this.monthExpenseTotal = inMonth
      .filter(t => t.type === 'expense')
      .reduce((s, t) => s + t.amount, 0);
    this.monthIncomeTotal = inMonth
      .filter(t => t.type === 'income')
      .reduce((s, t) => s + t.amount, 0);
  }

  openImportModal() {
    if (this.importCommitting) return;
    this.closeImportModal();
    this.showImportModal = true;
    this.cdr.markForCheck();
    this.financeService.getImportBanks().pipe(takeUntil(this.destroy$)).subscribe({
      next: banks => {
        this.importBanks = banks;
        this.cdr.markForCheck();
      },
    });
  }

  onImportBankChange() {
    this.importPreviews = [];
    this.importStep = 'upload';
    this.importSelected.clear();
    this.importError = '';
    this.cdr.markForCheck();
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
      this.importFiles.push({ id: this.nextImportFileId++, bank_slug: '', file });
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
      .previewBankImports(this.importFiles.map(entry => ({ ...entry })))
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
    if (this.importCommitting || row.status !== 'new') return;
    if (this.importSelected.has(row.dedupe_key)) {
      this.importSelected.delete(row.dedupe_key);
    } else {
      this.importSelected.add(row.dedupe_key);
    }
    this.cdr.markForCheck();
  }

  isImportRowSelected(row: ImportPreviewRow): boolean {
    return row.status === 'new' && this.importSelected.has(row.dedupe_key);
  }

  selectAllNewImportRows() {
    if (this.importCommitting) return;
    for (const row of this.importRows) {
      if (row.status === 'new') {
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
    return this.importSelected.size;
  }

  get selectedImportExpenseTotal(): number {
    return this.importRows
      .filter(row => row.status === 'new' && this.importSelected.has(row.dedupe_key))
      .reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
  }

  get supportedImporterNames(): string {
    return this.importBanks.map(bank => bank.name).join(', ') || 'the listed banks';
  }

  commitImport() {
    if (this.importCommitting || this.importParsing) return;
    const rows = this.importRows.filter(row => row.status === 'new' && this.importSelected.has(row.dedupe_key));
    if (!rows.length) {
      this.toastService.error('Select at least one new transaction to import.');
      return;
    }
    this.importCommitting = true;
    this.importError = '';
    this.financeService
      .commitBankImports(rows)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res: ImportCommitResult) => {
          this.importCommitting = false;
          this.closeImportModal();
          this.toastService.success(`Imported ${res.inserted} transaction(s)${res.skipped ? `; skipped ${res.skipped} duplicate(s)` : ''}`);
          this.cdr.markForCheck();
        },
        error: (err: any) => {
          this.importCommitting = false;
          this.importError = this.importFailureMessage(err, 'Import failed.') + ' Some rows may already be saved. Retry safely skips those duplicates.';
          this.cdr.markForCheck();
        },
      });
  }

  private importFailureMessage(err: any, fallback: string): string {
    const detail = err?.error?.detail ?? err?.message;
    return typeof detail === 'string' && detail.trim() ? detail : fallback;
  }

  openAddModal() {
    this.editingTxId = null;
    this.newTx = this.emptyTx();
    this.showModal = true;
  }

  applyFilterAndSort() {
    let result = [...this.transactions];
    if (this.typeFilter !== 'all') {
      result = result.filter(row => row.type === this.typeFilter);
    }
    if (this.summaryMonth) {
      result = result.filter(row => row.date.startsWith(`${this.summaryMonth}-`));
    }
    if (this.categoryFilter.trim()) {
      result = result.filter(row => row.category === this.categoryFilter.trim());
    }

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

    this.filteredTransactions = result;
    this.computeMonthTotals();
    this.cdr.markForCheck();
  }

  onSearchChange() {
    this.syncQueryParams();
    this.reloadTransactionList();
  }

  onSummaryMonthChange() {
    if (this.categoryFilter && !this.categoryOptions.includes(this.categoryFilter)) {
      this.categoryFilter = '';
    }
    this.syncQueryParams();
    this.applyFilterAndSort();
  }

  onCategoryFilterChange() {
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
        this.closeModal();
        this.toastService.success(
          this.editingTxId ? 'Transaction updated' : 'Transaction added'
        );
      },
      error: () => {
        this.saving = false;
      },
    });
  }

  editTransaction(tx: Transaction) {
    this.editingTxId = tx.id;
    this.newTx = {
      date: tx.date,
      type: tx.type,
      category: tx.category,
      amount: tx.amount,
      description: tx.description || '',
    };
    this.showModal = true;
  }

  closeModal() {
    this.showModal = false;
    this.editingTxId = null;
    this.newTx = this.emptyTx();
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
