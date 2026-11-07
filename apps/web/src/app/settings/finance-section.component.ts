import { ChangeDetectionStrategy, ChangeDetectorRef, Component, DestroyRef, Injector, OnInit, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { UiButtonComponent, UiCardComponent, UiStateComponent } from '@vivek/ui';
import { lockFinance, openFinanceVault } from '../../../../finance/frontend/src/public-api';

@Component({
  selector: 'app-finance-section',
  standalone: true,
  imports: [UiButtonComponent, UiCardComponent, UiStateComponent],
  templateUrl: './finance-section.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FinanceSectionComponent implements OnInit {
  private readonly injector = inject(Injector);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly destroyRef = inject(DestroyRef);
  private vault?: Awaited<ReturnType<typeof openFinanceVault>>;
  /** Loading until the browser key has been restored, then locked or ready. */
  locked: boolean | null = null;

  ngOnInit(): void {
    void openFinanceVault(this.injector).then(vault => {
      this.vault = vault;
      return vault.whenReady();
    }).then(() => {
      const vault = this.vault;
      if (!vault) return;
      this.apply();
      vault.unlocked$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => this.apply());
    });
  }

  lock(): void {
    void lockFinance(this.injector);
  }

  private apply(): void {
    const vault = this.vault;
    if (!vault) return;
    this.locked = !vault.isUnlocked;
    this.cdr.markForCheck();
  }
}
