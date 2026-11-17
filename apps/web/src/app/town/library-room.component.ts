import { ChangeDetectionStrategy, Component, ElementRef, afterNextRender, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Subject, catchError, distinctUntilChanged, map, of, startWith, switchMap } from 'rxjs';
import { ThemeService, UiButtonComponent } from '@vivek/ui';
import { SessionService } from '../platform/session.service';
import { readingRoom, readingRoomObjects, type ReadingRoomAsset } from './library-room.assets';
import { TownApiService } from './town.api';

@Component({
  selector: 'app-town-library-room',
  imports: [RouterLink, UiButtonComponent],
  templateUrl: './library-room.component.html',
  styleUrl: './library-room.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LibraryRoomComponent {
  private readonly api = inject(TownApiService);
  private readonly session = inject(SessionService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly themeService = inject(ThemeService);
  private readonly route = inject(ActivatedRoute);
  private readonly retry = new Subject<void>();
  private readonly attempts = signal<Partial<Record<ReadingRoomAsset['id'], number>>>({});
  protected readonly painted = signal<readonly ReadingRoomAsset['id'][]>([]);
  protected readonly failed = signal<readonly ReadingRoomAsset['id'][]>([]);
  protected readonly room = readingRoom;
  protected readonly objects = readingRoomObjects;
  protected readonly theme = toSignal(this.themeService.theme$, { requireSync: true });
  private readonly params = toSignal(this.route.queryParamMap, { requireSync: true });
  protected readonly selected = computed(() => this.objects.find(object => object.asset.id === this.params().get('object')));
  protected readonly progress = toSignal(this.session.user$.pipe(
    map(user => user?.id),
    distinctUntilChanged(),
    switchMap(owner => owner == null ? of(null) : this.retry.pipe(
      startWith(undefined),
      switchMap(() => this.api.getTown().pipe(
        map(data => data.buildings.library),
        catchError(() => of(null)),
        startWith('loading' as const),
      )),
    )),
  ), { requireSync: true });

  constructor() {
    afterNextRender(() => {
      this.host.nativeElement.querySelector<HTMLElement>('.objects [aria-current="true"]')?.focus({ preventScroll: true });
    });
  }

  protected retryProgress(): void {
    this.host.nativeElement.querySelector<HTMLElement>('#library-progress')?.focus();
    this.retry.next();
  }

  protected artUrl(asset: ReadingRoomAsset): string {
    const attempt = this.attempts()[asset.id];
    return attempt ? `${asset.src}?retry=${attempt}` : asset.src;
  }

  protected artLoaded(asset: ReadingRoomAsset): void {
    this.painted.update(painted => [...painted, asset.id]);
  }

  protected artFailed(asset: ReadingRoomAsset): void {
    this.failed.update(failed => failed.includes(asset.id) ? failed : [...failed, asset.id]);
  }

  protected retryArt(): void {
    this.attempts.update(attempts => {
      const next = { ...attempts };
      for (const id of this.failed()) next[id] = (next[id] ?? 0) + 1;
      return next;
    });
    this.failed.set([]);
    const objects = this.host.nativeElement.querySelector('.objects');
    (objects?.querySelector<HTMLElement>('[aria-current="true"]') ?? objects?.querySelector('a'))?.focus();
  }
}
