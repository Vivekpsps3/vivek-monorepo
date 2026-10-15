import { AsyncPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { ConfirmService } from '../confirm.service';
import { UiButtonComponent } from '../ui-button/ui-button.component';
import { UiDialogComponent } from '../ui-dialog/ui-dialog.component';

@Component({
  selector: 'ui-confirm-dialog',
  standalone: true,
  imports: [AsyncPipe, UiButtonComponent, UiDialogComponent],
  templateUrl: './ui-confirm-dialog.component.html',
  styleUrl: './ui-confirm-dialog.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UiConfirmDialogComponent {
  private readonly confirmService = inject(ConfirmService);
  readonly state$ = this.confirmService.state$;
  readonly scrollTarget = input('body');

  close(confirmed: boolean): void {
    this.confirmService.close(confirmed);
  }
}
