import { ChangeDetectionStrategy, ChangeDetectorRef, Component, DestroyRef, Injector, OnInit, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ToastService, UiButtonComponent, UiCardComponent, UiStateComponent } from '@vivek/ui';
import { FinanceLockService, type AutoLockSetting, openFinanceVault } from '../../../../finance/frontend/src/public-api';

@Component({
  selector: 'app-finance-section',
  standalone: true,
  imports: [UiButtonComponent, UiCardComponent, UiStateComponent],
  templateUrl: './finance-section.component.html',
  styleUrl: './finance-section.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FinanceSectionComponent implements OnInit {
  private readonly injector = inject(Injector);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly destroyRef = inject(DestroyRef);
  private readonly toast = inject(ToastService);
  private vault?: Awaited<ReturnType<typeof openFinanceVault>>;
  private lockService?: FinanceLockService;
  /** Loading until the browser key has been restored, then locked or ready. */
  locked: boolean | null = null;
  readonly autoLockChoices: Array<{ value: AutoLockSetting; label: string }> = [
    { value: 'off', label: 'Off' },
    { value: 5, label: 'After 5 minutes' },
    { value: 15, label: 'After 15 minutes' },
    { value: 60, label: 'After 60 minutes' },
  ];
  autoLock: AutoLockSetting = 15;

  ngOnInit(): void {
    try {
      this.lockService = this.injector.get(FinanceLockService);
      this.autoLock = this.lockService.autoLock();
    } catch {
      this.lockService = undefined;
    }
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

  /** F5: locks without navigating; the section flips to its locked state. */
  lock(): void {
    if (!this.lockService) return;
    void this.lockService.lockNow({ navigate: false }).then(() => {
      this.toast.success('Finance locked.');
      this.apply();
    });
  }

  setAutoLock(value: AutoLockSetting): void {
    this.autoLock = value;
    this.lockService?.setAutoLock(value);
    this.toast.success(value === 'off' ? 'Auto-lock turned off.' : `Auto-lock set to ${value} minutes.`);
    this.cdr.markForCheck();
  }

  private apply(): void {
    const vault = this.vault;
    if (!vault) return;
    this.locked = !vault.isUnlocked;
    this.cdr.markForCheck();
  }
}
