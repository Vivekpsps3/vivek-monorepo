import { ChangeDetectionStrategy, ChangeDetectorRef, Component, DestroyRef, inject, input, OnInit, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  UiButtonComponent,
  UiDialogComponent,
  UiFieldComponent,
  UiFieldControlDirective,
  UiSelectComponent,
} from '@vivek/ui';
import { AccountBalanceEditor } from './account-balance-editor';

@Component({
  selector: 'app-account-balance-editor',
  standalone: true,
  imports: [
    FormsModule,
    UiDialogComponent,
    UiButtonComponent,
    UiFieldComponent,
    UiFieldControlDirective,
    UiSelectComponent,
  ],
  templateUrl: './account-balance-editor.component.html',
  styleUrl: './account-balance-editor.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccountBalanceEditorComponent implements OnInit {
  readonly editor = input.required<AccountBalanceEditor>();
  /** Hall-only. The accounts list leaves this off. */
  readonly showLock = input(false);
  readonly locked = output<void>();
  private readonly cdr = inject(ChangeDetectorRef);
  private release: (() => void) | null = null;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.release?.());
  }

  ngOnInit(): void {
    this.release = this.editor().attach(() => this.cdr.markForCheck());
  }
}
