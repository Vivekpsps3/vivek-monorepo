import { Component, DestroyRef, inject, signal } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { FormsModule } from "@angular/forms";
import { ActivatedRoute } from "@angular/router";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { errorCopy } from "./media.models";
import {
  UiButtonComponent,
  UiFieldComponent,
  UiFieldControlDirective,
  UiCardComponent,
  UiPageHeaderComponent,
} from "@vivek/ui";
interface Track {
  source_id: string;
  title: string;
  saved: boolean;
  saved_id?: number;
}
interface Album extends Track {
  year: number;
  tracks: Track[];
}
interface Discography {
  partial: boolean;
  group_offset: number;
  release_offset: number;
  albums: Album[];
}
@Component({
  standalone: true,
  imports: [
    FormsModule,
    UiButtonComponent,
    UiFieldComponent,
    UiFieldControlDirective,
    UiCardComponent,
    UiPageHeaderComponent,
  ],
  template: `<main class="page media-page">
    <ui-page-header
      backLabel="← Artist"
      [backLink]="'/media/item/' + id"
      eyebrow="Explore, then choose"
      title="Browse discography"
      subtitle="Browsing does not save albums or songs."
    >
      <ui-field uiPageActions label="Release type"
        ><select
          uiFieldControl
          [(ngModel)]="release"
          (ngModelChange)="load(true)"
        >
          @for (type of types; track type) {
            <option [value]="type">{{ type }}</option>
          }
        </select></ui-field
      >
    </ui-page-header>
    @if (error()) {
      <p role="alert" class="local-error">{{ error() }}</p>
      <ui-button variant="ghost" (click)="load()">Retry discography</ui-button>
    }
    @if (loading()) {
      <p role="status">Loading releases…</p>
    }
    @if (data(); as discography) {
      @if (discography.partial) {
        <p class="local-error" role="status">
          More releases may be available. This page is incomplete.
        </p>
      }
      @for (album of discography.albums; track album.source_id) {
        <ui-card>
          <div class="episode-row">
            <div>
              <h2>{{ album.title }}</h2>
              <p>{{ album.year }}</p>
            </div>
            @if (album.saved) {
              <ui-button
                variant="ghost"
                [href]="'/media/item/' + album.saved_id"
                label="Open saved album"
              />
            } @else {
              <ui-button
                variant="ghost"
                [disabled]="busy()"
                (click)="save(album, null)"
              >
                Add album
              </ui-button>
            }
          </div>
          <details>
            <summary>Songs ({{ album.tracks.length }})</summary>
            @for (track of album.tracks; track track.source_id) {
              <div class="episode-row">
                <span>{{ track.title }}</span>
                @if (track.saved) {
                  <ui-button
                    variant="ghost"
                    [href]="'/media/item/' + track.saved_id"
                    label="Open saved song"
                  />
                } @else {
                  <ui-button
                    variant="ghost"
                    [disabled]="busy()"
                    (click)="save(album, track)"
                  >
                    Add song
                  </ui-button>
                }
              </div>
            }
          </details>
        </ui-card>
      } @empty {
        @if (!loading()) {
          <p>No releases found for this filter. Try another release type.</p>
        }
      }
      @if (discography.partial) {
        <ui-button variant="ghost" [disabled]="loading()" (click)="more()">
          Next releases
        </ui-button>
      }
    }
  </main>`,
})
export class DiscographyComponent {
  private readonly http = inject(HttpClient);
  private readonly destroy = inject(DestroyRef);
  readonly id = Number(inject(ActivatedRoute).snapshot.paramMap.get("id"));
  readonly types = ["studio", "single", "ep", "live", "remix", "compilation"];
  release = "studio";
  readonly data = signal<Discography | null>(null);
  readonly loading = signal(false);
  readonly busy = signal(false);
  readonly error = signal("");
  private group = 0;
  private offset = 0;
  constructor() {
    this.load();
  }
  load(reset = false): void {
    if (reset) {
      this.group = 0;
      this.offset = 0;
    }
    this.loading.set(true);
    this.error.set("");
    this.http
      .get<Discography>("/media/api/entries/" + this.id + "/discography", {
        params: {
          release: this.release,
          group_offset: this.group,
          release_offset: this.offset,
        },
      })
      .pipe(takeUntilDestroyed(this.destroy))
      .subscribe({
        next: (d) => {
          this.data.set(d);
          this.loading.set(false);
        },
        error: (e) => {
          this.error.set(errorCopy(e));
          this.loading.set(false);
        },
      });
  }
  more(): void {
    this.group = this.data()?.group_offset || 0;
    this.offset = this.data()?.release_offset || 0;
    this.load();
  }
  save(album: Album, track: Track | null): void {
    this.busy.set(true);
    this.error.set("");
    this.http
      .post<{
        id: number;
      }>("/media/api/entries/" + this.id + "/discography", {
        kind: track ? "track" : "album",
        source_id: track?.source_id || album.source_id,
        album_source_id: album.source_id,
        album_title: album.title,
        year: album.year,
        title: track?.title || album.title,
      })
      .pipe(takeUntilDestroyed(this.destroy))
      .subscribe({
        next: (d) => {
          const target = track || album;
          target.saved = true;
          target.saved_id = d.id;
          this.data.update((value) => (value ? { ...value } : value));
          this.busy.set(false);
        },
        error: (e) => {
          this.error.set(errorCopy(e));
          this.busy.set(false);
        },
      });
  }
}
