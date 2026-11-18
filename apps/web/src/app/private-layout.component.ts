import { ChangeDetectionStrategy, ChangeDetectorRef, Component, DestroyRef, ElementRef, HostListener, Injector, ViewChild, inject, isDevMode, signal } from '@angular/core';
import { AsyncPipe, NgTemplateOutlet } from '@angular/common';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter } from 'rxjs';
import { UiIconComponent, UiStateComponent, UserMenuContent, currentSectionNavLink, safeNextPathFrom, type UiSectionNavItem } from '@vivek/ui';
import { financeSections, startFinanceTripSpend } from '../../../finance/frontend/src/public-api';
import { mediaSections } from '../../../media/frontend/src/public-api';
import { travelSections } from '../../../travel/frontend/src/public-api';
import { SessionService } from './platform/session.service';
import { HealthChipComponent } from './hub/health-chip.component';
import { SearchDialogComponent } from './search/search-dialog.component';

@Component({
  selector: 'suite-private-layout',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, RouterOutlet, AsyncPipe, NgTemplateOutlet, UiIconComponent, SearchDialogComponent, UiStateComponent, HealthChipComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './private-layout.component.html',
  styleUrl: './private-layout.component.css',
})
export class PrivateLayoutComponent {
  readonly session = inject(SessionService);
  readonly featureMenu = inject(UserMenuContent);
  readonly menuOpen = signal(false);
  readonly switcherOpen = signal(false);
  readonly searchOpen = signal(false);

  @ViewChild(SearchDialogComponent) private searchDialog?: SearchDialogComponent;

  @ViewChild(RouterOutlet) private outlet?: RouterOutlet;

  /** One global shortcut owner; page commands live with the mounted page. */
  @HostListener('document:keydown', ['$event'])
  onSearchShortcut(event: KeyboardEvent): void {
    if (event.defaultPrevented || event.repeat || !this.session.currentUser ||
      document.querySelector('dialog[open], [role="dialog"][aria-modal="true"], [role="menu"]:not([hidden]), #user-dropdown, #app-switcher-menu')) return;
    if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      this.openSearch();
      return;
    }
    if (event.ctrlKey || event.metaKey || event.altKey ||
      (event.target instanceof Element && event.target.closest('input, textarea, select, [contenteditable]'))) return;
    const page = this.outlet?.isActivated ? this.outlet.component as { onWorkspaceShortcut?: (event: KeyboardEvent) => void } : null;
    page?.onWorkspaceShortcut?.(event);
  }

  openSearch(): void {
    this.closeMenu(false);
    this.closeSwitcher(false);
    this.searchOpen.set(true);
    this.searchDialog?.onOpened();
  }

  closeSearch(): void {
    this.searchOpen.set(false);
  }
  @ViewChild('userMenu') private userMenu?: ElementRef<HTMLElement>;
  @ViewChild('userButton') private userButton?: ElementRef<HTMLButtonElement>;
  @ViewChild('switcher') private switcher?: ElementRef<HTMLElement>;
  @ViewChild('switcherButton') private switcherButton?: ElementRef<HTMLButtonElement>;

  private readonly router = inject(Router);
  readonly apps = [
    { label: 'Hub', href: '/hub', sections: [{ label: 'Agenda', link: '/hub/agenda' }] },
    { label: 'Finance', href: '/finance', sections: financeSections },
    { label: 'Travel', href: '/travel', sections: travelSections },
    { label: 'Media', href: '/media', sections: mediaSections },
    { label: 'Town', href: '/town', sections: [
      { label: 'Reading Hall', link: '/town/library' },
      { label: 'World', link: '/town/world' },
    ] },
    { label: 'Pixels', href: '/pixels', sections: [{ label: 'Life', link: '/pixels/life' }] },
  ].map((app: { label: string; href: string; sections: readonly UiSectionNavItem[] }) => ({
    ...app,
    destinations: app.sections
      .filter(item => item.link !== app.href)
      .map(item => ({ ...item, url: this.router.parseUrl(item.link) })),
  }));
  protected readonly activeDestination = signal<string | undefined>(undefined);
  private readonly change = inject(ChangeDetectorRef);
  private lastFocusedPlace = '';
  /** Drops a heading-focus retry when a newer navigation starts. */
  private focusAttempt = 0;
  private focusTimer: ReturnType<typeof setTimeout> | undefined;

  private readonly tripSpend = startFinanceTripSpend(inject(Injector));

  constructor() {
    const destroy = inject(DestroyRef);
    destroy.onDestroy(() => {
      this.focusAttempt += 1;
      clearTimeout(this.focusTimer);
      this.tripSpend.stop();
    });
    this.session.user$.pipe(takeUntilDestroyed(destroy)).subscribe(() => {
      this.closeMenu(false);
      this.closeSwitcher(false);
      this.tripSpend.sync();
    });
    if (typeof document === 'undefined') return;
    this.router.events.pipe(filter(event => event instanceof NavigationEnd), takeUntilDestroyed(destroy)).subscribe(event => {
      this.closeMenu(false);
      this.closeSwitcher(false);
      this.tripSpend.sync();
      this.change.markForCheck();
      const app = this.currentApp;
      const destination = app && currentSectionNavLink(this.router, app.sections);
      this.activeDestination.set(destination);
      const path = event.urlAfterRedirects.split(/[?#]/)[0];
      const place = destination ? `${path} ${destination}` : path;
      if (place === this.lastFocusedPlace) return;
      this.lastFocusedPlace = place;
      this.focusArrivedHeading(place, path);
    });
  }

  /**
   * Move focus to the new page heading. A confirm dialog often closes in the
   * same turn and restores focus to its trigger, so one microtask is too early:
   * the dialog is still open (and the page is inert) or its close runs afterwards.
   * Wait for that close, focus the heading, confirm once, then stop. A longer
   * loop steals focus from the next keyboard or menu action.
   */
  private focusArrivedHeading(place: string, path: string): void {
    clearTimeout(this.focusTimer);
    const attempt = ++this.focusAttempt;
    const started = performance.now();
    let confirm = false;
    const shellToggle = (node: EventTarget | null): boolean =>
      node === this.switcherButton?.nativeElement || node === this.userButton?.nativeElement;
    // Navigation can begin with focus still on a shell toggle. Move to the
    // heading once, then stop if the user returns to that toggle.
    let correctShellToggle = shellToggle(document.activeElement);
    const tick = (): void => {
      if (attempt !== this.focusAttempt || place !== this.lastFocusedPlace) return;
      if (this.menuOpen() || this.switcherOpen()) return;
      const dialogOpen = !!document.querySelector('dialog[open], [role="dialog"][aria-modal="true"]');
      const heading = document.querySelector<HTMLElement>('#workspace-content main h1');
      const active = document.activeElement;
      const editing = active instanceof HTMLElement
        && !!active.closest('input, textarea, select, [contenteditable="true"]');
      if (editing) return;
      // A control inside the arrived page owns the keyboard. Section links sit
      // outside main, so choosing Net worth or Trips still moves focus to the
      // new heading. Chasing that heading after the user reaches Add
      // transaction, Edit, the year grid or a focusable table row steals Enter.
      const inPageControl = active instanceof HTMLElement
        && !!active.closest('#workspace-content main')
        && !!active.closest('a, button, input, textarea, select, [role="button"], [role="link"], [role="grid"], [tabindex]:not([tabindex="-1"]), [contenteditable="true"]');
      if (inPageControl) return;
      if (shellToggle(active) && !correctShellToggle) return;
      if (!dialogOpen && heading) {
        if (shellToggle(active)) correctShellToggle = false;
        if (active !== heading) {
          if (confirm || performance.now() - started > 400) return;
          heading.tabIndex = -1;
          heading.focus({ preventScroll: true, focusVisible: false } as FocusOptions & { focusVisible?: boolean });
          this.focusTimer = setTimeout(tick, 0);
          return;
        }
        if (!confirm) {
          confirm = true;
          this.focusTimer = setTimeout(tick, 0);
        }
        return;
      }
      if (performance.now() - started < 400) {
        this.focusTimer = setTimeout(tick, 16);
        return;
      }
      if (!dialogOpen) {
        document.getElementById('workspace-content')?.focus({ preventScroll: true });
        if (isDevMode()) console.warn(`No main h1 to focus after navigation to ${path}`);
      }
    };
    queueMicrotask(tick);
  }

  toggleMenu(): void {
    this.closeSwitcher(false);
    this.menuOpen.update(open => !open);
  }

  toggleSwitcher(): void {
    this.closeMenu(false);
    this.switcherOpen.update(open => !open);
  }

  closeMenu(restoreFocus = true): void {
    this.menuOpen.set(false);
    if (restoreFocus) this.userButton?.nativeElement.focus();
  }

  /**
   * Escape has to remove the menu before the key event returns. The signal
   * update otherwise waits for a later change-detection turn, so the next
   * open still sees the menu and skips the click that would show it.
   */
  private paintMenus(): void {
    if (!this.userButton && !this.switcherButton) return;
    this.change.detectChanges();
  }

  onSwitcherLink(): void {
    // Let RouterLink handle the click before removing the link from the DOM.
    // Leave focus alone; the arrived page heading takes it.
    queueMicrotask(() => {
      if (this.switcherOpen()) this.closeSwitcher(false);
    });
  }

  closeSwitcher(restoreFocus = true): void {
    this.switcherOpen.set(false);
    if (restoreFocus) {
      this.paintMenus();
      this.switcherButton?.nativeElement.focus({ preventScroll: true });
    }
  }

  onMenuAction(event: MouseEvent): void {
    if (event.target instanceof Element && event.target.closest('a,button')) this.closeMenu();
  }

  onSwitcherKey(event: KeyboardEvent): void {
    if (!this.switcherOpen()) return;
    const items = [...(this.switcher?.nativeElement.querySelectorAll<HTMLAnchorElement>('.app-switcher__menu a') ?? [])];
    if (!items.length) return;
    const index = items.indexOf(document.activeElement as HTMLAnchorElement);
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const next = index === -1
        ? (event.key === 'ArrowDown' ? 0 : items.length - 1)
        : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
      items[next]?.focus();
      return;
    }
    if (event.key === 'Home') {
      event.preventDefault();
      items[0]?.focus();
      return;
    }
    if (event.key === 'End') {
      event.preventDefault();
      items[items.length - 1]?.focus();
      return;
    }
  }

  @HostListener('document:click', ['$event'])
  @HostListener('document:focusin', ['$event'])
  onOutside(event: Event): void {
    if (!(event.target instanceof Node)) return;
    if (this.menuOpen() && !this.userMenu?.nativeElement.contains(event.target)) this.closeMenu(false);
    if (this.switcherOpen() && !this.switcher?.nativeElement.contains(event.target)) this.closeSwitcher(false);
  }

  @HostListener('document:keydown.escape', ['$event'])
  onEscape(event: Event): void {
    if (this.switcherOpen()) {
      event.preventDefault();
      event.stopPropagation();
      this.closeSwitcher();
      return;
    }
    if (!this.menuOpen()) return;
    event.preventDefault();
    event.stopPropagation();
    this.closeMenu();
    this.paintMenus();
  }

  private get currentApp() {
    const path = this.router.url.split(/[?#]/)[0];
    return this.apps.find(app => path === app.href || path.startsWith(app.href + '/'));
  }

  get appName(): string {
    return this.currentApp?.label ?? 'Apps';
  }

  get switcherLabel(): string {
    return this.currentApp
      ? `Switch apps and destinations. Current app ${this.appName}`
      : 'Switch apps and destinations';
  }

  /**
   * Return path for the session-ended sign-in: the current URL when it is a
   * safe same-origin relative path (the login page's own validation),
   * otherwise the Hub.
   */
  get sessionEndedNext(): string {
    return safeNextPathFrom(this.router.url) ?? '/hub';
  }
}
