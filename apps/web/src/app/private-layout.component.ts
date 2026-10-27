import { ChangeDetectionStrategy, ChangeDetectorRef, Component, DestroyRef, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AsyncPipe } from '@angular/common';
import { NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter } from 'rxjs';
import { SuiteHubLinkComponent, ThemeService } from '@vivek/ui';
import { SessionService } from './platform/session.service';

@Component({
  selector: 'suite-private-layout', standalone: true,
  imports: [RouterLink, RouterOutlet, FormsModule, AsyncPipe, SuiteHubLinkComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a class="skip-link" href="#workspace-content">Skip to content</a>
    <header class="suite-header">
      <div class="suite-header__inner">
        <ui-suite-hub />
        <a class="suite-brand" [routerLink]="home" [attr.aria-label]="appName + ' home'">{{ appName }}</a>
        <div class="suite-account">
          <label class="visually-hidden" for="suite-theme">Color theme</label>
          <select id="suite-theme" aria-label="Color theme" [ngModel]="theme.current" (ngModelChange)="theme.set($event)">
            <option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option>
          </select>
          <a routerLink="/account" class="suite-profile">Account<span class="suite-name"> · {{ session.currentUser?.display_name }}</span></a>
          @if (session.isAdmin()) { <a routerLink="/hub/admin">Admin</a> }
          <button class="btn btn-ghost" type="button" (click)="session.logout()">Sign out</button>
        </div>
      </div>
    </header>
    <div id="workspace-content" tabindex="-1">
      @if (session.user$ | async; as user) {
        @for (identity of [user]; track identity.id) { <router-outlet /> }
      }
      @else { <p class="page" role="status">Your session ended. <a routerLink="/auth/login">Sign in</a></p> }
    </div>`,
  styles: [`
    :host{display:block;--suite-header-height:4.5rem}
    .suite-header{position:sticky;top:0;z-index:40;border-bottom:1px solid var(--border);background:var(--card-bg);padding:0 max(1rem,env(safe-area-inset-left))}
    .suite-header__inner{min-height:var(--suite-header-height);max-width:80rem;margin:auto;display:flex;align-items:center;gap:1rem}
    .suite-brand{font-weight:650;text-decoration:none;letter-spacing:-.025em}
    .suite-account{display:flex;align-items:center;gap:.8rem;margin-left:auto;min-width:0}
    .suite-account select{width:auto;margin:0;min-height:44px}
    .suite-account a{display:inline-flex;align-items:center;min-height:44px;text-decoration:none;font-size:.875rem}
    .suite-profile{max-width:18rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    #workspace-content{min-width:0;outline:none}
    @supports(backdrop-filter:blur(1px)){.suite-header{background:color-mix(in srgb,var(--card-bg) 94%,transparent);backdrop-filter:blur(18px) saturate(1.2)}}
    @media(max-width:768px){:host{--suite-header-height:4rem}.suite-header__inner{gap:.5rem}.suite-account{gap:.5rem}.suite-name{display:none}.suite-account button{font-size:.75rem}.suite-account select{font-size:.875rem;max-width:7rem}}
    @media(max-width:640px){:host{--suite-header-height:7rem}.suite-header__inner{flex-wrap:wrap;padding-block:.5rem;row-gap:0}.suite-account{flex-basis:100%;justify-content:space-between;margin:0}.suite-header{padding-inline:.75rem}.suite-brand{display:inline-flex;align-items:center;min-height:44px}}
    @media(prefers-reduced-transparency:reduce),(forced-colors:active){.suite-header{backdrop-filter:none;background:var(--card-bg)}}
  `],
})
export class PrivateLayoutComponent {
  readonly session = inject(SessionService);
  readonly theme = inject(ThemeService);
  private readonly router = inject(Router);
  private readonly change = inject(ChangeDetectorRef);
  private lastFocusedPath = '';
  constructor() {
    if (typeof document === 'undefined') return;
    this.router.events.pipe(filter(event => event instanceof NavigationEnd), takeUntilDestroyed(inject(DestroyRef))).subscribe(event => {
      this.change.markForCheck();
      const path = event.urlAfterRedirects.split(/[?#]/)[0];
      if (path === this.lastFocusedPath) return;
      this.lastFocusedPath = path;
      queueMicrotask(() => {
        if (document.querySelector('dialog[open], [role="dialog"][aria-modal="true"]')) return;
        const heading = document.querySelector<HTMLElement>('#workspace-content main h1');
        if (heading) { heading.tabIndex = -1; heading.focus({ preventScroll: true }); }
      });
    });
  }
  get appName(): string {
    const section = this.router.url.split('/')[1];
    return ({ finance: 'Finance', travel: 'Travel', media: 'Media' } as Record<string, string>)[section] || 'Workspace';
  }
  get home(): string { return this.appName === 'Workspace' ? '/hub' : `/${this.appName.toLowerCase()}/`; }
}
