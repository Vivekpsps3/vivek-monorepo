import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { UiCardComponent } from '@vivek/ui';
import { financeVaultPresent } from '../../../../finance/frontend/src/public-api';
import { TownApiService } from './town.api';
import { TownLotComponent } from './town-lot.component';
import type { TownResponse } from './town.types';

@Component({
  selector: 'app-town',
  imports: [UiCardComponent, TownLotComponent],
  templateUrl: './town.component.html',
  styleUrl: './town.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TownComponent {
  private readonly api = inject(TownApiService);
  private readonly destroy = inject(DestroyRef);
  readonly data = signal<TownResponse | null>(null);
  readonly financeVaultPresent = financeVaultPresent;
  constructor() { this.load(); }
  load(): void {
    this.api.getTown().pipe(takeUntilDestroyed(this.destroy)).subscribe(data => this.data.set(data));
  }
  openHabitDialog(slot: number | null, habitId: number | null, prefillName?: string): void {
    // TF3 implements this hook.
    void slot; void habitId; void prefillName;
  }
  habit(id: number | null) { return this.data()?.habits.find(habit => habit.id === id); }
}
