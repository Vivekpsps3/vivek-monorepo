import { AsyncPipe } from '@angular/common';
import {
  AfterViewChecked,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  ViewChild,
  inject,
  input,
  signal,
} from '@angular/core';
import { ConfirmService, type ConfirmState } from '../confirm.service';
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
export class UiConfirmDialogComponent implements AfterViewChecked {
  private readonly confirmService = inject(ConfirmService);
  readonly state$ = this.confirmService.state$;
  readonly scrollTarget = input('body');

  /** K2: the phrase the user has typed so far (exact match, never trimmed). */
  readonly typed = signal('');
  @ViewChild('phraseField') private phraseField?: ElementRef<HTMLInputElement>;
  @ViewChild('confirmButton', { read: ElementRef }) private confirmButton?: ElementRef<HTMLElement>;
  @ViewChild('cancelButton', { read: ElementRef }) private cancelButton?: ElementRef<HTMLElement>;
  private currentState: ConfirmState | null = null;
  private typedResetFor: ((confirmed: boolean) => void) | undefined;
  private focusedError: string | null = null;

  constructor() {
    this.state$.subscribe(state => {
      this.currentState = state;
    });
  }

  ngAfterViewChecked(): void {
    const state = this.currentState;
    // Busy/error transitions copy the state object but keep the same
    // resolve/run pair; only a genuinely new request resets the phrase.
    if (state?.resolve !== this.typedResetFor) {
      this.typedResetFor = state?.resolve;
      if (state) {
        this.typed.set('');
        this.focusedError = null;
        // Cancel always takes initial focus, even when a phrase field is
        // present (queued after the dialog's own focus pass).
        queueMicrotask(() => this.cancelButton?.nativeElement.querySelector('button')?.focus());
      }
    }
    // After a failed run, move focus to the phrase field (typed dialogs) or
    // back to the destructive button (non-typed dialogs), once per error.
    if (state?.error && state.error !== this.focusedError) {
      this.focusedError = state.error;
      queueMicrotask(() => {
        if (state.phrase) this.phraseField?.nativeElement.focus();
        else this.confirmButton?.nativeElement.querySelector('button')?.focus();
      });
    }
  }

  phraseMatches(state: ConfirmState): boolean {
    return !state.phrase || this.typed() === state.phrase;
  }

  onTyped(event: Event): void {
    this.typed.set((event.target as HTMLInputElement).value);
  }

  onPhraseEnter(state: ConfirmState): void {
    if (this.phraseMatches(state)) this.confirm(state);
  }

  confirm(state: ConfirmState): void {
    if (state.run) {
      if (!this.phraseMatches(state)) return;
      this.confirmService.confirmRun();
    } else {
      this.confirmService.close(true);
    }
  }

  close(confirmed: boolean): void {
    this.confirmService.close(confirmed);
  }
}
