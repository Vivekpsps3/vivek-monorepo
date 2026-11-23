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
import { Subject, forkJoin, take, takeUntil } from 'rxjs';
import {
  AppDatePipe,
  ConfirmService,
  MoneyPipe,
  ToastService,
  UiBadgeComponent,
  UiButtonComponent,
  UiCardComponent,
  UiDataTableComponent,
  UiEmptyStateComponent,
  UiPageHeaderComponent,
  failureCopy,
  type ConfirmState,
} from '@vivek/ui';
import { AccountBalanceEditor, type AccountBalanceKind } from '../accounts-hall/account-balance-editor';
import { AccountBalanceEditorComponent } from '../accounts-hall/account-balance-editor.component';
import { VaultService } from '../crypto/vault.service';
import { NetWorth } from '../models/transaction.model';
import { FinanceService } from '../services/finance.service';
import { FormatCategoryPipe } from '../shared/pipes/format-category.pipe';
import { portfolioDateSummary } from '../utils/portfolio.util';
import { amountProblem, excludedAmountNote } from '../utils/validators';

type BalanceKind = AccountBalanceKind;

interface BalanceRow {
  id: number;
  name: string;
  category: string;
  value: number;
  as_of_date: string;
  notes?: string | null;
  review_interval_days?: number | null;
}

const balanceGroups = {
  asset: {
    title: 'Assets',
    emptyTitle: 'No assets yet',
    emptyMessage: 'Add checking, savings, property, or anything else you own.',
    amountLabel: 'Value',
  },
  debt: {
    title: 'Debts',
    emptyTitle: 'No debts recorded',
    emptyMessage: 'Add a mortgage, loan, or card balance you owe.',
    amountLabel: 'Owed',
  },
} satisfies Record<BalanceKind, { title: string; emptyTitle: string; emptyMessage: string; amountLabel: string }>;

@Component({
  selector: 'app-assets-liabilities',
  standalone: true,
  imports: [
    FormsModule,
    UiPageHeaderComponent,
    UiButtonComponent,
    UiCardComponent,
    UiEmptyStateComponent,
    UiDataTableComponent,
    UiBadgeComponent,
    FormatCategoryPipe,
    AccountBalanceEditorComponent,
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
      return { kind, ...balanceGroups[kind], rows, count: records.length };
    });
  });

  readonly hasBalances = computed(() => !!(this.assets().length || this.debts().length));
  readonly balancesDates = computed(() => portfolioDateSummary(
    [...this.assets(), ...this.debts()].map(row => row.as_of_date)
  ));
  readonly amountProblem = amountProblem;
  readonly excludedAmountNote = excludedAmountNote;
  readonly balanceEditor: AccountBalanceEditor;
  netWorth: NetWorth | null = null;
  loading = true;
  loadFailed = false;

  constructor(
    private finance: FinanceService,
    private toast: ToastService,
    private confirm: ConfirmService,
    private cdr: ChangeDetectorRef,
  ) {
    this.balanceEditor = new AccountBalanceEditor(
      finance,
      this.vault,
      toast,
      cdr,
      () => this.destroyed,
      this.destroy$,
      () => this.accountSearch?.nativeElement ?? document.getElementById('accounts-heading'),
    );
  }

  get editor() {
    return this.balanceEditor.draft;
  }

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
    this.balanceEditor.open(kind, row);
  }

  closeEditor(): void {
    this.balanceEditor.close();
  }

  saveEditor(): void {
    this.balanceEditor.save();
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

  private isCurrent(session: number): boolean {
    return !this.destroyed && this.vault.isUnlocked && session === this.finance.sessionToken;
  }

  private getConfirmation(): ConfirmState | null {
    let confirmation: ConfirmState | null = null;
    this.confirm.state$.pipe(take(1)).subscribe(state => { confirmation = state; });
    return confirmation;
  }

  private clearDrafts(): void {
    this.balanceEditor.close();
    this.query.set('');
    if (this.confirmation && this.getConfirmation() === this.confirmation) this.confirm.close(false);
    this.confirmation = null;
  }
}
