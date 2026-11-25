import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, Injector, afterNextRender, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ThemeService } from '@vivek/ui';
import { distinctUntilChanged, map, skip } from 'rxjs';
import { bindLockNotices, bindLockSnapshots } from '../../../../finance/frontend/src/public-api';
import { SessionService } from '../platform/session.service';
import { cosmeticById, cosmeticCatalog, cosmeticPart, variantSrc } from './cosmetic-catalog';
import { TownApiService, type StampWallet } from './town.api';

type Confirmation = {
  readonly id: string;
  readonly price: number;
  readonly key: string;
} & ({ readonly action: 'buy' } | { readonly action: 'refund'; readonly spendId: number });

@Component({
  selector: 'app-town-workshop',
  imports: [RouterLink],
  templateUrl: './workshop.component.html',
  styleUrl: './workshop.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorkshopComponent {
  private readonly api = inject(TownApiService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroy = inject(DestroyRef);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  private readonly selection = toSignal(this.route.queryParamMap, { requireSync: true });
  private readonly theme = toSignal(inject(ThemeService).theme$, { requireSync: true });
  private owner: number | null = null;
  private generation = 0;

  protected readonly shop = cosmeticCatalog.filter(item => item.group === 'shop');
  protected readonly wallet = signal<StampWallet | null>(null);
  protected readonly canLoad = signal(false);
  protected readonly loading = signal(false);
  protected readonly busy = signal(false);
  protected readonly loadError = signal(false);
  protected readonly notice = signal('');
  protected readonly error = signal('');
  protected readonly confirmation = signal<Confirmation | null>(null);

  protected readonly active = computed(() => this.wallet()?.entitlements.filter(item => item.active) ?? []);
  protected readonly olderUnlocks = computed(() => this.active().filter(item => cosmeticById(item.catalog_id)?.group !== 'shop'));
  protected readonly id = computed(() => {
    const item = this.selection().get('item');
    return item && /^[a-z0-9][a-z0-9:_-]{0,63}$/.test(item) ? item : this.shop[0].id;
  });
  protected readonly held = computed(() => this.active().find(item => item.catalog_id === this.id()));
  protected readonly asset = computed(() => {
    const asset = cosmeticById(this.id());
    return asset?.group === 'shop' || this.held() ? asset : null;
  });
  protected readonly part = computed(() => cosmeticPart(this.selection().get('part')));
  protected readonly currentConfirmation = computed(() => {
    const choice = this.confirmation();
    return choice?.id === this.id() ? choice : null;
  });
  protected readonly art = computed(() => {
    const asset = this.asset();
    const part = this.part() ?? (this.theme() === 'dark' ? 'night' : 'day');
    return asset ? variantSrc(asset, part, 0) : null;
  });
  protected readonly failedArt = signal<string | null>(null);

  constructor() {
    this.destroy.onDestroy(bindLockSnapshots(() => this.invalidate()));
    this.destroy.onDestroy(bindLockNotices(() => this.invalidate()));
    inject(SessionService).user$.pipe(
      map(user => user?.id ?? null),
      distinctUntilChanged(),
      takeUntilDestroyed(),
    ).subscribe(owner => {
      this.invalidate();
      this.owner = owner;
      this.canLoad.set(owner !== null);
      this.load();
    });
    this.route.queryParamMap.pipe(
      map(params => params.get('item')),
      distinctUntilChanged(),
      skip(1),
      takeUntilDestroyed(),
    ).subscribe(() => {
      if (this.busy()) {
        this.invalidate();
        this.load();
      } else {
        this.clearChoice();
      }
    });
  }

  protected count(value: number): string {
    return value === 1 ? '1 Stamp' : `${value} Stamps`;
  }

  protected legacyLabel(id: string): string {
    return cosmeticById(id)?.label ?? `Older unlock · ${id}`;
  }

  protected select(event: Event): void {
    if (!(event.target instanceof HTMLSelectElement) || this.busy()) return;
    this.clearChoice();
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { item: event.target.value, part: this.part() },
      replaceUrl: true,
    });
  }

  protected load(): void {
    if (this.owner === null || this.loading() || this.busy()) return;
    const generation = ++this.generation;
    this.loading.set(true);
    this.loadError.set(false);
    this.api.getStamps().pipe(takeUntilDestroyed(this.destroy)).subscribe({
      next: wallet => {
        if (generation !== this.generation) return;
        this.wallet.set(wallet);
        this.loading.set(false);
      },
      error: () => {
        if (generation !== this.generation) return;
        this.loadError.set(true);
        this.loading.set(false);
      },
    });
  }

  protected choose(): void {
    const wallet = this.wallet();
    const held = this.held();
    const asset = this.asset();
    if (!wallet || this.busy() || this.loading() || this.currentConfirmation()) return;
    this.clearChoice();
    if (held) {
      this.confirmation.set({ action: 'refund', id: held.catalog_id, price: held.amount,
        spendId: held.spend_receipt_id, key: `market:refund:${held.spend_receipt_id}` });
    } else if (asset?.group === 'shop' && wallet.balance >= asset.priceStamps) {
      this.confirmation.set({ action: 'buy', id: asset.id, price: asset.priceStamps, key: `market:buy:${crypto.randomUUID()}` });
    }
    if (this.confirmation()) this.focus('#workshop-confirmation');
  }

  protected cancel(): void {
    if (this.busy()) return;
    this.clearChoice();
    this.focus('#workshop-action');
  }

  protected confirm(): void {
    const choice = this.currentConfirmation();
    if (!choice || this.busy() || this.loading() || this.owner === null) return;
    const generation = this.generation;
    this.busy.set(true);
    this.error.set('');
    const body = { grant_key: choice.key, catalog_id: choice.id };
    const request = choice.action === 'buy'
      ? this.api.purchaseStamps({ ...body, amount: choice.price })
      : this.api.refundStamps({ ...body, spend_receipt_id: choice.spendId });
    request.pipe(takeUntilDestroyed(this.destroy)).subscribe({
      next: wallet => {
        if (generation !== this.generation) return;
        this.busy.set(false);
        this.wallet.set(wallet);
        this.confirmation.set(null);
        const active = wallet.entitlements.some(item => item.catalog_id === choice.id && item.active);
        this.notice.set(choice.action === 'buy' && active ? 'Unlocked. Place it in Home.' :
          choice.action === 'refund' && !active ? `${this.count(choice.price)} returned.` : 'The unlock changed. The current wallet is shown.');
        this.focus('#workshop-notice');
      },
      error: (failure: { error?: { code?: string } }) => {
        if (generation !== this.generation) return;
        this.busy.set(false);
        const code = failure?.error?.code;
        if (code === 'unlock_in_use') {
          this.error.set('Remove every copy from your saved layouts before refunding.');
        } else if (code === 'layout_recovery') {
          this.error.set('A saved layout needs recovery before you can refund.');
        } else if (code === 'insufficient_stamps' || code === 'already_unlocked' || code === 'entitlement_not_found' || code === 'unlock_changed') {
          this.confirmation.set(null);
          this.wallet.set(null);
          this.error.set('The wallet changed. Review the current balance and unlock before trying again.');
          this.load();
        } else if (code === 'stamp_price_changed') {
          this.confirmation.set(null);
          this.error.set('The price changed. Reload this page to check the current price.');
        } else {
          this.error.set('The workshop did not confirm the change. Try this action again.');
        }
        this.focus('#workshop-error');
      },
    });
  }

  private clearChoice(): void {
    this.confirmation.set(null);
    this.notice.set('');
    this.error.set('');
  }

  private invalidate(): void {
    this.generation += 1;
    this.wallet.set(null);
    this.loading.set(false);
    this.busy.set(false);
    this.loadError.set(false);
    this.clearChoice();
  }

  private focus(selector: string): void {
    const generation = this.generation;
    afterNextRender(() => {
      if (generation !== this.generation || this.destroy.destroyed) return;
      this.host.nativeElement.querySelector<HTMLElement>(selector)?.focus();
    }, { injector: this.injector });
  }
}
