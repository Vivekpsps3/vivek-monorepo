import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export type ToastKind = 'success' | 'error' | 'info';

export interface ToastPayload {
  message: string;
  kind: ToastKind;
  undo?: () => void;
}

@Injectable({ providedIn: 'root' })
export class ToastService {
  private readonly toast = new BehaviorSubject<ToastPayload | null>(null);
  readonly toast$ = this.toast.asObservable();
  private timer: ReturnType<typeof setTimeout> | null = null;

  show(message: string, kind: ToastKind = 'success', undo?: () => void): void {
    this.clearTimer();
    this.toast.next({ message, kind, undo });
    this.timer = setTimeout(() => this.dismiss(), undo ? 8000 : 4000);
  }

  success(message: string, undo?: () => void): void {
    this.show(message, 'success', undo);
  }

  error(message: string): void {
    this.show(message, 'error');
  }

  dismiss(): void {
    this.clearTimer();
    this.toast.next(null);
  }

  private clearTimer(): void {
    if (!this.timer) return;
    clearTimeout(this.timer);
    this.timer = null;
  }
}
