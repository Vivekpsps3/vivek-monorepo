import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export interface ConfirmState {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  resolve?: (confirmed: boolean) => void;
}

@Injectable({ providedIn: 'root' })
export class ConfirmService {
  private readonly state = new BehaviorSubject<ConfirmState | null>(null);
  readonly state$ = this.state.asObservable();

  ask(title: string, message: string, confirmLabel = 'Delete', cancelLabel = 'Cancel'): Promise<boolean> {
    return new Promise(resolve => {
      // A newer confirmation replaces the visible dialog; settle the prior caller as cancelled.
      this.state.value?.resolve?.(false);
      this.state.next({ title, message, confirmLabel, cancelLabel, resolve });
    });
  }

  close(confirmed: boolean): void {
    const current = this.state.value;
    if (!current) return;
    this.state.next(null);
    current.resolve?.(confirmed);
  }
}
