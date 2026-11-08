import { ChangeDetectionStrategy, Component, DestroyRef, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { SessionService } from '../platform/session.service';
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

  constructor() {
    const session = inject(SessionService);
    const destroy = inject(DestroyRef);
    session.user$.pipe(takeUntilDestroyed(destroy)).subscribe(user => this.data.noteUser(user?.id ?? null));
    destroy.onDestroy(() => this.data.release());
  }
}
