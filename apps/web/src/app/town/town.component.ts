import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DOCUMENT } from '@angular/common';
import { EMPTY, Subject, fromEvent, interval } from 'rxjs';
import { catchError, switchMap } from 'rxjs/operators';
import { ToastService, UiButtonComponent, UiCardComponent, UiEmptyStateComponent, UiSkeletonComponent, UiStateComponent } from '@vivek/ui';
import { townSpriteUrl } from './town-sprites';
import { financeVaultPresent } from '../../../../finance/frontend/src/public-api';
import { SessionService } from '../platform/session.service';
import { TownApiService, type CheckinResult } from './town.api';
import { TownLotComponent } from './town-lot.component';
import { TownTodayComponent, liveCheck } from './town-today.component';
import { stage } from './town-levels';
import { applySeen, readSeen } from './town-seen';
import type { TownResponse } from './town.types';

@Component({
  selector: 'app-town',
  imports: [UiButtonComponent, UiCardComponent, UiEmptyStateComponent, UiSkeletonComponent, UiStateComponent, TownLotComponent, TownTodayComponent],
  templateUrl: './town.component.html',
  styleUrl: './town.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TownComponent {
  private readonly api = inject(TownApiService);
  private readonly destroy = inject(DestroyRef);
  private readonly session = inject(SessionService);
  private readonly toast = inject(ToastService);
  private readonly loads = new Subject<void>();
  private pendingLive: CheckinResult | null = null;
  readonly data = signal<TownResponse | null>(null);
  readonly financeVaultPresent = financeVaultPresent;
  readonly state = signal<'loading' | 'ready' | 'unavailable'>('loading');
  readonly live = signal('');
  readonly swapping = signal<Record<string, 1 | 2 | 3>>({});
  readonly placeholders = Array.from({ length: 9 }, (_, i) => i);
  readonly suggestions = ['Read 20 pages', 'Walk 30 minutes', 'Sleep by 12'];
  readonly emptySprite = townSpriteUrl('lot-empty');
  private readonly document = inject(DOCUMENT);
  constructor() {
    this.loads.pipe(
      switchMap(() => this.api.getTown().pipe(catchError((error: { status?: number }) => {
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
    // TF3 implements this hook.
    void slot; void habitId; void prefillName;
  }
  openHistory(): void {
    // TF3 opens the history dialog.
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
    const sorted = { ...data, lots: [...data.lots].sort((a, b) => a.slot - b.slot) };
    const toasted = this.observe(sorted);
    this.data.set(sorted);
    this.state.set('ready');
    const pending = this.pendingLive;
    this.pendingLive = null;
    if (!pending?.checked) return;
    const habit = sorted.habits.find(item => item.id === pending.habit.id) ?? pending.habit;
    this.live.set(liveCheck(habit.name, habit, sorted.town, toasted));
  }
  private observe(data: TownResponse): boolean {
    const userId = this.session.currentUser?.id;
    if (userId == null) return false;
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
  }
  private refreshDay(): void {
    if (this.document.visibilityState !== 'visible' || this.state() !== 'ready') return;
    const now = new Date();
    const day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    if (this.data()?.town.today !== day) this.reload();
  }
  habit(id: number | null) { return this.data()?.habits.find(habit => habit.id === id); }
}
