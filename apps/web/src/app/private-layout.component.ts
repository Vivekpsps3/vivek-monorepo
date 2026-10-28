import { ChangeDetectionStrategy, ChangeDetectorRef, Component, DestroyRef, ElementRef, HostListener, ViewChild, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AsyncPipe, NgTemplateOutlet } from '@angular/common';
import { NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter } from 'rxjs';
import { SuiteHubLinkComponent, ThemeService, UserMenuContent, type Theme } from '@vivek/ui';
import { SessionService } from './platform/session.service';

@Component({
  selector: 'suite-private-layout', standalone: true,
  imports: [RouterLink, RouterOutlet, FormsModule, AsyncPipe, NgTemplateOutlet, SuiteHubLinkComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a class="skip-link" href="#workspace-content">Skip to content</a>
    <header class="suite-header">
      <div class="suite-header__inner">
        <ui-suite-hub />
        <a class="suite-brand" [routerLink]="home" [attr.aria-label]="appName + ' home'">{{ appName }}</a>
        <div class="suite-account" #userMenu>
          <button #userButton class="btn btn-ghost user-menu-toggle" type="button"
            [attr.aria-expanded]="menuOpen()" aria-controls="user-dropdown" (click)="menuOpen.set(!menuOpen())">
            {{ session.currentUser?.username || session.currentUser?.display_name || 'You' }}
          </button>
          @if (menuOpen()) {
            <nav id="user-dropdown" class="user-dropdown" aria-label="User options" (click)="onMenuAction($event)">
              <a class="btn btn-ghost user-menu-item" routerLink="/account">Account settings</a>
              @if (session.isAdmin()) { <a class="btn btn-ghost user-menu-item" routerLink="/hub/admin">Account stats · Admin</a> }
              @if (appName === 'Travel') { <a class="btn btn-ghost user-menu-item" routerLink="/travel/settings">Travel settings</a> }
              <label class="user-menu-theme" for="suite-theme">Color theme
                <select id="suite-theme" [ngModel]="theme.current" (ngModelChange)="setTheme($event)">
                  <option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option>
                </select>
              </label>
              @if (featureMenu.template(); as actions) { <div class="user-menu-feature"><ng-container [ngTemplateOutlet]="actions" /></div> }
              <button class="btn btn-ghost user-menu-item" type="button" (click)="session.logout()">Sign out</button>
            </nav>
          }
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
    .suite-account{position:relative;margin-left:auto;min-width:0;max-width:min(18rem,42vw)}
    .user-menu-toggle{display:block;width:100%;min-width:44px;min-height:44px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text)}
    .user-dropdown{position:absolute;right:0;top:calc(100% + .5rem);width:min(18rem,calc(100vw - 1.5rem));max-height:calc(100dvh - 5.5rem);overflow-y:auto;padding:.5rem;box-sizing:border-box;border:1px solid var(--border);border-radius:var(--radius-lg);background:var(--card-bg);box-shadow:var(--shadow-lg);display:grid;gap:.25rem}
    .user-menu-item{justify-content:flex-start;text-align:left;width:100%;min-height:44px;color:var(--text);white-space:normal}
    .user-menu-theme{display:grid;gap:.4rem;padding:.5rem .75rem;font-size:.875rem;color:var(--text-secondary)}
    .user-menu-theme select{width:100%;margin:0;min-height:44px}
    .user-menu-feature{border-top:1px solid var(--border);padding-top:.25rem}
    #workspace-content{min-width:0;outline:none}
    @supports(backdrop-filter:blur(1px)){.suite-header{background:color-mix(in srgb,var(--card-bg) 94%,transparent);backdrop-filter:blur(18px) saturate(1.2)}}
    @media(max-width:640px){:host{--suite-header-height:4rem}.suite-header__inner{gap:.5rem}.suite-header{padding-inline:.75rem}.suite-brand{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.user-menu-toggle{padding-inline:.5rem;font-size:.875rem}}
    @media(prefers-reduced-transparency:reduce),(forced-colors:active){.suite-header{backdrop-filter:none;background:var(--card-bg)}}
  `],
})
export class PrivateLayoutComponent {
  readonly session = inject(SessionService);
  readonly theme = inject(ThemeService);
  readonly featureMenu = inject(UserMenuContent);
  readonly menuOpen = signal(false);
  @ViewChild('userMenu') private userMenu?: ElementRef<HTMLElement>;
  @ViewChild('userButton') private userButton?: ElementRef<HTMLButtonElement>;
  private readonly router = inject(Router);
  private readonly change = inject(ChangeDetectorRef);
  private lastFocusedPath = '';
  constructor() {
    const destroy = inject(DestroyRef);
    this.session.user$.pipe(takeUntilDestroyed(destroy)).subscribe(() => this.closeMenu(false));
    if (typeof document === 'undefined') return;
    this.router.events.pipe(filter(event => event instanceof NavigationEnd), takeUntilDestroyed(inject(DestroyRef))).subscribe(event => {
      this.closeMenu(false);
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
  closeMenu(restoreFocus = true): void {
    this.menuOpen.set(false);
    if (restoreFocus) this.userButton?.nativeElement.focus();
  }
  setTheme(choice: Theme): void {
    this.theme.set(choice);
    this.closeMenu();
  }
  onMenuAction(event: MouseEvent): void {
    if (event.target instanceof Element && event.target.closest('a,button')) this.closeMenu();
  }
  @HostListener('document:click', ['$event'])
  @HostListener('document:focusin', ['$event'])
  onOutside(event: Event): void {
    if (this.menuOpen() && event.target instanceof Node && !this.userMenu?.nativeElement.contains(event.target)) this.closeMenu(false);
  }
  @HostListener('document:keydown.escape', ['$event'])
  onEscape(event: Event): void {
    if (!this.menuOpen()) return;
    event.preventDefault();
    event.stopPropagation();
    this.closeMenu();
  }
  get appName(): string {
    const section = this.router.url.split('/')[1];
    return ({ finance: 'Finance', travel: 'Travel', media: 'Media' } as Record<string, string>)[section] || 'Workspace';
  }
  get home(): string { return this.appName === 'Workspace' ? '/hub' : `/${this.appName.toLowerCase()}/`; }
}
