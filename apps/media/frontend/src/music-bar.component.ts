import { NgTemplateOutlet } from "@angular/common";
import {
  Component,
  DestroyRef,
  ElementRef,
  Injectable,
  inject,
  input,
  output,
  signal,
} from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { FormsModule } from "@angular/forms";
import { RouterLink } from "@angular/router";
import {
  SESSION_CONTEXT,
  UiButtonComponent,
  UiEmptyStateComponent,
  UiFieldComponent,
  UiFieldControlDirective,
} from "@vivek/ui";
import { collectionQuery, type LibraryFilters } from "./library-filters.mjs";
import { MediaCardComponent } from "./media-card.component";
import {
  ArtistGroup,
  ArtistGroupSummary,
  MediaCard,
} from "./media.models";
import { externalMusicUrl } from "./music-bar.mjs";

const LINK_PREFIX = "media-music-link:";

/** The typed music link for this tab. It is not a library row and it is not played here. */
@Injectable({ providedIn: "root" })
export class MusicLinkDraft {
  private readonly session = inject(SESSION_CONTEXT);

  constructor() {
    this.session.cleared$
      .pipe(takeUntilDestroyed(inject(DestroyRef)))
      .subscribe(() => this.clear());
  }

  read(): string {
    const id = this.session.currentUser?.id;
    if (id == null) return "";
    try {
      return (sessionStorage.getItem(`${LINK_PREFIX}${id}`) || "").slice(0, 2000);
    } catch {
      return "";
    }
  }

  write(value: string): void {
    const id = this.session.currentUser?.id;
    if (id == null) return;
    try {
      const key = `${LINK_PREFIX}${id}`;
      const text = value.slice(0, 2000);
      if (!text) sessionStorage.removeItem(key);
      else sessionStorage.setItem(key, text);
    } catch {
      /* The field stays usable when storage is full or disabled. */
    }
  }

  clear(): void {
    try {
      for (const key of Object.keys(sessionStorage)) {
        if (key.startsWith(LINK_PREFIX)) sessionStorage.removeItem(key);
      }
    } catch {
      /* private mode */
    }
  }
}

@Component({
  selector: "media-music-stage",
  standalone: true,
  imports: [
    FormsModule,
    UiButtonComponent,
    UiFieldComponent,
    UiFieldControlDirective,
  ],
  styleUrl: "./music-bar.component.css",
  template: `<div class="music-stage" role="region" aria-labelledby="song-stage-heading">
    <h2 id="song-stage-heading">Song stage</h2>
    <p class="music-boundary">
      This bar lists saved music. It does not play it.
    </p>
    <div class="stage-objects">
      <div class="stage-object" data-stage="rhythm">
        <h3>Harbor Rhythm</h3>
        <p>The original rhythm game. It is not a music link and it does not play saved songs.</p>
        <ui-button
          variant="secondary"
          [ariaExpanded]="rhythmOpen"
          [ariaControls]="rhythmOpen ? 'harbor-rhythm' : undefined"
          (click)="toggleRhythm($event)"
          >Harbor Rhythm</ui-button
        >
        @if (rhythmOpen) {
          <div id="harbor-rhythm" class="rhythm-panel">
            <h4 id="harbor-rhythm-heading" tabindex="-1">Harbor Rhythm</h4>
            <p>
              This entry stays here. It does not open the music link and it does not play audio.
            </p>
            <ui-button variant="ghost" (click)="closeRhythm()">Close Harbor Rhythm</ui-button>
          </div>
        }
      </div>
      <form class="stage-object" data-stage="external" (ngSubmit)="openExternal()">
        <h3>External music</h3>
        <p>Open a link you choose. This bar does not play that audio.</p>
        <ui-field label="Music link" [error]="linkError">
          <input
            uiFieldControl
            id="external-music"
            type="text"
            inputmode="url"
            name="external-music"
            autocomplete="off"
            maxlength="2000"
            [(ngModel)]="link"
            (ngModelChange)="remember($event)"
          />
        </ui-field>
        <ui-button variant="primary" type="submit">Open external music</ui-button>
      </form>
    </div>
  </div>`,
})
export class MusicStageComponent {
  private readonly drafts = inject(MusicLinkDraft);
  private readonly session = inject(SESSION_CONTEXT);
  private readonly destroyRef = inject(DestroyRef);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  link = "";
  linkError = "";
  rhythmOpen = false;
  private returnFocus: HTMLElement | null = null;

  constructor() {
    this.link = this.drafts.read();
    this.session.cleared$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.link = "";
      this.linkError = "";
      this.rhythmOpen = false;
    });
  }

  remember(value: string): void {
    this.drafts.write(value);
  }

  toggleRhythm(event: Event): void {
    const host = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
    const button = host?.querySelector<HTMLElement>("button") ?? host;
    if (this.rhythmOpen) {
      this.rhythmOpen = false;
      button?.focus();
      return;
    }
    this.rhythmOpen = true;
    this.returnFocus = button;
    this.focusRhythm();
  }

  closeRhythm(): void {
    this.rhythmOpen = false;
    const focus = this.returnFocus;
    this.returnFocus = null;
    focus?.focus();
  }

  openExternal(): void {
    const target = externalMusicUrl(this.link);
    if (!target) {
      this.linkError = "Enter an http or https link. This bar does not play audio.";
      return;
    }
    this.linkError = "";
    window.open(target, "_blank", "noopener,noreferrer");
  }

  private focusRhythm(): void {
    requestAnimationFrame(() => {
      this.host.nativeElement
        .querySelector<HTMLElement>("#harbor-rhythm-heading")
        ?.focus({ preventScroll: true });
    });
  }
}

@Component({
  selector: "media-music-rooms",
  standalone: true,
  imports: [
    NgTemplateOutlet,
    RouterLink,
    MediaCardComponent,
    UiButtonComponent,
    UiEmptyStateComponent,
  ],
  styleUrl: "./music-bar.component.css",
  template: `@if (kind() === "artist") {
      <div class="artist-wall" role="region" aria-labelledby="artist-wall-heading">
        <h2 id="artist-wall-heading" tabindex="-1">Artist wall</h2>
        <p class="music-note">
          A portrait opens that artist's saved albums and songs. An album rating stays on the album.
        </p>
        <div class="media-grid" [attr.aria-busy]="refreshing()">
          @if (offPage()) {
            @if (groupLoading()) {
              <p role="status">Loading saved music…</p>
            }
            @if (groupError()) {
              <p role="alert">{{ groupError() }}</p>
              <ui-button variant="ghost" (click)="reloadGroup.emit()">Retry saved music</ui-button>
            }
          }
          @for (group of groups(); track group.catalog_id) {
            <section class="artist-group" [attr.data-artist-group]="group.catalog_id">
              <button
                type="button"
                class="artist-portrait"
                [attr.data-cover]="covered(group) ? 'present' : 'missing'"
                [attr.aria-label]="'Open the grouping for ' + group.title"
                [attr.aria-expanded]="opened(group.catalog_id)"
                [attr.aria-controls]="opened(group.catalog_id) ? 'group-' + group.catalog_id : null"
                (click)="expandGroup.emit(group)"
              >
                @if (covered(group)) {
                  <img [src]="group.artwork_url" alt="" (error)="markBroken(group.catalog_id)" />
                } @else {
                  <span aria-hidden="true">{{ group.title }}</span>
                }
              </button>
              <h2>
                @if (group.entry_id) {
                  <a
                    [attr.data-media-item]="group.entry_id"
                    [routerLink]="['/media/item', group.entry_id]"
                    [state]="source()"
                    >{{ group.title }}</a
                  >
                } @else {
                  {{ group.title }}
                }
              </h2>
              <p class="muted">
                {{ group.followed ? "Following" : "Not followed" }}
                @if (group.rating !== null && group.rating !== undefined) {
                  · {{ group.rating }} / 10
                }
              </p>
              <ui-button
                class="group-toggle"
                variant="ghost"
                [ariaExpanded]="opened(group.catalog_id)"
                [ariaControls]="'group-' + group.catalog_id"
                (click)="expandGroup.emit(group)"
              >
                {{ opened(group.catalog_id) ? "Hide" : "Show" }}
                saved albums and songs ({{ group.saved_count || 0 }})
              </ui-button>
              @if (opened(group.catalog_id)) {
                <div [id]="'group-' + group.catalog_id" class="saved-children">
                  @for (album of group.albums || []; track album.id) {
                    <div class="saved-album">
                      <media-card [item]="album" [source]="source()" />
                      <div class="saved-songs">
                        @for (song of album.songs || []; track song.id) {
                          <media-card [item]="song" [source]="source()" />
                        } @empty {
                          <p>No saved songs on this album.</p>
                        }
                      </div>
                    </div>
                  }
                  @if (group.songs?.length) {
                    <h3 class="loose-songs">Saved without an album</h3>
                    @for (song of group.songs || []; track song.id) {
                      <media-card [item]="song" [source]="source()" />
                    }
                  }
                  @if (!group.albums?.length && !group.songs?.length && !groupLoading()) {
                    <p>No saved albums or songs for this artist.</p>
                  }
                  @if (group.entry_id && group.source === "musicbrainz") {
                    <a
                      class="discography-link"
                      [routerLink]="['/media/item', group.entry_id, 'discography']"
                      [state]="source()"
                      >Browse discography</a
                    >
                  }
                </div>
              }
            </section>
          } @empty {
            <ng-container *ngTemplateOutlet="roomEmpty" />
          }
        </div>
      </div>
    } @else if (kind() === "album") {
      <div class="album-racks" role="region" aria-labelledby="album-racks-heading">
        <h2 id="album-racks-heading" tabindex="-1">Album racks</h2>
        <p class="music-note">A record opens that saved album. Its rating stays on the album.</p>
        @if (items().length) {
          <div class="media-grid" [attr.aria-busy]="refreshing()">
            @for (item of items(); track item.id) {
              <section class="record">
                <media-card [item]="item" [source]="source()" layout="record" />
                @for (group of item.artist_groups || []; track group.catalog_id) {
                  <a
                    class="group-link"
                    [routerLink]="['/media/library']"
                    [queryParams]="groupParams(group)"
                    >Show {{ group.title }}{{ group.followed ? "" : ", not followed" }} ({{
                      group.saved_count || 0
                    }})</a
                  >
                }
              </section>
            }
          </div>
        } @else {
          <ng-container *ngTemplateOutlet="roomEmpty" />
        }
      </div>
    } @else {
      <div class="songbook" role="region" aria-labelledby="songbook-heading">
        <h2 id="songbook-heading" tabindex="-1">Songbook</h2>
        <p class="music-note">These are saved songs. This bar does not play them.</p>
        @if (items().length) {
          <div class="media-grid" [attr.aria-busy]="refreshing()">
            @for (item of items(); track item.id) {
              <section class="song-row">
                <media-card [item]="item" [source]="source()" />
                @for (group of item.artist_groups || []; track group.catalog_id) {
                  <a
                    class="group-link"
                    [routerLink]="['/media/library']"
                    [queryParams]="groupParams(group)"
                    >Show {{ group.title }}{{ group.followed ? "" : ", not followed" }} ({{
                      group.saved_count || 0
                    }})</a
                  >
                }
              </section>
            }
          </div>
        } @else {
          <ng-container *ngTemplateOutlet="roomEmpty" />
        }
      </div>
    }
    <ng-template #roomEmpty>
      <ui-empty-state [title]="emptyTitle()" [message]="emptyMessage()">
        @if (filtered()) {
          <ui-button variant="ghost" (click)="clearFilters.emit()">Clear filters</ui-button>
        } @else if (kind()) {
          <ui-button variant="ghost" href="/media/library" label="All items" />
        }
        <ui-button
          variant="primary"
          href="/media/search"
          [queryParams]="searchParams()"
          label="Search Media"
        />
      </ui-empty-state>
    </ng-template>`,
})
export class MusicRoomsComponent {
  readonly kind = input.required<string>();
  readonly groups = input<ArtistGroup[]>([]);
  readonly items = input<MediaCard[]>([]);
  readonly source = input<Record<string, unknown> | undefined>(undefined);
  readonly expandedGroup = input<number | null>(null);
  readonly groupLoading = input(false);
  readonly groupError = input("");
  readonly offPage = input(false);
  readonly refreshing = input(false);
  readonly filters = input.required<LibraryFilters>();
  readonly emptyTitle = input("");
  readonly emptyMessage = input("");
  readonly filtered = input(false);
  readonly expandGroup = output<ArtistGroupSummary>();
  readonly reloadGroup = output<void>();
  readonly clearFilters = output<void>();
  private readonly broken = signal<ReadonlySet<number>>(new Set());

  opened(id: number): boolean {
    return this.expandedGroup() === id;
  }

  covered(group: ArtistGroup): boolean {
    return Boolean(group.artwork_url) && !this.broken().has(group.catalog_id);
  }

  markBroken(id: number): void {
    const next = new Set(this.broken());
    next.add(id);
    this.broken.set(next);
  }

  groupParams(group: ArtistGroupSummary): Record<string, unknown> {
    return { ...collectionQuery(this.filters(), "artist"), group: group.catalog_id };
  }

  searchParams(): { kind: string } {
    return { kind: this.kind() };
  }
}
