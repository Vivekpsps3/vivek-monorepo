import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  ViewChild,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subject, forkJoin, take, takeUntil, type Observable } from 'rxjs';
import { parseMoneyInput, todayIsoDate, toDollars } from '@vivek/browser';
import {
  AppDatePipe,
  ConfirmService,
  MoneyPipe,
  ToastService,
  UiBadgeComponent,
  UiButtonComponent,
  UiCardComponent,
  UiDataTableComponent,
  UiDialogComponent,
  UiEmptyStateComponent,
  UiFieldComponent,
  UiFieldControlDirective,
  UiPageHeaderComponent,
  UiSelectComponent,
  failureCopy,
  successCopy,
  type ConfirmState,
  type UiSelectOption,
} from '@vivek/ui';
import { VaultService } from '../crypto/vault.service';
import { NetWorth } from '../models/transaction.model';
import { FinanceService } from '../services/finance.service';
import { dialogSaveAlert, fieldMessage, focusDialogAlert, focusFirstInvalid } from '../shared/form-validation';
import { FormatCategoryPipe } from '../shared/pipes/format-category.pipe';
import { portfolioDateSummary } from '../utils/portfolio.util';
import { amountProblem, excludedAmountNote, validateAsset, validateDebt, type FieldIssue } from '../utils/validators';

type BalanceKind = 'asset' | 'debt';

interface BalanceRow {
  id: number;
  name: string;
  category: string;
  value: number;
  as_of_date: string;
  notes?: string | null;
  review_interval_days?: number | null;
}

interface BalanceEditor {
  kind: BalanceKind;
  id: number | null;
  session: number;
  returnFocus: HTMLElement | null;
  name: string;
  category: string;
  value: number | string;
  date: string;
  notes: string;
  reviewIntervalDays: number | null;
  errors: FieldIssue[];
  submitted: boolean;
  saving: boolean;
  saveError: string;
}

const balanceKinds = {
  asset: {
    title: 'Assets',
    emptyTitle: 'No assets yet',
    emptyMessage: 'Add checking, savings, property, or anything else you own.',
    amountLabel: 'Value',
    defaultCategory: 'checking',
    categories: [
      { value: 'cash', label: 'Cash' },
      { value: 'checking', label: 'Checking' },
      { value: 'savings', label: 'Savings' },
      { value: 'real_estate', label: 'Real estate' },
      { value: 'vehicle', label: 'Vehicle' },
      { value: 'other', label: 'Other' },
    ],
  },
  debt: {
    title: 'Debts',
    emptyTitle: 'No debts recorded',
    emptyMessage: 'Add a mortgage, loan, or card balance you owe.',
    amountLabel: 'Owed',
    defaultCategory: 'credit_card',
    categories: [
      { value: 'mortgage', label: 'Mortgage' },
      { value: 'auto_loan', label: 'Auto loan' },
      { value: 'student_loan', label: 'Student loan' },
      { value: 'credit_card', label: 'Credit card' },
      { value: 'personal_loan', label: 'Personal loan' },
      { value: 'other', label: 'Other' },
    ],
  },
} satisfies Record<BalanceKind, {
  title: string; emptyTitle: string; emptyMessage: string;
  amountLabel: string; defaultCategory: string; categories: UiSelectOption[];
}>;

@Component({
  selector: 'app-assets-liabilities',
  standalone: true,
  imports: [
    FormsModule,
    UiPageHeaderComponent,
    UiButtonComponent,
    UiCardComponent,
    UiEmptyStateComponent,
    UiSelectComponent,
    UiDataTableComponent,
    UiDialogComponent,
    UiBadgeComponent,
    UiFieldComponent,
    UiFieldControlDirective,
    FormatCategoryPipe,
    MoneyPipe,
    AppDatePipe,
  ],
  templateUrl: './assets-liabilities.component.html',
  styleUrl: './assets-liabilities.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AssetsLiabilitiesComponent implements OnInit, OnDestroy {
  @ViewChild('accountSearch') private accountSearch?: ElementRef<HTMLInputElement>;
  private readonly vault = inject(VaultService);
  private readonly assets = signal<BalanceRow[]>([]);
  private readonly debts = signal<BalanceRow[]>([]);
  private readonly destroy$ = new Subject<void>();
  private destroyed = false;
  private confirmation: ConfirmState | null = null;

  readonly query = signal('');
  readonly groups = computed(() => {
    const search = this.query().trim().toLowerCase();
    return (['asset', 'debt'] as const).map(kind => {
      const records = kind === 'asset' ? this.assets() : this.debts();
      const rows = search ? records.filter(row =>
        row.name.toLowerCase().includes(search) || row.category.replace(/_/g, ' ').toLowerCase().includes(search)
      ) : records;
      return { kind, ...balanceKinds[kind], rows, count: records.length };
    });
  });

  readonly hasBalances = computed(() => !!(this.assets().length || this.debts().length));
  readonly balancesDates = computed(() => portfolioDateSummary(
    [...this.assets(), ...this.debts()].map(row => row.as_of_date)
  ));
  readonly amountProblem = amountProblem;
  readonly balanceKinds = balanceKinds;
  readonly excludedAmountNote = excludedAmountNote;
  netWorth: NetWorth | null = null;
  editor: BalanceEditor | null = null;
  loading = true;
  loadFailed = false;

  constructor(
    private finance: FinanceService,
    private toast: ToastService,
    private confirm: ConfirmService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.finance.assets$.pipe(takeUntil(this.destroy$)).subscribe(rows => {
      this.assets.set(rows.map(({ current_value, ...row }) => ({ ...row, value: current_value })));
    });
    this.finance.liabilities$.pipe(takeUntil(this.destroy$)).subscribe(rows => {
      this.debts.set(rows.map(({ balance_owed, ...row }) => ({ ...row, value: balance_owed })));
    });
    this.finance.netWorth$.pipe(takeUntil(this.destroy$)).subscribe(value => {
      this.netWorth = value;
      this.cdr.markForCheck();
    });
    this.vault.unlocked$.pipe(takeUntil(this.destroy$)).subscribe(unlocked => {
      if (!unlocked) {
        this.clearDrafts();
        this.assets.set([]);
        this.debts.set([]);
        this.netWorth = null;
        this.cdr.markForCheck();
      }
    });
    this.loadBalances();
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.clearDrafts();
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadBalances(): void {
    this.loading = true;
    this.loadFailed = false;
    const session = this.finance.sessionToken;
    forkJoin([this.finance.getAssets(), this.finance.getLiabilities(), this.finance.getNetWorth()])
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => this.finishLoad(session, false),
        error: () => this.finishLoad(session, true),
      });
  }

  private finishLoad(session: number, failed: boolean): void {
    if (!this.isCurrent(session)) return;
    this.loading = false;
    this.loadFailed = failed;
    this.cdr.markForCheck();
  }

  openEditor(kind: BalanceKind, row?: BalanceRow): void {
    const session = this.finance.sessionToken;
    if (!this.isCurrent(session)) return;
    this.editor = {
      kind,
      id: row?.id ?? null,
      session,
      returnFocus: document.activeElement instanceof HTMLElement ? document.activeElement : null,
      name: row?.name ?? '',
      category: row?.category ?? balanceKinds[kind].defaultCategory,
      value: row?.value ?? 0,
      date: row ? row.as_of_date ?? '' : todayIsoDate(),
      notes: row?.notes ?? '',
      reviewIntervalDays: row?.review_interval_days ?? null,
      errors: [],
      submitted: false,
      saving: false,
      saveError: '',
    };
  }

  closeEditor(): void {
    this.editor = null;
  }

  saveEditor(): void {
    const editor = this.editor;
    if (!editor || editor.saving || !this.isCurrent(editor.session)) return;
    editor.submitted = true;
    this.revalidate();
    if (editor.errors.length) {
      this.focusEditor(editor, focusFirstInvalid);
      return;
    }
    const parsed = parseMoneyInput(String(editor.value));
    if (!('cents' in parsed)) return;
    editor.saving = true;
    editor.saveError = '';
    const value = toDollars(parsed.cents);
    const body = {
      name: editor.name.trim(),
      category: editor.category,
      as_of_date: editor.date,
      review_interval_days: editor.reviewIntervalDays,
      notes: editor.notes,
    };
    const id = editor.id;
    const write: Observable<unknown> = editor.kind === 'asset'
      ? id === null
        ? this.finance.addAsset({ ...body, current_value: value }, true)
        : this.finance.updateAsset(id, { ...body, current_value: value }, true)
      : id === null
        ? this.finance.addLiability({ ...body, balance_owed: value }, true)
        : this.finance.updateLiability(id, { ...body, balance_owed: value }, true);
    write.pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        if (!this.editorIsCurrent(editor)) return;
        this.closeEditor();
        this.toast.success(successCopy(editor.kind === 'asset' ? 'Asset' : 'Debt', id === null ? 'added' : 'saved'));
        this.cdr.markForCheck();
        this.restoreIfRemoved(editor.returnFocus, editor.session);
      },
      error: () => {
        if (!this.editorIsCurrent(editor)) return;
        editor.saving = false;
        editor.saveError = dialogSaveAlert();
        this.cdr.markForCheck();
        this.focusEditor(editor, focusDialogAlert);
      },
    });
  }

  revalidate(): void {
    const editor = this.editor;
    if (!editor?.submitted) return;
    editor.errors = editor.kind === 'asset'
      ? validateAsset({ name: editor.name, value: editor.value })
      : validateDebt({ name: editor.name, amount: editor.value });
  }

  fieldError(field: string): string | null {
    return fieldMessage(this.editor?.errors ?? [], field);
  }

  async deleteBalance(kind: BalanceKind, row: BalanceRow): Promise<void> {
    const session = this.finance.sessionToken;
    if (!this.isCurrent(session)) return;
    const target = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const result = this.confirm.ask(
      `Delete ${row.name}?`,
      "This removes it from your net worth. Past activity isn't affected.",
    );
    const confirmation = this.getConfirmation();
    this.confirmation = confirmation;
    const accepted = await result;
    if (this.confirmation === confirmation) this.confirmation = null;
    if (accepted) this.removeBalance(kind, row.id, row.name, session, target);
  }

  private removeBalance(kind: BalanceKind, id: number, name: string, session: number, target: HTMLElement | null): void {
    if (!this.isCurrent(session)) return;
    const write = kind === 'asset' ? this.finance.deleteAsset(id, true) : this.finance.deleteLiability(id, true);
    write.pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        if (!this.isCurrent(session)) return;
        this.toast.success(`${name} deleted`);
        this.restoreIfRemoved(target, session);
      },
      error: () => {
        if (!this.isCurrent(session)) return;
        this.toast.error(failureCopy('delete', `this ${kind}`), {
          label: 'Try again',
          run: () => this.removeBalance(kind, id, name, session, target),
        });
      },
    });
  }

  private restoreIfRemoved(target: HTMLElement | null, session: number): void {
    requestAnimationFrame(() => {
      if (target && !target.isConnected && this.isCurrent(session) && document.activeElement === document.body) {
        (this.accountSearch?.nativeElement ?? document.getElementById('accounts-heading'))?.focus();
      }
    });
  }

  private focusEditor(editor: BalanceEditor, focus: (root: HTMLElement | null) => void): void {
    setTimeout(() => {
      if (this.editorIsCurrent(editor)) focus(document.getElementById('account-balance-form'));
    });
  }

  private editorIsCurrent(editor: BalanceEditor): boolean {
    return this.editor === editor && this.isCurrent(editor.session);
  }

  private isCurrent(session: number): boolean {
    return !this.destroyed && this.vault.isUnlocked && session === this.finance.sessionToken;
  }

  private getConfirmation(): ConfirmState | null {
    let confirmation: ConfirmState | null = null;
    this.confirm.state$.pipe(take(1)).subscribe(state => { confirmation = state; });
    return confirmation;
  }

  private clearDrafts(): void {
    this.closeEditor();
    this.query.set('');
    if (this.confirmation && this.getConfirmation() === this.confirmation) this.confirm.close(false);
    this.confirmation = null;
  }
}
