import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { SessionService } from '../platform/session.service';
import { atlasLifeQuery, atlasYearQuery } from './atlas';
import { PixelsDataService } from './pixels-data.service';

@Component({
  selector: 'app-pixels-shell',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  templateUrl: './pixels-shell.component.html',
  styleUrl: './pixels.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PixelsShellComponent {
  private readonly data = inject(PixelsDataService);
  private readonly router = inject(Router);
  protected readonly yearQuery = signal<Record<string, string> | null>(null);
  protected readonly lifeQuery = signal<Record<string, string> | null>(null);

  constructor() {
    const session = inject(SessionService);
    const destroy = inject(DestroyRef);
    const applyLinks = () => {
      this.yearQuery.set(atlasYearQuery(this.router.url));
      this.lifeQuery.set(atlasLifeQuery(this.router.url));
    };
    applyLinks();
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      takeUntilDestroyed(destroy),
    ).subscribe(() => applyLinks());
    session.user$.pipe(takeUntilDestroyed(destroy)).subscribe(user => this.data.noteUser(user?.id ?? null));
    destroy.onDestroy(() => this.data.release());
  }
}
