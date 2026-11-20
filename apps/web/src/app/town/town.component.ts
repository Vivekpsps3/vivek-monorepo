import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, InjectionToken, Injector, afterNextRender, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { DOCUMENT } from '@angular/common';
import { EMPTY, Subject, fromEvent, interval } from 'rxjs';
import { catchError, switchMap } from 'rxjs/operators';
import { mayPublish, openBoundedWork } from '@vivek/browser';
import { ToastService, UiButtonComponent, UiCardComponent, UiEmptyStateComponent, UiSkeletonComponent, UiStateComponent } from '@vivek/ui';
import { townSpriteUrl } from './town-sprites';
import {
  VAULT_PRESENCE,
  bindLockNotices,
  bindLockSnapshots,
  financeVaultPresent,
  loadFinanceBudgetKept,
} from '../../../../finance/frontend/src/public-api';
import { SessionService } from '../platform/session.service';
import { TownApiService, type CheckinResult } from './town.api';
import { HabitDialogComponent } from './habit-dialog.component';
import { HistoryDialogComponent } from './history-dialog.component';
import { loadTownHealthStages, type TownHealthStages } from './health';
import { TownExteriorComponent } from './town-exterior.component';
import type { ExteriorHealth } from './town-exterior';
import { TownTodayComponent, liveAgain, liveCheck, liveUndo } from './town-today.component';
import { stage } from './town-levels';
import {
  FINANCE_BUDGET_WEEKS,
  treasuryFromBudget,
  type FinanceBudgetWeek,
  type TreasuryView,
} from './weeks-kept';
import { applySeen, readSeen } from './town-seen';
import type { TownResponse } from './town.types';
import { WORLD_COPY } from '../world/world.types';

/** Same bound as the Finance budget facade default. Town does not import Hub to share the constant. */
const TREASURY_DEADLINE_MS = 8_000;

export type TownBudgetKept = (
  injector: Injector,
  signal: AbortSignal,
  opts: { today: string; weeks: number; includeCurrentWeek?: boolean; deadlineMs?: number },
) => Promise<{ status: string; weeks?: readonly FinanceBudgetWeek[] }>;

/** Tests replace this. Production calls the Finance public loader, which imports crypto only when invoked. */
export const TOWN_BUDGET_KEPT = new InjectionToken<TownBudgetKept>('TOWN_BUDGET_KEPT', {
  factory: () => loadFinanceBudgetKept,
});

export type TownHealthLoad = (
  injector: Injector,
  signal: AbortSignal,
  opts?: { deadlineMs?: number },
) => Promise<TownHealthStages>;

/** Tests replace this. Production calls the Health stage facade, which returns stages only. */
export const TOWN_HEALTH_STAGES = new InjectionToken<TownHealthLoad>('TOWN_HEALTH_STAGES', {
  factory: () => loadTownHealthStages,
});

function vaultOpenFor(userId: number | null): boolean {
  if (userId == null || !financeVaultPresent()) return false;
  try {
    const marked = localStorage.getItem(VAULT_PRESENCE);
    if (marked == null) return true;
    return marked === String(userId);
  } catch {
    return false;
  }
}

@Component({
  selector: 'app-town',
  imports: [RouterLink, UiButtonComponent, UiCardComponent, UiEmptyStateComponent, UiSkeletonComponent, UiStateComponent, TownExteriorComponent, TownTodayComponent, HabitDialogComponent, HistoryDialogComponent],
  templateUrl: './town.component.html',
  styleUrl: './town.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TownComponent {
  private readonly api = inject(TownApiService);
  private readonly destroy = inject(DestroyRef);
  private readonly session = inject(SessionService);
  private readonly toast = inject(ToastService);
  private readonly injector = inject(Injector);
  private readonly budgetKept = inject(TOWN_BUDGET_KEPT);
  private readonly healthStages = inject(TOWN_HEALTH_STAGES);
  private readonly loads = new Subject<void>();
  private budgetAbort = new AbortController();
  private healthAbort = new AbortController();
  private budgetEpoch = 0;
  private healthEpoch = 0;
  private ownerId: number | null | undefined;
  private pendingLive: CheckinResult | null = null;
  /** Day already requested by a visibility or interval refresh. One in-flight load, not one per tick. */
  private pendingDay: string | null = null;
  readonly data = signal<TownResponse | null>(null);
  readonly treasury = signal<TreasuryView>({ status: 'locked' });
  readonly health = signal<ExteriorHealth>({ state: 'locked' });
  readonly financeVaultPresent = financeVaultPresent;
  readonly state = signal<'loading' | 'ready' | 'unavailable'>('loading');
  readonly live = signal('');
  readonly swapping = signal<Record<string, 1 | 2 | 3>>({});
  readonly edit = signal<{ slot: number | null; habitId: number | null; prefill: string } | null>(null);
  readonly historyOpen = signal(false);
  readonly suggestions = ['Read 20 pages', 'Walk 30 minutes', 'Sleep by 12'];
  readonly emptySprite = townSpriteUrl('lot-empty');
  readonly exploreWorld = WORLD_COPY.explore;
  private readonly document = inject(DOCUMENT);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private returnToLibrary = inject(Router).currentNavigation()?.previousNavigation?.finalUrl?.root
    .children['primary']?.segments.map(segment => segment.path).join('/') === 'town/library';
  constructor() {
    this.session.user$.pipe(takeUntilDestroyed(this.destroy)).subscribe(user => this.noteOwner(user?.id ?? null));
    this.session.cleared$.pipe(takeUntilDestroyed(this.destroy)).subscribe(() => this.invalidateOwner());
    this.destroy.onDestroy(bindLockNotices(() => this.dropVaultViews()));
    this.destroy.onDestroy(bindLockSnapshots(() => this.dropVaultViews()));
    this.loads.pipe(
      switchMap(() => this.api.getTown().pipe(catchError((error: { status?: number }) => {
        this.pendingDay = null;
        // A later failure must not wipe the town, the scene camera, or an open draft.
        if (error.status !== 401 && this.data() != null && this.state() === 'ready') {
          this.toast.error('Town is unavailable right now.');
          return EMPTY;
        }
        this.data.set(null);
        // A 401 follows the global auth redirect. Town does not paint a session banner.
        this.state.set(error.status === 401 ? 'loading' : 'unavailable');
        return EMPTY;
      }))),
      takeUntilDestroyed(this.destroy),
    ).subscribe(data => this.show(data));
    this.load();
    fromEvent(this.document, 'visibilitychange').pipe(takeUntilDestroyed(this.destroy)).subscribe(() => this.refreshDay());
    interval(5 * 60_000).pipe(takeUntilDestroyed(this.destroy)).subscribe(() => this.refreshDay());
  }
  load(): void {
    this.state.set('loading');
    this.loads.next();
  }
  reload(): void {
    this.loads.next();
  }
  openHabitDialog(slot: number | null, habitId: number | null, prefillName?: string): void {
    this.edit.set({ slot, habitId, prefill: prefillName ?? '' });
  }
  openHistory(): void {
    this.historyOpen.set(true);
  }
  closeEdit(changed: boolean): void {
    this.edit.set(null);
    if (changed) this.reload();
  }
  closeHistory(changed: boolean): void {
    this.historyOpen.set(false);
    if (changed) this.reload();
  }
  onSettled(result: CheckinResult): void {
    this.data.update(data => data && ({ ...data, town: { ...data.town, ...result.town } }));
    this.pendingLive = result;
    this.reload();
  }
  swapFrom(key: string): 1 | 2 | 3 | null {
    return this.swapping()[key] ?? null;
  }
  private show(data: TownResponse): void {
    this.pendingDay = null;
    const lots = Array.isArray(data.lots) ? [...data.lots].sort((a, b) => a.slot - b.slot) : [];
    const sorted = { ...data, lots };
    const toasted = this.observe(sorted);
    this.data.set(sorted);
    this.state.set('ready');
    if (this.returnToLibrary) {
      this.returnToLibrary = false;
      afterNextRender(() => {
        const active = this.document.activeElement;
        const town = this.host.nativeElement;
        if (active === this.document.body || active === town.querySelector('h1')) {
          town.querySelector<HTMLAnchorElement>('a[href="/town/library"]')?.focus();
        }
      }, { injector: this.injector });
    }
    this.refreshTreasury(sorted.town.today);
    this.refreshHealth();
    const pending = this.pendingLive;
    this.pendingLive = null;
    if (!pending) return;
    const habit = sorted.habits.find(item => item.id === pending.habit.id) ?? pending.habit;
    const message = pending.checked
      ? liveCheck(habit.name, habit, sorted.town, toasted)
      : liveUndo(habit.name);
    this.live.set(liveAgain(this.live(), message));
  }
  private observe(data: TownResponse): boolean {
    const userId = this.session.currentUser?.id;
    if (userId == null) return false;
    try {
      const previous = readSeen(localStorage, userId);
      const outcome = applySeen(localStorage, userId, data);
      if (outcome.toast) this.toast.success(outcome.toast);
      const from: Record<string, 1 | 2 | 3> = {};
      if (previous) {
        for (const swap of outcome.swaps) {
          const seen = previous.b[swap.key];
          if (typeof seen === 'number') from[swap.key] = stage(seen);
        }
      }
      this.swapping.set(from);
      return outcome.toast != null;
    } catch {
      // A throwing localStorage (blocked or full) must not leave the page stuck on skeletons.
      return false;
    }
  }
  private refreshDay(): void {
    if (this.document.visibilityState !== 'visible' || this.state() !== 'ready') return;
    const now = new Date();
    const day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    if (this.data()?.town.today === day || this.pendingDay === day) return;
    this.pendingDay = day;
    this.reload();
  }
  habit(id: number | null) { return this.data()?.habits.find(habit => habit.id === id); }

  private noteOwner(userId: number | null): void {
    if (this.ownerId === undefined) {
      this.ownerId = userId;
      const today = this.data()?.town.today;
      if (today) this.refreshTreasury(today);
      return;
    }
    if (this.ownerId === userId) return;
    this.ownerId = userId;
    this.invalidateOwner();
    const today = this.data()?.town.today;
    if (today && vaultOpenFor(userId)) this.refreshTreasury(today);
    if (vaultOpenFor(userId)) this.refreshHealth();
  }

  /** A new owner or a cleared session drops drafts before either vault view can publish. */
  private invalidateOwner(): void {
    this.pendingLive = null;
    this.edit.set(null);
    this.historyOpen.set(false);
    this.dropVaultViews();
  }

  private dropVaultViews(): void {
    this.dropTreasury();
    this.dropHealth();
  }

  /** Drop the visible tier before any in-flight Finance result can publish it. */
  private dropTreasury(): void {
    this.budgetEpoch += 1;
    this.budgetAbort.abort();
    this.budgetAbort = new AbortController();
    this.treasury.set({ status: 'locked' });
  }

  private refreshTreasury(today: string): void {
    const owner = this.ownerId ?? null;
    if (!vaultOpenFor(owner)) {
      this.dropVaultViews();
      return;
    }
    this.budgetEpoch += 1;
    this.budgetAbort.abort();
    this.budgetAbort = new AbortController();
    const epoch = this.budgetEpoch;
    const ctrl = this.budgetAbort;
    this.treasury.set({ status: 'loading' });
    void this.publishTreasury(today, epoch, ctrl);
  }

  private async publishTreasury(today: string, epoch: number, ctrl: AbortController): Promise<void> {
    const work = openBoundedWork({ controller: ctrl });
    const still = (): boolean => mayPublish(work, epoch === this.budgetEpoch)
      && this.session.currentUser?.id === this.ownerId
      && vaultOpenFor(this.ownerId ?? null);
    try {
      if (!still()) return;
      const result = await this.budgetKept(this.injector, work.signal, {
        today,
        weeks: FINANCE_BUDGET_WEEKS,
        includeCurrentWeek: false,
        deadlineMs: TREASURY_DEADLINE_MS,
      });
      if (!still()) return;
      const view = treasuryFromBudget(result, today);
      if (!view || !still()) return;
      this.treasury.set(view);
    } catch {
      if (!still()) return;
      this.treasury.set({ status: 'unavailable' });
    } finally {
      work.dispose();
    }
  }

  private dropHealth(): void {
    this.healthEpoch += 1;
    this.healthAbort.abort();
    this.healthAbort = new AbortController();
    this.health.set({ state: 'locked' });
  }

  private refreshHealth(): void {
    const owner = this.ownerId ?? null;
    if (!vaultOpenFor(owner)) {
      this.dropHealth();
      return;
    }
    this.healthEpoch += 1;
    this.healthAbort.abort();
    this.healthAbort = new AbortController();
    const epoch = this.healthEpoch;
    const ctrl = this.healthAbort;
    this.health.set({ state: 'loading' });
    void this.publishHealth(epoch, ctrl);
  }

  private async publishHealth(epoch: number, ctrl: AbortController): Promise<void> {
    const work = openBoundedWork({ controller: ctrl });
    const still = (): boolean => mayPublish(work, epoch === this.healthEpoch)
      && this.session.currentUser?.id === this.ownerId
      && vaultOpenFor(this.ownerId ?? null);
    try {
      if (!still()) return;
      const stages = await this.healthStages(this.injector, work.signal);
      if (!still()) return;
      this.health.set(stages);
    } catch {
      if (!still()) return;
      this.health.set({ state: 'unavailable' });
    } finally {
      work.dispose();
    }
  }
}
