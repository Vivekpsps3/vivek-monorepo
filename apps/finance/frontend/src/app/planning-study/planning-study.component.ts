import {
  AfterViewInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnDestroy,
  OnInit,
  ViewChild,
  computed,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, ParamMap, Router } from '@angular/router';
import { Subject, forkJoin, takeUntil } from 'rxjs';
import {
  AppDatePipe,
  MoneyPipe,
  UiButtonComponent,
  UiPageHeaderComponent,
} from '@vivek/ui';
import { todayIsoDate } from '@vivek/browser';
import { VaultService } from '../crypto/vault.service';
import { FixedExpensesComponent } from '../fixed-expenses/fixed-expenses.component';
import { IncomeComponent } from '../income/income.component';
import type { FixedExpense, JobIncome, NetWorth, Subscription as BillSubscription, Transaction } from '../models/transaction.model';
import { MC_TOOL_ID } from '../models/planning.model';
import { readSimulationDraft } from '../planning/planning-session';
import { FinanceService } from '../services/finance.service';
import { PlanningService } from '../services/planning.service';
import { SubscriptionsComponent } from '../subscriptions/subscriptions.component';
import {
  STUDY_ACTUAL_LABEL,
  STUDY_PROJECTED_LABEL,
  STUDY_PROJECTED_NOTE,
  STUDY_SIMULATION_DEFAULTS,
  projectPlanningStudy,
  readStudyQuery,
  studyMonth,
  writeStudyQuery,
} from './planning-study';

@Component({
  selector: 'app-planning-study',
  standalone: true,
  imports: [
    UiPageHeaderComponent,
    UiButtonComponent,
    MoneyPipe,
    AppDatePipe,
    FixedExpensesComponent,
    SubscriptionsComponent,
    IncomeComponent,
  ],
  templateUrl: './planning-study.component.html',
  styleUrl: './planning-study.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlanningStudyComponent implements OnInit, AfterViewInit, OnDestroy {
  private readonly finance = inject(FinanceService);
  private readonly vault = inject(VaultService);
  private readonly planning = inject(PlanningService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly destroy$ = new Subject<void>();
  private destroyed = false;
  private sealed = false;
  private viewReady = false;
  private loadGeneration = 0;
  private runGeneration = 0;
  private boundSession = 0;
  private editorKey: string | null = null;

  @ViewChild('billEditor') private billEditor?: FixedExpensesComponent;
  @ViewChild('subscriptionEditor') private subscriptionEditor?: SubscriptionsComponent;
  @ViewChild('jobEditor') private jobEditor?: IncomeComponent;

  readonly actualLabel = STUDY_ACTUAL_LABEL;
  readonly projectedLabel = STUDY_PROJECTED_LABEL;
  readonly projectedNote = STUDY_PROJECTED_NOTE;
  readonly defaultMonth = todayIsoDate().slice(0, 7);
  readonly exposed = signal(true);
  readonly loading = signal(true);
  readonly loadFailed = signal(false);
  readonly month = signal(this.defaultMonth);
  readonly openedBillKey = signal<string | null>(null);
  readonly openedPayId = signal<number | null>(null);
  readonly openedModelId = signal<string | null>(null);
  readonly projectedMedian = signal<number | null>(null);
  readonly projectionState = signal<'idle' | 'running' | 'ready' | 'failed'>('idle');
  private readonly bills = signal<FixedExpense[]>([]);
  private readonly subscriptions = signal<BillSubscription[]>([]);
  private readonly jobs = signal<JobIncome[]>([]);
  private readonly transactions = signal<Transaction[]>([]);
  private readonly netWorth = signal<number | null>(null);

  readonly projection = computed(() => projectPlanningStudy({
    month: this.month(),
    bills: this.exposed() ? this.bills() : [],
    subscriptions: this.exposed() ? this.subscriptions() : [],
    transactions: this.exposed() ? this.transactions() : [],
    jobs: this.exposed() ? this.jobs() : [],
    netWorth: this.exposed() ? this.netWorth() : null,
    openedBillKey: this.exposed() ? this.openedBillKey() : null,
    openedPayId: this.exposed() ? this.openedPayId() : null,
    openedModelId: this.exposed() ? this.openedModelId() : null,
    projectedMedian: this.exposed() ? this.projectedMedian() : null,
    vaultOpen: this.exposed(),
  }));

  ngOnInit(): void {
    this.boundSession = this.finance.sessionToken;
    this.route.queryParamMap.pipe(takeUntil(this.destroy$)).subscribe(params => {
      if (!this.acceptsPublication()) return;
      this.applyQuery(params);
    });
    this.finance.fixedExpenses$.pipe(takeUntil(this.destroy$)).subscribe(rows => {
      if (!this.acceptsPublication()) return;
      this.bills.set(rows);
      this.syncEditors();
      this.cdr.markForCheck();
    });
    this.finance.subscriptions$.pipe(takeUntil(this.destroy$)).subscribe(rows => {
      if (!this.acceptsPublication()) return;
      this.subscriptions.set(rows);
      this.syncEditors();
      this.cdr.markForCheck();
    });
    this.finance.jobIncomes$.pipe(takeUntil(this.destroy$)).subscribe(rows => {
      if (!this.acceptsPublication()) return;
      this.jobs.set(rows);
      this.syncEditors();
      this.cdr.markForCheck();
    });
    this.finance.netWorth$.pipe(takeUntil(this.destroy$)).subscribe(worth => {
      if (!this.acceptsPublication()) return;
      this.netWorth.set(worth?.total ?? null);
      this.cdr.markForCheck();
    });
    this.vault.unlocked$.pipe(takeUntil(this.destroy$)).subscribe(open => {
      if (!open) this.seal();
    });
    this.loadRecords();
  }

  ngAfterViewInit(): void {
    this.viewReady = true;
    this.syncEditors();
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.seal();
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadRecords(): void {
    if (!this.acceptsPublication()) return;
    const session = this.finance.sessionToken;
    const generation = ++this.loadGeneration;
    this.loading.set(true);
    this.loadFailed.set(false);
    forkJoin({
      bills: this.finance.getFixedExpenses(),
      subscriptions: this.finance.getSubscriptions(),
      jobs: this.finance.getJobIncomes(),
      netWorth: this.finance.getNetWorth(),
      transactions: this.finance.getAllTransactions(),
    }).pipe(takeUntil(this.destroy$)).subscribe({
      next: rows => this.finishLoad(session, generation, rows, false),
      error: () => this.finishLoad(session, generation, null, true),
    });
  }

  openBill(key: string): void {
    if (!this.acceptsPublication() || !this.projection().bills.some(bill => bill.key === key)) return;
    this.openedBillKey.set(key);
    this.openedPayId.set(null);
    this.openedModelId.set(null);
    this.cancelRun();
    this.writeRoute(false);
    this.syncEditors();
    this.showInspector();
    this.cdr.markForCheck();
  }

  openPay(id: number): void {
    if (!this.acceptsPublication() || !this.projection().pay.some(drawer => drawer.id === id)) return;
    this.openedBillKey.set(null);
    this.openedPayId.set(id);
    this.openedModelId.set(null);
    this.cancelRun();
    this.writeRoute(false);
    this.syncEditors();
    this.showInspector();
    this.cdr.markForCheck();
  }

  openModel(id: string): void {
    if (!this.acceptsPublication() || !this.projection().models.some(model => model.id === id)) return;
    const enteringSimulation = id === 'simulation' && this.openedModelId() !== 'simulation';
    this.openedBillKey.set(null);
    this.openedPayId.set(null);
    this.openedModelId.set(id);
    if (id === 'simulation' && (enteringSimulation || this.projectionState() === 'idle' || this.projectionState() === 'failed')) {
      this.startRun();
    } else if (id !== 'simulation') {
      this.cancelRun();
    }
    this.writeRoute(false);
    this.syncEditors();
    this.showInspector();
    this.cdr.markForCheck();
  }

  setMonth(value: string): void {
    if (!this.acceptsPublication()) return;
    this.month.set(studyMonth(value, this.defaultMonth));
    this.writeRoute(true);
    this.syncEditors();
    this.cdr.markForCheck();
  }

  retryProjection(): void {
    if (!this.acceptsPublication() || this.openedModelId() !== 'simulation') return;
    this.startRun();
  }

  inputValue(event: Event): string {
    const target = event.target;
    return target instanceof HTMLInputElement ? target.value : '';
  }

  private applyQuery(params: ParamMap): void {
    const query = readStudyQuery(name => params.get(name), this.defaultMonth);
    const same = query.month === this.month()
      && query.bill === this.openedBillKey()
      && query.pay === this.openedPayId()
      && query.model === this.openedModelId();
    if (same) return;
    const wasSimulation = this.openedModelId() === 'simulation';
    this.month.set(query.month);
    this.openedBillKey.set(query.bill);
    this.openedPayId.set(query.pay);
    this.openedModelId.set(query.model);
    if (query.model === 'simulation' && !wasSimulation) this.startRun();
    else if (query.model !== 'simulation') this.cancelRun();
    this.syncEditors();
    this.cdr.markForCheck();
  }

  private startRun(): void {
    if (!this.acceptsPublication()) return;
    const generation = ++this.runGeneration;
    const session = this.boundSession;
    this.projectedMedian.set(null);
    this.projectionState.set('running');
    const draft = readSimulationDraft();
    const horizonYears = draft?.horizonYears ?? STUDY_SIMULATION_DEFAULTS.horizonYears;
    const nPaths = draft?.nPaths ?? STUDY_SIMULATION_DEFAULTS.nPaths;
    const seed = draft?.seed ?? STUDY_SIMULATION_DEFAULTS.seed;
    const spendingMode = draft?.spendingMode ?? 'recurring';
    this.planning.createRun({
      tool_id: MC_TOOL_ID,
      profile_id: null,
      overrides: {
        spending_mode: spendingMode,
        annual_spending: spendingMode === 'manual' ? draft?.annualSpending ?? null : null,
      },
      seed,
      n_paths: nPaths,
      horizon_years: horizonYears,
    }).pipe(takeUntil(this.destroy$)).subscribe({
      next: run => this.finishRun(session, generation, run.result_summary?.terminal_p50, false),
      error: () => this.finishRun(session, generation, null, true),
    });
  }

  private finishRun(session: number, generation: number, median: number | null | undefined, failed: boolean): void {
    if (generation !== this.runGeneration || this.destroyed) return;
    if (this.sealed || !this.vault.isUnlocked) return;
    if (session !== this.boundSession || this.finance.sessionToken !== this.boundSession) {
      this.seal();
      return;
    }
    if (this.openedModelId() !== 'simulation') return;
    const usable = typeof median === 'number' && Number.isFinite(median);
    this.projectedMedian.set(!failed && usable ? median : null);
    this.projectionState.set(!failed && usable ? 'ready' : 'failed');
    this.cdr.markForCheck();
  }

  private cancelRun(): void {
    this.runGeneration += 1;
    this.projectedMedian.set(null);
    this.projectionState.set('idle');
  }

  private writeRoute(replaceUrl: boolean): void {
    if (!this.acceptsPublication()) return;
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: writeStudyQuery({
        month: this.month(),
        bill: this.openedBillKey(),
        pay: this.openedPayId(),
        model: this.openedModelId(),
      }, this.defaultMonth),
      replaceUrl,
    });
  }

  private finishLoad(
    session: number,
    generation: number,
    rows: {
      bills: FixedExpense[];
      subscriptions: BillSubscription[];
      jobs: JobIncome[];
      netWorth: NetWorth | null;
      transactions: Transaction[];
    } | null,
    failed: boolean,
  ): void {
    if (this.destroyed || this.sealed || !this.vault.isUnlocked) return;
    if (session !== this.boundSession || this.finance.sessionToken !== this.boundSession) {
      this.seal();
      return;
    }
    if (generation !== this.loadGeneration) return;
    if (rows) {
      this.bills.set(rows.bills);
      this.subscriptions.set(rows.subscriptions);
      this.jobs.set(rows.jobs);
      this.transactions.set(rows.transactions);
      this.netWorth.set(rows.netWorth?.total ?? null);
    }
    this.loading.set(false);
    this.loadFailed.set(failed);
    this.syncEditors();
    this.cdr.markForCheck();
  }

  private syncEditors(): void {
    if (!this.viewReady || this.destroyed || this.sealed || !this.vault.isUnlocked) return;
    if (this.finance.sessionToken !== this.boundSession) return;
    const bill = this.projection().openedBill;
    const pay = this.projection().openedPay;
    const nextKey = bill ? bill.key : pay ? `pay:${pay.id}` : null;
    if (nextKey === this.editorKey) return;
    this.billEditor?.closeModal();
    this.subscriptionEditor?.closeModal();
    this.jobEditor?.closeModal();
    if (bill?.kind === 'bill') {
      const row = this.bills().find(item => item.id === bill.id);
      if (!row || !this.billEditor) return;
      this.billEditor.openEditModal(row);
    } else if (bill?.kind === 'subscription') {
      const row = this.subscriptions().find(item => item.id === bill.id);
      if (!row || !this.subscriptionEditor) return;
      this.subscriptionEditor.openEditModal(row);
    } else if (pay) {
      const row = this.jobs().find(item => item.id === pay.id);
      if (!row || !this.jobEditor) return;
      this.jobEditor.openEditModal(row);
    }
    this.editorKey = nextKey;
    this.cdr.markForCheck();
  }

  private showInspector(): void {
    if (this.destroyed || this.sealed) return;
    document.querySelector('[data-study-inspector]')?.scrollIntoView({ block: 'start', inline: 'nearest' });
  }

  private acceptsPublication(): boolean {
    if (this.destroyed || this.sealed || !this.vault.isUnlocked) return false;
    if (this.finance.sessionToken !== this.boundSession) {
      this.seal();
      return false;
    }
    return true;
  }

  private seal(): void {
    if (this.sealed) return;
    this.sealed = true;
    this.loadGeneration += 1;
    this.runGeneration += 1;
    this.exposed.set(false);
    this.bills.set([]);
    this.subscriptions.set([]);
    this.jobs.set([]);
    this.transactions.set([]);
    this.netWorth.set(null);
    this.projectedMedian.set(null);
    this.projectionState.set('idle');
    this.openedBillKey.set(null);
    this.openedPayId.set(null);
    this.openedModelId.set(null);
    this.editorKey = null;
    this.billEditor?.closeModal();
    this.subscriptionEditor?.closeModal();
    this.jobEditor?.closeModal();
    this.loading.set(false);
    this.loadFailed.set(false);
    this.cdr.markForCheck();
  }
}
