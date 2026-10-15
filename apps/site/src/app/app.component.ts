import { Component, DestroyRef, inject, signal } from '@angular/core';
import { ViewportScroller } from '@angular/common';
import { Meta } from '@angular/platform-browser';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { bindSystemTheme, readThemeChoice, setThemePreference, type ThemeChoice } from '@vivek/ui';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css'],
})
export class AppComponent {
  readonly choice = signal<ThemeChoice>(readThemeChoice('vw-theme'));

  get skipLinkHref(): string {
    const currentUrl = this.router.url.split('#')[0] || '/home';
    return `${currentUrl}#main-content`;
  }

  constructor(
    private readonly viewportScroller: ViewportScroller,
    private readonly router: Router,
    private readonly activatedRoute: ActivatedRoute,
    private readonly meta: Meta,
  ) {
    const destroyRef = inject(DestroyRef);
    setThemePreference(this.choice(), 'vw-theme');
    destroyRef.onDestroy(bindSystemTheme('vw-theme', () => this.choice.set('system')));
    this.viewportScroller.setOffset(() => {
      const nav = typeof document === 'undefined' ? null : document.querySelector('.vivek-nav');
      return [0, (nav?.getBoundingClientRect().height ?? 0) + 12];
    });

    this.router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe(() => this.updatePageMetadata());

    this.updatePageMetadata();
  }

  private updatePageMetadata(): void {
    let route = this.activatedRoute;
    while (route.firstChild) route = route.firstChild;

    const title = route.snapshot.title ?? 'Vivek Panchagnula';
    const description = route.snapshot.data['description'] ?? 'Selected work and background in computer engineering, applied AI, and systems.';
    this.meta.updateTag({ name: 'description', content: description });
    this.meta.updateTag({ property: 'og:title', content: title });
    this.meta.updateTag({ property: 'og:description', content: description });
  }

  setTheme(theme: ThemeChoice): void {
    this.choice.set(theme);
    setThemePreference(theme, 'vw-theme');
  }
}
