import { ChangeDetectionStrategy, ChangeDetectorRef, Component, DestroyRef, OnInit, inject } from '@angular/core';
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
      this.nameError = 'Enter a name.';
      this.cdr.markForCheck();
      return;
    }
    if (name.length > 160) {
      this.nameError = 'Name must be 160 characters or fewer.';
      this.cdr.markForCheck();
      return;
    }
    this.savingName = true;
    this.nameError = '';
    this.cdr.markForCheck();
    try {
      await this.session.updateDisplayName(name);
    } catch (err) {
      this.nameError = err instanceof Error ? err.message : 'The name could not be saved.';
    } finally {
      this.savingName = false;
      this.cdr.markForCheck();
    }
  }
}
