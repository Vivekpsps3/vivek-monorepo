import { ChangeDetectionStrategy, Component, OnInit, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter, map, startWith } from 'rxjs';
import { SETTINGS_SECTIONS } from './settings.registry';

@Component({
  standalone: true,
  template: '',
})
export class SettingsHomeComponent implements OnInit {
  private readonly router = inject(Router);

  ngOnInit(): void {
    if (window.matchMedia('(min-width: 1024px)').matches) {
      void this.router.navigate(['/settings/account'], { replaceUrl: true });
    }
  }
}

@Component({
  selector: 'app-settings-shell',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  templateUrl: './settings-shell.component.html',
  styleUrl: './settings-shell.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsShellComponent {
  readonly sections = SETTINGS_SECTIONS;
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
