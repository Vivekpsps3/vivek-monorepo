import { ChangeDetectionStrategy, Component, DestroyRef, HostListener, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { UiIconComponent } from '@vivek/ui';
import { fetchHubSummary } from './hub-load';
import { SessionService } from '../platform/session.service';

@Component({
  selector: 'suite-health-chip',
  standalone: true,
  imports: [RouterLink, UiIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `@if (session.isAdmin() && degraded(); as label) {
    <a routerLink="/hub/admin" class="health-chip"><ui-icon name="alert" /><span>{{ label }} degraded</span></a>
  }`,
  styles: [`
    .health-chip { display: inline-flex; align-items: center; gap: var(--space-2); min-height: 44px; padding: 0 var(--space-2); border-radius: var(--radius-md); background: var(--warning-soft-bg); color: var(--text); text-decoration: none; font-size: var(--text-sm); }
    @media (max-width: 640px) { span { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; } }
  `],
})
export class HealthChipComponent {
  readonly session = inject(SessionService);
  readonly degraded = signal('');
  private owner: number | null = null;
  private started: number | null = null;
  private pending: AbortController | null = null;

  constructor() {
    const destroy = inject(DestroyRef);
    destroy.onDestroy(() => this.clear());
    this.session.user$.pipe(takeUntilDestroyed(destroy)).subscribe(user => {
      const owner = this.session.isAdmin() && user ? user.id : null;
      if (owner === this.owner) return;
      this.clear();
      this.owner = owner;
      void this.check();
    });
  }

  private clear(): void {
    this.pending?.abort();
    this.pending = null;
    this.owner = null;
    this.started = null;
    this.degraded.set('');
  }

  @HostListener('document:visibilitychange')
  onVisibility(): void {
    if (document.visibilityState === 'visible') void this.check();
  }

  private async check(): Promise<void> {
    if (this.owner === null || !this.session.isAdmin() || this.pending || (this.started !== null && Date.now() - this.started < 300_000)) return;
    const ctrl = new AbortController();
    this.pending = ctrl;
    this.started = Date.now();
    const services = ['Travel', 'Media'];
    const results = await Promise.all(services.map(name => fetchHubSummary<{ status?: string }>(`/${name.toLowerCase()}/api/health`, ctrl.signal)));
    if (ctrl.signal.aborted || this.pending !== ctrl) return;
    this.pending = null;
    this.degraded.set(services.filter((_, i) => { const result = results[i]; return result.status !== 'ok' || result.body?.status !== 'ok'; }).join(' and '));
  }
}
