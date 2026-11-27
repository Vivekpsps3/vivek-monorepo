import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnDestroy,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { Subject, forkJoin, takeUntil } from 'rxjs';
import {
  AppDatePipe,
  MoneyPipe,
  ToastService,
  UiButtonComponent,
  UiPageHeaderComponent,
} from '@vivek/ui';
import { VaultService } from '../crypto/vault.service';
import type { Asset, Liability, NetWorth } from '../models/transaction.model';
import { FinanceService } from '../services/finance.service';
import { FormatCategoryPipe } from '../shared/pipes/format-category.pipe';
import { portfolioDateSummary } from '../utils/portfolio.util';
import { AccountBalanceEditor } from './account-balance-editor';
import { AccountBalanceEditorComponent } from './account-balance-editor.component';
import {
  accountHallKey,
  projectAccountHall,
  type AccountHallRecord,
} from './account-hall';

@Component({
  selector: 'app-accounts-hall',
  standalone: true,
  imports: [
    UiPageHeaderComponent,
    UiButtonComponent,
    MoneyPipe,
    AppDatePipe,
    FormatCategoryPipe,
    AccountBalanceEditorComponent,
  ],
  templateUrl: './accounts-hall.component.html',
  styleUrl: './accounts-hall.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccountsHallComponent implements OnInit, OnDestroy {
  private readonly finance = inject(FinanceService);
  private readonly vault = inject(VaultService);
  private readonly toast = inject(ToastService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly destroy$ = new Subject<void>();
  private destroyed = false;
  private sealed = false;
  private loadGeneration = 0;
  private readonly assets = signal<Asset[]>([]);
  private readonly debts = signal<Liability[]>([]);
  private readonly worth = signal<NetWorth | null>(null);
  private readonly records = computed<AccountHallRecord[]>(() => [
    ...this.assets().map(row => ({
      kind: 'asset' as const,
      id: row.id,
      name: row.name,
      category: row.category,
      asOf: row.as_of_date,
      value: row.current_value,
    })),
    ...this.debts().map(row => ({
      kind: 'debt' as const,
      id: row.id,
      name: row.name,
      category: row.category,
      asOf: row.as_of_date,
      value: row.balance_owed,
    })),
  ]);

  readonly revealed = signal<string | null>(null);
  readonly loading = signal(true);
  readonly loadFailed = signal(false);
  readonly projection = computed(() => projectAccountHall(this.records(), this.worth(), this.revealed()));
  readonly revealedDrawer = computed(() => this.projection().drawers.find(drawer => drawer.revealed) ?? null);
  readonly revealedNotes = computed(() => {
    const drawer = this.revealedDrawer();
    return drawer ? this.notesFor(drawer.key) : '';
  });
  readonly balanceDates = computed(() => portfolioDateSummary(this.records().map(record => record.asOf)));
  readonly balanceEditor: AccountBalanceEditor;

  constructor() {
    this.balanceEditor = new AccountBalanceEditor(
      this.finance,
      this.vault,
      this.toast,
      this.cdr,
      () => this.destroyed,
      this.destroy$,
      () => document.getElementById('accounts-hall-heading'),
    );
  }

  ngOnInit(): void {
    this.finance.assets$.pipe(takeUntil(this.destroy$)).subscribe(rows => {
      if (this.sealed || !this.vault.isUnlocked) return;
      this.assets.set(rows);
    });
    this.finance.liabilities$.pipe(takeUntil(this.destroy$)).subscribe(rows => {
      if (this.sealed || !this.vault.isUnlocked) return;
      this.debts.set(rows);
    });
    this.finance.netWorth$.pipe(takeUntil(this.destroy$)).subscribe(value => {
      if (this.sealed || !this.vault.isUnlocked) return;
      this.worth.set(value);
    });
    this.vault.unlocked$.pipe(takeUntil(this.destroy$)).subscribe(open => {
      if (!open) this.seal();
    });
    this.loadBalances();
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.seal();
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadBalances(): void {
    const session = this.finance.sessionToken;
    const generation = ++this.loadGeneration;
    this.loading.set(true);
    this.loadFailed.set(false);
    forkJoin([this.finance.getAssets(), this.finance.getLiabilities(), this.finance.getNetWorth()])
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => this.finishLoad(session, generation, false),
        error: () => this.finishLoad(session, generation, true),
      });
  }

  /** Reveal one published account. Selection does not open the editor or write. */
  inspect(key: string): void {
    if (!this.recordSource(key)) return;
    this.revealed.set(key);
  }

  /** Open the shared account editor for the revealed record. */
  edit(key: string): void {
    const found = this.recordSource(key);
    if (!found) return;
    const { record, source } = found;
    this.revealed.set(key);
    const same = this.balanceEditor.draft?.id === record.id && this.balanceEditor.draft.kind === record.kind;
    if (same) return;
    this.balanceEditor.open(record.kind, {
      id: record.id,
      name: record.name,
      category: record.category,
      value: record.value,
      as_of_date: record.asOf,
      notes: source.notes,
      review_interval_days: source.review_interval_days,
    });
  }

  lockBalances(): void {
    const key = this.revealed();
    this.revealed.set(null);
    this.balanceEditor.close();
    this.cdr.markForCheck();
    this.focusOrigin(key);
  }

  private notesFor(key: string): string {
    return String(this.recordSource(key)?.source.notes || '').trim();
  }

  private recordSource(key: string): { record: AccountHallRecord; source: Asset | Liability } | null {
    if (this.sealed || !this.vault.isUnlocked) return null;
    const record = this.records().find(row => accountHallKey(row.kind, row.id) === key);
    if (!record) return null;
    const source = record.kind === 'debt'
      ? this.debts().find(row => row.id === record.id)
      : this.assets().find(row => row.id === record.id);
    return source ? { record, source } : null;
  }

  /** Dialog close restores the Edit control. Lock removes that control, so return to the drawer. */
  private focusOrigin(key: string | null): void {
    setTimeout(() => {
      if (this.destroyed) return;
      const drawer = key ? document.querySelector<HTMLElement>(`[data-drawer="${key}"]`) : null;
      if (drawer?.isConnected) drawer.focus({ preventScroll: true });
      else if (document.activeElement === document.body || document.activeElement === null) {
        document.getElementById('accounts-hall-heading')?.focus({ preventScroll: true });
      }
    });
  }

  private finishLoad(session: number, generation: number, failed: boolean): void {
    if (!this.isCurrent(session, generation)) return;
    this.loading.set(false);
    this.loadFailed.set(failed);
    this.cdr.markForCheck();
  }

  private seal(): void {
    this.sealed = true;
    this.loadGeneration += 1;
    this.revealed.set(null);
    this.assets.set([]);
    this.debts.set([]);
    this.worth.set(null);
    this.loading.set(false);
    this.loadFailed.set(false);
    this.balanceEditor.close();
    this.cdr.markForCheck();
  }

  private isCurrent(session: number, generation: number): boolean {
    return !this.destroyed
      && !this.sealed
      && this.vault.isUnlocked
      && session === this.finance.sessionToken
      && generation === this.loadGeneration;
  }
}
