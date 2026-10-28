import { Component, DestroyRef, OnInit, inject } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter } from 'rxjs';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { ThemeService } from '@vivek/ui';
import { ToastService, UiButtonComponent, UiConfirmDialogComponent, type ToastPayload } from '@vivek/ui';
import { ReleaseFreshnessService } from './platform/release-freshness.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, UiConfirmDialogComponent, UiButtonComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css',
})
export class AppComponent implements OnInit {
  toasts: ToastPayload[] = [];
  private readonly document = inject(DOCUMENT);
  private readonly router = inject(Router);
  private readonly destroy = inject(DestroyRef);

  constructor(
    private toastService: ToastService,
    _theme: ThemeService,
    public releaseFreshness: ReleaseFreshnessService
  ) {}

  ngOnInit() {
    this.toastService.toasts$.subscribe(toasts => (this.toasts = toasts));
    this.releaseFreshness.start();
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      takeUntilDestroyed(this.destroy),
    ).subscribe(event => this.updateIcons(event.urlAfterRedirects));
    if (this.router.navigated) this.updateIcons(this.router.url);
  }

  private updateIcons(url: string): void {
    const personal = /^\/(?:home|work|about|secrets)?\/?$/.test(url.split(/[?#]/)[0]);
    // New URLs refresh the browser's separate, long-lived favicon cache.
    const icons = personal ? {
      ico: '/favicon.ico?v=2', svg: '/favicon.svg?v=2', touch: '/apple-touch-icon.png?v=2',
    } : {
      ico: '/workspace-icon.ico?v=2', svg: '/workspace-icon.svg?v=2', touch: '/workspace-touch-icon.png?v=2',
    };
    for (const [kind, href] of Object.entries(icons)) {
      this.document.querySelector(`link[data-app-icon="${kind}"]`)?.setAttribute('href', href);
    }
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
