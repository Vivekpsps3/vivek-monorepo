import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DOCUMENT } from '@angular/common';
import { fromEvent, interval } from 'rxjs';
import { UiButtonComponent, UiCardComponent, UiEmptyStateComponent, UiSkeletonComponent, UiStateComponent } from '@vivek/ui';
import { townSpriteUrl } from './town-sprites';
import { financeVaultPresent } from '../../../../finance/frontend/src/public-api';
import { TownApiService } from './town.api';
import { TownLotComponent } from './town-lot.component';
import type { TownResponse } from './town.types';

@Component({
  selector: 'app-town',
  imports: [UiButtonComponent, UiCardComponent, UiEmptyStateComponent, UiSkeletonComponent, UiStateComponent, TownLotComponent],
  templateUrl: './town.component.html',
  styleUrl: './town.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TownComponent {
  private readonly api = inject(TownApiService);
  private readonly destroy = inject(DestroyRef);
  readonly data = signal<TownResponse | null>(null);
  readonly financeVaultPresent = financeVaultPresent;
  readonly state = signal<'loading' | 'ready' | 'unavailable' | 'expired'>('loading');
  readonly placeholders = Array.from({ length: 9 }, (_, i) => i);
  readonly suggestions = ['Read 20 pages', 'Walk 30 minutes', 'Sleep by 12'];
  readonly emptySprite = townSpriteUrl('lot-empty');
  private readonly document = inject(DOCUMENT);
  constructor() {
    this.load();
    fromEvent(this.document, 'visibilitychange').pipe(takeUntilDestroyed(this.destroy)).subscribe(() => this.refreshDay());
    interval(5 * 60_000).pipe(takeUntilDestroyed(this.destroy)).subscribe(() => this.refreshDay());
  }
  load(): void {
    this.state.set('loading');
    this.api.getTown().pipe(takeUntilDestroyed(this.destroy)).subscribe({
      next: data => {
        this.data.set({ ...data, lots: [...data.lots].sort((a, b) => a.slot - b.slot) });
        this.state.set('ready');
      },
      error: (error: { status?: number }) => {
        this.data.set(null);
        this.state.set(error.status === 401 ? 'expired' : 'unavailable');
      },
    });
  }
  openHabitDialog(slot: number | null, habitId: number | null, prefillName?: string): void {
    // TF3 implements this hook.
    void slot; void habitId; void prefillName;
  }
  private refreshDay(): void {
    if (this.document.visibilityState !== 'visible' || this.state() !== 'ready') return;
    const now = new Date();
    const day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    if (this.data()?.town.today !== day) this.load();
  }
  noFreeLot(): string {
    const lots = this.data()?.lots ?? [];
    if (lots.some(lot => lot.state === 'empty')) return '';
    const next = lots.find(lot => lot.state === 'locked');
    return next ? `All unlocked lots are built. Reach Lv ${next.unlock_level} for another.` : 'All lots are built.';
  }
  habit(id: number | null) { return this.data()?.habits.find(habit => habit.id === id); }
}
