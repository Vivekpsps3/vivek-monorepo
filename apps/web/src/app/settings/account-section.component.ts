import { ChangeDetectionStrategy, ChangeDetectorRef, Component, DestroyRef, ElementRef, OnInit, ViewChild, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { UiButtonComponent, UiCardComponent, UiInputComponent } from '@vivek/ui';
import { UsernameChangeComponent } from '../hub/username-change.component';
import { SessionService } from '../platform/session.service';

@Component({
  selector: 'app-account-section',
  standalone: true,
  imports: [UiButtonComponent, UiCardComponent, UiInputComponent, UsernameChangeComponent],
  templateUrl: './account-section.component.html',
  styleUrl: './account-section.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccountSectionComponent implements OnInit {
  private readonly session = inject(SessionService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly destroyRef = inject(DestroyRef);

  draftName = '';
  savingName = false;
  nameError = '';
  nameInvalid = false;

  @ViewChild(UiInputComponent) private nameField?: UiInputComponent;
  @ViewChild('nameAlert') private nameAlert?: ElementRef<HTMLElement>;

  ngOnInit(): void {
    this.session.user$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(user => {
      if (!this.savingName) this.draftName = user?.display_name || '';
      this.cdr.markForCheck();
    });
  }

  async saveName(): Promise<void> {
    if (this.savingName) return;
    const name = this.draftName.trim().replace(/\s+/g, ' ');
    if (!name) {
      this.showNameError('Enter a name.', true);
      return;
    }
    if (name.length > 160) {
      this.showNameError('Name must be 160 characters or fewer.', true);
      return;
    }
    this.savingName = true;
    this.nameError = '';
    this.nameInvalid = false;
    this.cdr.markForCheck();
    try {
      await this.session.updateDisplayName(name);
    } catch (err) {
      this.showNameError(err instanceof Error ? err.message : 'The name could not be saved.', false);
    } finally {
      this.savingName = false;
      this.cdr.markForCheck();
    }
  }

  private showNameError(message: string, fieldFault: boolean): void {
    this.nameError = message;
    this.nameInvalid = fieldFault;
    this.cdr.detectChanges();
    if (fieldFault) this.nameField?.focus();
    else this.nameAlert?.nativeElement?.focus();
  }
}
