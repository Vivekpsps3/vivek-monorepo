import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, input, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter } from 'rxjs';
import { currentSectionNavLink, type UiSectionNavItem } from './section-navigation';

@Component({
  selector: 'ui-section-nav',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './ui-section-nav.component.html',
  styleUrl: './ui-section-nav.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UiSectionNavComponent {
  /** Accessible name, for example "Travel sections". */
  readonly label = input.required<string>();
  readonly items = input.required<readonly UiSectionNavItem[]>();

  private readonly router = inject(Router);
  private readonly navigationId = signal(0);
  protected readonly links = computed(() => this.items().map(item => ({ ...item, url: this.router.parseUrl(item.link) })));
  protected readonly current = computed(() => {
    this.navigationId();
    return currentSectionNavLink(this.router, this.items());
  });

  constructor() {
    this.router.events.pipe(
      filter(event => event instanceof NavigationEnd),
      takeUntilDestroyed(inject(DestroyRef)),
    ).subscribe(event => this.navigationId.set(event.id));
  }
}
