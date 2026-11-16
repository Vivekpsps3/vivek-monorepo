import { ChangeDetectionStrategy, ChangeDetectorRef, Component, DestroyRef, ElementRef, Injector, OnInit, ViewChild, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { SESSION_CONTEXT, ToastService, UiButtonComponent, UiCardComponent, UiInputComponent, UiStateComponent } from '@vivek/ui';
import { FinanceLockService, type AutoLockSetting, bindLockSnapshots, exportFinanceRecovery, openFinanceVault, prepareFinanceRestore, type RecoveryRestorePlan, type RestoreMode } from '../../../../finance/frontend/src/public-api';

@Component({
  selector: 'app-finance-section',
  standalone: true,
  imports: [UiButtonComponent, UiCardComponent, UiInputComponent, UiStateComponent],
  templateUrl: './finance-section.component.html',
  styleUrl: './finance-section.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FinanceSectionComponent implements OnInit {
  private readonly injector = inject(Injector);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly destroyRef = inject(DestroyRef);
  private readonly session = inject(SESSION_CONTEXT, { optional: true });
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
  currentPassphrase = '';
  backupPassword = '';
  backupConfirm = '';
  backupBusy = false;
  backupError = '';
  backupStatus = '';
  private backupAction?: AbortController;
  @ViewChild('backupAlert') private backupAlert?: ElementRef<HTMLElement>;

  changeCurrent = '';
  changeNext = '';
  changeConfirm = '';
  changeBusy = false;
  changeError = '';
  changeInvalid: 'current' | 'next' | 'confirm' | null = null;
  private changeAction?: AbortController;
  @ViewChild('changeCurrentControl') private changeCurrentControl?: UiInputComponent;
  @ViewChild('changeNextControl') private changeNextControl?: UiInputComponent;
  @ViewChild('changeConfirmControl') private changeConfirmControl?: UiInputComponent;
  @ViewChild('changeAlert') private changeAlert?: ElementRef<HTMLElement>;

  async changePassphrase(): Promise<void> {
    if (this.changeBusy || this.backupBusy || this.restoreBusy || this.locked !== false || !this.vault || !this.lockService) return;
    this.changeError = ''; this.changeInvalid = null;
    if (!this.changeCurrent) { this.showChangeError('Enter your current vault passphrase.', 'current'); return; }
    if (this.changeNext.length < 12 || this.changeNext.length > 1024) { this.showChangeError('Use a new passphrase of 12–1,024 characters.', 'next'); return; }
    if (this.changeNext === this.changeCurrent) { this.showChangeError('Choose a different passphrase.', 'next'); return; }
    if (this.changeConfirm !== this.changeNext) { this.showChangeError('New passphrases do not match.', 'confirm'); return; }
    const action = new AbortController();
    const owner = this.session?.currentUser?.id, revision = this.session?.revision;
    this.changeAction = action; this.changeBusy = true;
    try {
      await this.vault.changePassphrase(this.changeCurrent, this.changeNext, action.signal);
      if (action.signal.aborted || this.destroyRef.destroyed || this.session?.currentUser?.id !== owner || this.session?.revision !== revision) return;
      this.cancelPassphraseChange();
      await this.lockService.lockNow({ navigate: false });
      if (!this.destroyRef.destroyed && this.session?.currentUser?.id === owner && this.session?.revision === revision) {
        this.toast.success('Passphrase changed. Unlock Finance with your new passphrase. Other browser sessions have been signed out.');
      }
    } catch (error) {
      if (action.signal.aborted || this.destroyRef.destroyed) return;
      if (error instanceof DOMException && error.name === 'AbortError') { this.cancelPassphraseChange(); return; }
      this.changeBusy = false;
      const status = typeof error === 'object' && error && 'status' in error ? Number(error.status) : 0;
      if (error instanceof Error && error.message === 'Current vault passphrase could not be verified.') this.showChangeError(error.message, 'current');
      else this.showChangeError(status === 409 ? 'Credentials changed while you were working. Retry to verify the current passphrase again.' :
        status === 401 || status === 403 ? 'Your session or proof expired. Sign in again before changing your passphrase.' :
        'Could not confirm the change. Check your connection. If submission was interrupted, try the new passphrase before retrying.');
    } finally {
      if (this.changeAction === action) { this.changeAction = undefined; this.changeBusy = false; }
      if (!this.destroyRef.destroyed) this.cdr.markForCheck();
    }
  }

  cancelPassphraseChange(): void {
    this.changeAction?.abort(); this.changeAction = undefined;
    this.changeCurrent = ''; this.changeNext = ''; this.changeConfirm = '';
    this.changeBusy = false; this.changeError = ''; this.changeInvalid = null;
  }

  private showChangeError(message: string, field: 'current' | 'next' | 'confirm' | null = null): void {
    this.changeError = message; this.changeInvalid = field;
    this.cdr.detectChanges();
    if (field === 'current') this.changeCurrentControl?.focus();
    else if (field === 'next') this.changeNextControl?.focus();
    else if (field === 'confirm') this.changeConfirmControl?.focus();
    else this.changeAlert?.nativeElement.focus();
  }

  restoreFile: File | null = null;
  restorePassword = '';
  restoreMode: RestoreMode = 'merge';
  restoreConfirmation = '';
  restoreAcknowledged = false;
  restoreBusy = false;
  restoreError = '';
  restoreStatus = '';
  restorePlan?: RecoveryRestorePlan;
  private restoreAction?: AbortController;
  @ViewChild('restoreFileControl') private restoreFileControl?: ElementRef<HTMLInputElement>;
  @ViewChild('restoreAlert') private restoreAlert?: ElementRef<HTMLElement>;
  @ViewChild('backupCurrent') private backupCurrent?: UiInputComponent;

  selectRestoreFile(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0] ?? null;
    this.cancelRestore(false);
    this.restoreFile = file;
  }

  async previewRestore(): Promise<void> {
    if (this.restoreBusy || this.backupBusy || this.changeBusy || this.locked !== false) return;
    const file = this.restoreFile;
    const password = this.restorePassword;
    this.cancelRestore(false);
    if (!file || !password) { this.showRestoreError('Choose an encrypted backup file and enter its backup password.'); return; }
    const action = new AbortController();
    this.restoreAction = action;
    this.restoreBusy = true;
    this.restoreStatus = 'Opening and validating the backup locally…';
    try {
      const plan = await prepareFinanceRestore(this.injector, file, password, this.restoreMode, action.signal);
      if (action.signal.aborted || this.destroyRef.destroyed) { plan.dispose(); return; }
      this.restorePlan = plan;
      this.restoreStatus = 'Preview ready. Active vault data is unchanged.';
    } catch (error) {
      if (!action.signal.aborted && !this.destroyRef.destroyed) this.showRestoreError(error instanceof Error ? error.message : 'Backup could not be opened.');
    } finally {
      if (this.restoreAction === action) this.restoreBusy = false;
      if (!this.destroyRef.destroyed) this.cdr.markForCheck();
    }
  }

  async stageRestore(): Promise<void> {
    const plan = this.restorePlan;
    if (!plan || this.restoreBusy || this.backupBusy || this.changeBusy) return;
    this.restoreBusy = true; this.restoreError = ''; this.restoreStatus = 'Staging encrypted records. Active data is unchanged…';
    try {
      await plan.stage();
      if (this.restorePlan === plan) this.restoreStatus = 'Encrypted staging is complete. Activate to apply the previewed changes together.';
    } catch (error) {
      if (this.restorePlan === plan && !this.destroyRef.destroyed) this.showRestoreError(error instanceof Error ? error.message : 'Staging failed. Retry to resume.');
    } finally { this.restoreBusy = false; if (!this.destroyRef.destroyed) this.cdr.markForCheck(); }
  }

  async activateRestore(): Promise<void> {
    const plan = this.restorePlan;
    if (!plan || this.restoreBusy || this.backupBusy || this.changeBusy) return;
    if (plan.mode === 'replace' && (this.restoreConfirmation !== 'REPLACE' || !this.restoreAcknowledged)) {
      this.showRestoreError('Review the backup offer, acknowledge replacement and type REPLACE.'); return;
    }
    this.restoreBusy = true; this.restoreError = ''; this.restoreStatus = 'Activating the confirmed restore…';
    const owner = this.session?.currentUser?.id;
    try {
      const result = await plan.activate(this.restoreConfirmation);
      if (!this.destroyRef.destroyed && this.session?.currentUser?.id === owner) this.toast.success(`Restored ${result.restored} records. Unlock Finance to load the restored vault.`);
    } catch (error) {
      if (this.restorePlan === plan && !this.destroyRef.destroyed) this.showRestoreError(error instanceof Error ? error.message : 'Check the restore status before trying again.');
    } finally { this.restoreBusy = false; if (!this.destroyRef.destroyed) this.cdr.markForCheck(); }
  }

  async discardRestore(id: string): Promise<void> {
    const plan = this.restorePlan;
    if (!plan || this.restoreBusy) return;
    this.restoreBusy = true;
    try { await plan.discard(id); }
    catch (error) { if (this.restorePlan === plan) this.showRestoreError(error instanceof Error ? error.message : 'Could not discard the unfinished stage.'); }
    finally { this.restoreBusy = false; if (!this.destroyRef.destroyed) this.cdr.markForCheck(); }
  }

  offerBackup(): void { this.backupCurrent?.focus(); }

  cancelRestore(clearFile = true): void {
    if (clearFile) {
      this.restoreFile = null;
      if (this.restoreFileControl) this.restoreFileControl.nativeElement.value = '';
    }
    this.restoreAction?.abort(); this.restoreAction = undefined;
    this.restorePlan?.dispose(); this.restorePlan = undefined;
    this.restorePassword = ''; this.restoreConfirmation = ''; this.restoreAcknowledged = false;
    this.restoreBusy = false; this.restoreError = ''; this.restoreStatus = '';
  }

  private showRestoreError(message: string): void {
    this.restoreError = message; this.restoreStatus = '';
    this.cdr.detectChanges(); this.restoreAlert?.nativeElement.focus();
  }

  constructor() {
    const unbindSnapshots = bindLockSnapshots(() => {
      this.cancelPassphraseChange(); this.cancelBackup(); this.cancelRestore();
      this.locked = true; this.cdr.markForCheck();
    });
    this.destroyRef.onDestroy(unbindSnapshots);
    this.destroyRef.onDestroy(() => { this.cancelPassphraseChange(); this.cancelBackup(); this.cancelRestore(); });
  }

  async createBackup(): Promise<void> {
    if (this.backupBusy || this.restoreBusy || this.changeBusy || this.locked !== false) return;
    this.backupError = '';
    this.backupStatus = '';
    if (!this.currentPassphrase) this.backupError = 'Enter your current vault passphrase.';
    else if (this.backupPassword.length < 12 || this.backupPassword.length > 1024) this.backupError = 'Use a backup password of 12–1,024 characters.';
    else if (this.backupPassword !== this.backupConfirm) this.backupError = 'Backup passwords do not match.';
    if (this.backupError) {
      this.cdr.detectChanges();
      this.backupAlert?.nativeElement.focus();
      return;
    }
    const action = new AbortController();
    this.backupAction = action;
    this.backupBusy = true;
    const current = this.currentPassphrase;
    const password = this.backupPassword;
    this.clearBackupFields();
    try {
      await exportFinanceRecovery(this.injector, current, password, action.signal, (file, count) => {
        if (action.signal.aborted || this.destroyRef.destroyed) return;
        const url = URL.createObjectURL(new Blob([file], { type: 'application/json' }));
        try {
          const link = document.createElement('a');
          link.href = url;
          link.download = `vault-recovery-${new Date().toISOString().slice(0, 10)}.vvr`;
          link.click();
        } finally { URL.revokeObjectURL(url); }
        this.backupStatus = `Encrypted backup downloaded (${count} records). Keep the file and backup password safe.`;
      });
    } catch (error) {
      if (!action.signal.aborted && !this.destroyRef.destroyed) {
        this.backupError = error instanceof Error && error.name === 'RecoveryError' ? error.message : 'Backup could not be created. Check your connection and try again.';
      }
    } finally {
      if (this.backupAction === action) {
        this.backupAction = undefined;
        this.backupBusy = false;
      }
      if (!this.destroyRef.destroyed) {
        this.cdr.detectChanges();
        if (this.backupError) this.backupAlert?.nativeElement.focus();
      }
    }
  }

  cancelBackup(): void {
    this.backupAction?.abort();
    this.backupAction = undefined;
    this.backupBusy = false;
    this.clearBackupFields();
    this.backupError = '';
    this.backupStatus = '';
  }

  private clearBackupFields(): void {
    this.currentPassphrase = '';
    this.backupPassword = '';
    this.backupConfirm = '';
  }

  ngOnInit(): void {
    let owner = this.session?.currentUser?.id;
    let revision = this.session?.revision;
    this.session?.user$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(user => {
      if (revision !== this.session?.revision) { revision = this.session?.revision; this.cancelPassphraseChange(); }
      if (user?.id !== owner) { owner = user?.id; this.cancelPassphraseChange(); this.cancelBackup(); this.cancelRestore(); this.restoreFile = null; this.cdr.markForCheck(); }
    });
    try {
      this.lockService = this.injector.get(FinanceLockService);
      this.autoLock = this.lockService.autoLock();
    } catch {
      this.lockService = undefined;
    }
    void openFinanceVault(this.injector).then(vault => {
      if (this.destroyRef.destroyed) return;
      this.vault = vault;
      return vault.whenReady();
    }).then(() => {
      const vault = this.vault;
      if (!vault || this.destroyRef.destroyed) return;
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
    if (this.locked) { this.cancelPassphraseChange(); this.cancelBackup(); this.cancelRestore(); this.restoreFile = null; }
    this.cdr.markForCheck();
  }
}
