import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import {
  TOAST_LIMIT,
  toastDuration,
} from './toast-contract';

export type ToastKind = 'success' | 'error' | 'info';

export interface ToastAction {
  label: string;
  run: () => void;
}

export interface ToastPayload {
  id: number;
  message: string;
  kind: ToastKind;
  action?: ToastAction;
  /** @deprecated Use action. Kept so existing Undo callbacks still compile. */
  undo?: () => void;
}

@Injectable({ providedIn: 'root' })
export class ToastService {
  private readonly toastsSubject = new BehaviorSubject<ToastPayload[]>([]);
  private readonly newestSubject = new BehaviorSubject<ToastPayload | null>(null);
  readonly toasts$ = this.toastsSubject.asObservable();
  readonly toast$ = this.newestSubject.asObservable();
  private readonly timers = new Map<number, ReturnType<typeof setTimeout>>();
  private readonly deadlines = new Map<number, number>();
  private readonly remaining = new Map<number, number>();
  private paused = false;
  private nextId = 1;

  show(message: string, kind: ToastKind = 'success', undo?: () => void, action?: ToastAction): void {
    const resolved = action ?? (undo ? { label: 'Undo', run: undo } : undefined);
    const toast: ToastPayload = { id: this.nextId++, message, kind, action: resolved, undo };
    const next = [...this.toastsSubject.value, toast].slice(-TOAST_LIMIT);
    const dropped = this.toastsSubject.value.filter(item => !next.some(kept => kept.id === item.id));
    dropped.forEach(item => this.clearTimer(item.id));
    this.toastsSubject.next(next);
    this.newestSubject.next(toast);
    this.arm(toast);
  }

  success(message: string, undo?: () => void): void {
    this.show(message, 'success', undo);
  }

  error(message: string, action?: ToastAction): void {
    this.show(message, 'error', undefined, action);
  }

  info(message: string): void {
    this.show(message, 'info');
  }

  dismiss(id?: number): void {
    if (id == null) {
      const newest = this.toastsSubject.value.at(-1);
      if (!newest) return;
      this.dismiss(newest.id);
      return;
    }
    this.clearTimer(id);
    const next = this.toastsSubject.value.filter(toast => toast.id !== id);
    this.toastsSubject.next(next);
    this.newestSubject.next(next.at(-1) ?? null);
  }

  pause(): void {
    if (this.paused) return;
    this.paused = true;
    const now = Date.now();
    for (const toast of this.toastsSubject.value) {
      const timer = this.timers.get(toast.id);
      if (timer) clearTimeout(timer);
      this.timers.delete(toast.id);
      this.remaining.set(toast.id, Math.max(0, (this.deadlines.get(toast.id) ?? now) - now));
    }
  }

  resume(): void {
    if (!this.paused) return;
    this.paused = false;
    for (const toast of this.toastsSubject.value) {
      const delay = this.remaining.get(toast.id) ?? toastDuration(!!toast.action);
      this.arm(toast, delay);
    }
  }

  private arm(toast: ToastPayload, delay = toastDuration(!!toast.action)): void {
    this.clearTimer(toast.id);
    this.deadlines.set(toast.id, Date.now() + delay);
    this.timers.set(toast.id, setTimeout(() => this.dismiss(toast.id), delay));
  }

  private clearTimer(id: number): void {
    const timer = this.timers.get(id);
    if (timer) clearTimeout(timer);
    this.timers.delete(id);
    this.deadlines.delete(id);
    this.remaining.delete(id);
  }
}
