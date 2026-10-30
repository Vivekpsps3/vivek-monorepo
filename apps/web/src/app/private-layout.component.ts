import { ChangeDetectionStrategy, ChangeDetectorRef, Component, DestroyRef, ElementRef, HostListener, ViewChild, inject, isDevMode, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AsyncPipe, NgTemplateOutlet } from '@angular/common';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter } from 'rxjs';
import { ThemeService, UiIconComponent, UserMenuContent, type Theme } from '@vivek/ui';
import { SessionService } from './platform/session.service';

@Component({
  selector: 'suite-private-layout',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, RouterOutlet, FormsModule, AsyncPipe, NgTemplateOutlet, UiIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './private-layout.component.html',
  styleUrl: './private-layout.component.css',
})
export class PrivateLayoutComponent {
  readonly session = inject(SessionService);
  readonly theme = inject(ThemeService);
  readonly featureMenu = inject(UserMenuContent);
  readonly menuOpen = signal(false);
  readonly switcherOpen = signal(false);
  readonly apps = [
    { label: 'Hub', href: '/hub', exact: true },
    { label: 'Finance', href: '/finance', exact: false },
    { label: 'Travel', href: '/travel', exact: false },
    { label: 'Media', href: '/media', exact: false },
  ] as const;

  @ViewChild('userMenu') private userMenu?: ElementRef<HTMLElement>;
  @ViewChild('userButton') private userButton?: ElementRef<HTMLButtonElement>;
  @ViewChild('switcher') private switcher?: ElementRef<HTMLElement>;
  @ViewChild('switcherButton') private switcherButton?: ElementRef<HTMLButtonElement>;

  private readonly router = inject(Router);
  private readonly change = inject(ChangeDetectorRef);
  private lastFocusedPath = '';

  constructor() {
    const destroy = inject(DestroyRef);
    this.session.user$.pipe(takeUntilDestroyed(destroy)).subscribe(() => {
      this.closeMenu(false);
      this.closeSwitcher(false);
    });
    if (typeof document === 'undefined') return;
    this.router.events.pipe(filter(event => event instanceof NavigationEnd), takeUntilDestroyed(destroy)).subscribe(event => {
      this.closeMenu(false);
      this.closeSwitcher(false);
      this.change.markForCheck();
      const path = event.urlAfterRedirects.split(/[?#]/)[0];
      if (path === this.lastFocusedPath) return;
      this.lastFocusedPath = path;
      queueMicrotask(() => {
        if (document.querySelector('dialog[open], [role="dialog"][aria-modal="true"]')) return;
        const heading = document.querySelector<HTMLElement>('#workspace-content main h1');
        if (heading) {
          heading.tabIndex = -1;
          heading.focus({ preventScroll: true });
          return;
        }
        document.getElementById('workspace-content')?.focus({ preventScroll: true });
        if (isDevMode()) console.warn(`No main h1 to focus after navigation to ${path}`);
      });
    });
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

  closeSwitcher(restoreFocus = true): void {
    this.switcherOpen.set(false);
    if (restoreFocus) this.switcherButton?.nativeElement.focus();
  }

  setTheme(choice: Theme): void {
    this.theme.set(choice);
    this.closeMenu();
  }

  onMenuAction(event: MouseEvent): void {
    if (event.target instanceof Element && event.target.closest('a,button')) this.closeMenu();
  }

  onSwitcherKey(event: KeyboardEvent): void {
    if (!this.switcherOpen()) return;
    const items = [...(this.switcher?.nativeElement.querySelectorAll<HTMLAnchorElement>('a') ?? [])];
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
    if (event.key !== 'Tab') return;
    const active = document.activeElement;
    const leavingForward = !event.shiftKey && active === items[items.length - 1];
    const leavingBackward = !!event.shiftKey && (active === items[0] || active === this.switcherButton?.nativeElement);
    if (leavingForward || leavingBackward) this.closeSwitcher(false);
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
  }

  get appName(): string {
    const section = this.router.url.split(/[?#]/)[0].split('/')[1] ?? '';
    return ({ hub: 'Hub', finance: 'Finance', travel: 'Travel', media: 'Media' } as Record<string, string>)[section] || 'Apps';
  }

  get home(): string {
    return this.appName === 'Apps' || this.appName === 'Hub' ? '/hub' : `/${this.appName.toLowerCase()}/`;
  }
}
