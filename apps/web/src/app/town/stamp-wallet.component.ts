import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, Injector, afterNextRender, computed, inject, output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { UiButtonComponent, UiDialogComponent } from '@vivek/ui';
import { cosmeticById } from './cosmetic-catalog';
import { TownApiService, type StampEntitlement, type StampWallet } from './town.api';

const REFUND_PHRASE = 'refund';

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
  private readonly injector = inject(Injector);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  readonly closed = output<void>();
  readonly wallet = signal<StampWallet | null>(null);
  readonly loadError = signal(false);
  readonly phrase = signal('');
  readonly chosen = signal<StampEntitlement | null>(null);
  readonly formError = signal('');
  readonly busy = signal(false);
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
    const generation = this.generation;
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

  /** Drop the draft and ignore any response already in flight. */
  invalidate(): void {
    this.generation += 1;
    this.phrase.set('');
    this.chosen.set(null);
    this.formError.set('');
    this.busy.set(false);
    this.wallet.set(null);
  }

  label(id: string | null): string {
    if (!id) return 'Reward';
    return cosmeticById(id)?.label ?? id;
  }

  onPhrase(event: Event): void {
    if (event.target instanceof HTMLInputElement) this.phrase.set(event.target.value);
  }

  choose(item: StampEntitlement): void {
    this.chosen.set(item);
    this.formError.set('');
    // The phrase field is created by this change. Focus it after that render.
    afterNextRender(() => {
      if (this.destroy.destroyed || this.chosen() !== item) return;
      this.host.nativeElement.querySelector<HTMLElement>('#stamp-refund-phrase')?.focus();
    }, { injector: this.injector });
  }

  submitRefund(event: Event): void {
    event.preventDefault();
    const item = this.chosen();
    if (!item || this.phrase() !== REFUND_PHRASE || this.busy()) return;
    const generation = this.generation;
    this.busy.set(true);
    this.formError.set('');
    this.api.refundStamps({
      grant_key: `market:refund:${item.catalog_id}:${item.spend_receipt_id}`,
      catalog_id: item.catalog_id,
    }).pipe(takeUntilDestroyed(this.destroy)).subscribe({
      next: wallet => {
        if (generation !== this.generation) return;
        this.busy.set(false);
        this.phrase.set('');
        this.chosen.set(null);
        this.wallet.set(wallet);
      },
      error: () => {
        if (generation !== this.generation) return;
        this.busy.set(false);
        this.formError.set('The phrase is still here. Try the refund again.');
      },
    });
  }

  close(): void {
    this.closed.emit();
  }
}
