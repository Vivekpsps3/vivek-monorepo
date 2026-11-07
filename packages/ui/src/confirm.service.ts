import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export interface ConfirmState {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** K2: when set, the dialog requires typing this exact phrase before confirming. */
  phrase?: string;
  /** K2: label shown on the confirm button while `run` is in flight. */
  busyLabel?: string;
  /** K2: true while the action's `run` callback is in flight. */
  busy?: boolean;
  /** K2: inline error from the last rejected `run`; the dialog stays open. */
  error?: string | null;
  resolve?: (confirmed: boolean) => void;
  /** K2 internal: the action to run on confirm, and its fallback error copy. */
  run?: () => Promise<unknown> | unknown;
  errorMessage?: string;
}

export interface ConfirmActionOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  busyLabel?: string;
  /** Exact, case-sensitive phrase the user must type to enable confirming. */
  phrase?: string;
  /** Copy shown inline when `run` rejects; the dialog stays open for a retry. */
  errorMessage?: string;
  run: () => Promise<unknown> | unknown;
}

const DEFAULT_RUN_ERROR = 'Something went wrong. Nothing was changed. Try again.';

@Injectable({ providedIn: 'root' })
export class ConfirmService {
  private readonly state = new BehaviorSubject<ConfirmState | null>(null);
  readonly state$ = this.state.asObservable();

  ask(title: string, message: string, confirmLabel = 'Delete', cancelLabel = 'Cancel'): Promise<boolean> {
    if (this.state.value?.busy) return Promise.resolve(false);
    return new Promise(resolve => {
      // A newer confirmation replaces the visible dialog; settle the prior caller as cancelled.
      this.state.value?.resolve?.(false);
      this.state.next({ title, message, confirmLabel, cancelLabel, resolve });
    });
  }

  /**
   * K2 confirm-and-run: confirming runs `run` inside the dialog. The returned
   * promise resolves true only after `run` resolves; cancelling resolves
   * false without calling `run`. A rejected `run` keeps the dialog open with
   * an inline error and does not settle the promise, so the user can retry
   * or cancel. While a run is busy, closes are ignored and new requests
   * resolve false without disturbing the busy dialog.
   */
  confirmAction(options: ConfirmActionOptions): Promise<boolean> {
    if (this.state.value?.busy) return Promise.resolve(false);
    return new Promise(resolve => {
      this.state.value?.resolve?.(false);
      this.state.next({
        title: options.title,
        message: options.message,
        confirmLabel: options.confirmLabel,
        cancelLabel: options.cancelLabel,
        phrase: options.phrase,
        busyLabel: options.busyLabel,
        busy: false,
        error: null,
        run: options.run,
        errorMessage: options.errorMessage,
        resolve,
      });
    });
  }

  /** Run the current action dialog's callback. No-op for plain asks. */
  confirmRun(): void {
    const current = this.state.value;
    if (!current?.run || current.busy) return;
    this.state.next({ ...current, busy: true, error: null });
    let outcome: Promise<unknown>;
    try {
      outcome = Promise.resolve(current.run());
    } catch (error) {
      outcome = Promise.reject(error);
    }
    outcome.then(
      () => {
        const settled = this.state.value;
        if (!settled || settled.run !== current.run) return;
        this.state.next(null);
        settled.resolve?.(true);
      },
      () => {
        const active = this.state.value;
        if (!active || active.run !== current.run) return;
        this.state.next({ ...active, busy: false, error: active.errorMessage || DEFAULT_RUN_ERROR });
      },
    );
  }

  close(confirmed: boolean): void {
    const current = this.state.value;
    if (!current) return;
    // A busy confirm-and-run dialog ignores closes (including Esc/backdrop).
    if (current.busy) return;
    // Action dialogs settle true only through a resolved run.
    if (current.run && confirmed) return;
    this.state.next(null);
    current.resolve?.(confirmed);
  }
}
