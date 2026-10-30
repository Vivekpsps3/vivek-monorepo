import { ChangeDetectionStrategy, ChangeDetectorRef, Component, DestroyRef, OnInit, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { UiButtonComponent, UiCardComponent, UiStateComponent } from '@vivek/ui';
import { VaultService } from '../../../../finance/frontend/src/app/crypto/vault.service';

@Component({
  selector: 'app-finance-section',
  standalone: true,
  imports: [UiButtonComponent, UiCardComponent, UiStateComponent],
  templateUrl: './finance-section.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FinanceSectionComponent implements OnInit {
  private readonly vault = inject(VaultService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly destroyRef = inject(DestroyRef);
  /** Loading until the browser key has been restored, then locked or ready. */
  locked: boolean | null = null;

  ngOnInit(): void {
    void this.vault.whenReady().then(() => {
      this.apply();
      this.vault.unlocked$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => this.apply());
    });
  }

  lock(): void {
    this.vault.lock();
  }

  private apply(): void {
    this.locked = !this.vault.isUnlocked;
    this.cdr.markForCheck();
  }
}
