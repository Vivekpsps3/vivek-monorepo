import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter, map, startWith } from 'rxjs';
import { SETTINGS_GROUPS, SETTINGS_SECTIONS } from './settings.registry';

@Component({
  selector: 'app-settings-shell',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  templateUrl: './settings-shell.component.html',
  styleUrl: './settings-shell.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsShellComponent {
  readonly groups = SETTINGS_GROUPS.map(label => ({
    label,
    sections: SETTINGS_SECTIONS.filter(section => section.group === label),
  }));
  readonly activeLinkOptions = {
    paths: 'exact',
    queryParams: 'ignored',
    matrixParams: 'ignored',
    fragment: 'ignored',
  } as const;
  private readonly router = inject(Router);
  private readonly url = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map(event => event.urlAfterRedirects),
      startWith(this.router.url),
    ),
    { initialValue: this.router.url },
  );
  /** True on `/settings/:section`. The index stays `/settings` at every width. */
  readonly sectionActive = computed(() => /^\/settings\/[^/?#]+/.test((this.url() ?? '').split(/[?#]/)[0]));
}
