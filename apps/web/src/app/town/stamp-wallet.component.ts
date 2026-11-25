import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { UiButtonComponent, UiDialogComponent } from '@vivek/ui';
import { cosmeticById } from './cosmetic-catalog';
import { TownApiService, type StampWallet } from './town.api';

@Component({
  selector: 'app-stamp-wallet',
  imports: [RouterLink, UiButtonComponent, UiDialogComponent],
  templateUrl: './stamp-wallet.component.html',
  styleUrl: './stamp-wallet.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StampWalletComponent {
  private readonly api = inject(TownApiService);
  private readonly destroy = inject(DestroyRef);
  readonly closed = output<void>();
  readonly wallet = signal<StampWallet | null>(null);
  readonly loadError = signal(false);
  readonly active = computed(() => (this.wallet()?.entitlements ?? []).filter(item => item.active));
  readonly balanceLabel = computed(() => {
    const wallet = this.wallet();
    if (!wallet) return this.loadError() ? 'Stamps unavailable' : 'Loading Stamps';
    return wallet.balance === 1 ? '1 Stamp' : `${wallet.balance} Stamps`;
  });
  /** Bumped when the owner changes or the dialog closes, so a late response is dropped. */
  private generation = 0;

  constructor() {
    this.destroy.onDestroy(() => this.invalidate());
    this.load();
  }

  load(): void {
    const generation = ++this.generation;
    this.loadError.set(false);
    this.api.getStamps().pipe(takeUntilDestroyed(this.destroy)).subscribe({
      next: wallet => {
        if (generation !== this.generation) return;
        this.wallet.set(wallet);
      },
      error: () => {
        if (generation !== this.generation) return;
        this.loadError.set(true);
      },
    });
  }

  /** Clear the displayed owner and ignore any response already in flight. */
  invalidate(): void {
    this.generation += 1;
    this.wallet.set(null);
  }

  label(id: string | null): string {
    if (!id) return 'Reward';
    return cosmeticById(id)?.label ?? id;
  }

  close(): void {
    this.closed.emit();
  }
}
