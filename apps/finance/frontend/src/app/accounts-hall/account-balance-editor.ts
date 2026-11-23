import { takeUntil, type Observable } from 'rxjs';
import { parseMoneyInput, todayIsoDate, toDollars } from '@vivek/browser';
import { successCopy, type ToastService, type UiSelectOption } from '@vivek/ui';
import type { FinanceService } from '../services/finance.service';
import type { VaultService } from '../crypto/vault.service';
import { dialogSaveAlert, fieldMessage, focusDialogAlert, focusFirstInvalid } from '../shared/form-validation';
import { validateAsset, validateDebt, type FieldIssue } from '../utils/validators';

export type AccountBalanceKind = 'asset' | 'debt';

export interface AccountBalanceRecord {
  id: number;
  name: string;
  category: string;
  value: number;
  as_of_date: string;
  notes?: string | null;
  review_interval_days?: number | null;
}

export interface AccountBalanceDraft {
  kind: AccountBalanceKind;
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

export const accountBalanceKinds = {
  asset: {
    title: 'Assets',
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
} satisfies Record<AccountBalanceKind, {
  title: string;
  amountLabel: string;
  defaultCategory: string;
  categories: UiSelectOption[];
}>;

/**
 * The one account editor. The accounts list and the accounts hall both open it.
 * A late response after lock, session change, or a newer draft does not write back.
 */
export class AccountBalanceEditor {
  draft: AccountBalanceDraft | null = null;
  readonly kinds = accountBalanceKinds;
  private readonly refresh = new Set<() => void>();

  constructor(
    private finance: FinanceService,
    private vault: VaultService,
    private toast: ToastService,
    private cdr: { markForCheck(): void },
    private destroyed: () => boolean,
    private destroy$: Observable<void>,
    private fallbackFocus: () => HTMLElement | null,
  ) {
    this.vault.unlocked$.pipe(takeUntil(this.destroy$)).subscribe(open => {
      if (!open) this.close();
    });
  }

  attach(refresh: () => void): () => void {
    this.refresh.add(refresh);
    return () => this.refresh.delete(refresh);
  }

  open(kind: AccountBalanceKind, row?: AccountBalanceRecord): void {
    const session = this.finance.sessionToken;
    if (!this.isCurrent(session)) return;
    this.draft = {
      kind,
      id: row?.id ?? null,
      session,
      returnFocus: document.activeElement instanceof HTMLElement ? document.activeElement : null,
      name: row?.name ?? '',
      category: row?.category ?? accountBalanceKinds[kind].defaultCategory,
      value: row?.value ?? 0,
      date: row ? row.as_of_date ?? '' : todayIsoDate(),
      notes: row?.notes ?? '',
      reviewIntervalDays: row?.review_interval_days ?? null,
      errors: [],
      submitted: false,
      saving: false,
      saveError: '',
    };
    this.mark();
  }

  close(): void {
    if (this.draft == null) return;
    this.draft = null;
    this.mark();
  }

  save(): void {
    const editor = this.draft;
    if (!editor || editor.saving || !this.isCurrent(editor.session)) return;
    editor.submitted = true;
    this.revalidate();
    if (editor.errors.length) {
      this.focus(editor, focusFirstInvalid);
      return;
    }
    const parsed = parseMoneyInput(String(editor.value));
    if (!('cents' in parsed)) return;
    editor.saving = true;
    editor.saveError = '';
    this.mark();
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
        if (!this.isDraft(editor)) return;
        this.close();
        this.toast.success(successCopy(editor.kind === 'asset' ? 'Asset' : 'Debt', id === null ? 'added' : 'saved'));
        this.restoreIfRemoved(editor.returnFocus, editor.session);
      },
      error: () => {
        if (!this.isDraft(editor)) return;
        editor.saving = false;
        editor.saveError = dialogSaveAlert();
        this.mark();
        this.focus(editor, focusDialogAlert);
      },
    });
  }

  revalidate(): void {
    const editor = this.draft;
    if (!editor?.submitted) return;
    editor.errors = editor.kind === 'asset'
      ? validateAsset({ name: editor.name, value: editor.value })
      : validateDebt({ name: editor.name, amount: editor.value });
    this.mark();
  }

  fieldError(field: string): string | null {
    return fieldMessage(this.draft?.errors ?? [], field);
  }

  private focus(editor: AccountBalanceDraft, move: (root: HTMLElement | null) => void): void {
    setTimeout(() => {
      if (this.isDraft(editor)) move(document.getElementById('account-balance-form'));
    });
  }

  private restoreIfRemoved(target: HTMLElement | null, session: number): void {
    requestAnimationFrame(() => {
      if (target && !target.isConnected && this.isCurrent(session) && document.activeElement === document.body) {
        this.fallbackFocus()?.focus();
      }
    });
  }

  private isDraft(editor: AccountBalanceDraft): boolean {
    return this.draft === editor && this.isCurrent(editor.session);
  }

  private isCurrent(session: number): boolean {
    return !this.destroyed() && this.vault.isUnlocked && session === this.finance.sessionToken;
  }

  private mark(): void {
    this.cdr.markForCheck();
    for (const refresh of this.refresh) refresh();
  }
}
