import { Component, OnInit } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ThemeService } from './services/theme.service';
import { ToastService, UiButtonComponent, UiConfirmDialogComponent, type ToastPayload } from '@vivek/ui';
import { ReleaseFreshnessService } from './services/release-freshness.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, UiConfirmDialogComponent, UiButtonComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css',
})
export class AppComponent implements OnInit {
  toasts: ToastPayload[] = [];

  constructor(
    private toastService: ToastService,
    _theme: ThemeService,
    public releaseFreshness: ReleaseFreshnessService
  ) {}

  ngOnInit() {
    this.toastService.toasts$.subscribe(toasts => (this.toasts = toasts));
    this.releaseFreshness.start();
  }

  get politeToasts(): ToastPayload[] {
    return this.toasts.filter(toast => toast.kind !== 'error');
  }

  get alertToasts(): ToastPayload[] {
    return this.toasts.filter(toast => toast.kind === 'error');
  }

  pauseToasts(): void {
    this.toastService.pause();
  }

  resumeToasts(): void {
    this.toastService.resume();
  }

  dismissToast(id: number): void {
    this.toastService.dismiss(id);
  }

  runToastAction(toast: ToastPayload): void {
    const action = toast.action ?? (toast.undo ? { label: 'Undo', run: toast.undo } : undefined);
    action?.run();
    this.toastService.dismiss(toast.id);
  }
}
