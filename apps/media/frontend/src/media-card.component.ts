import { Component, input, signal } from "@angular/core";
import { RouterLink } from "@angular/router";
import { formatDay } from "@vivek/browser";
import { UiBadgeComponent } from "@vivek/ui";
import { gameProgressWords, gameStatusWords } from "./games.mjs";
import { MediaCard, statusLabel } from "./media.models";
import { filmShelf, seriesShelf } from "./theater.mjs";
@Component({
  selector: "media-card",
  standalone: true,
  imports: [RouterLink, UiBadgeComponent],
  styleUrl: "./media-card.component.css",
  template: `<article
      class="media-card"
      [class.media-card--poster]="poster()"
      [class.media-card--box]="box()"
      [attr.data-tone]="poster() ? tone() : null"
      [attr.data-film]="poster() && item().kind === 'movie' ? film().tone : null"
      [attr.data-progress]="poster() && item().kind === 'tv' ? series().progress : null"
      [attr.data-lifecycle]="poster() && item().kind === 'tv' ? series().lifecycle : null"
      [attr.data-game]="box() ? item().id : null"
      [attr.data-art]="box() ? (shownArt() ? 'present' : 'missing') : null"
      [attr.data-status]="box() ? item().status : null"
      [attr.aria-busy]="busy() ? 'true' : null"
    >
      @if (poster()) {
        <a
          class="poster-art"
          [routerLink]="['/media/item', item().id]"
          [state]="source()"
          tabindex="-1"
          aria-hidden="true"
        >
          @if (item().artwork_url && !broken()) {
            <img
              [src]="item().artwork_url"
              alt=""
              loading="lazy"
              (error)="broken.set(true)"
            />
          } @else {
            <span>{{ item().title.slice(0, 2).toUpperCase() }}</span>
          }
        </a>
        <div class="poster-copy">
          <h2>
            <a
              [attr.data-media-item]="item().id"
              [routerLink]="['/media/item', item().id]"
              [state]="source()"
              >{{ item().title }}</a
            >
          </h2>
          <p class="poster-fact">{{ fact() }}</p>
          @if (item().kind === "movie" && film().viewedOn) {
            <p class="poster-date">{{ viewedLabel() }}</p>
          }
          @if (item().kind === "tv") {
            <p class="poster-lifecycle">{{ series().lifecycleLabel }}</p>
          }
        </div>
      } @else if (box()) {
        <a
          class="box-face"
          [routerLink]="['/media/item', item().id]"
          [state]="source()"
          tabindex="-1"
          aria-hidden="true"
        >
          @if (shownArt()) {
            <img
              [src]="item().artwork_url"
              alt=""
              loading="lazy"
              (error)="broken.set(true)"
            />
          } @else {
            <span class="box-title-face">{{ item().title }}</span>
          }
        </a>
        <div class="box-copy">
          <h3>
            <a
              [attr.data-media-item]="item().id"
              [routerLink]="['/media/item', item().id]"
              [state]="source()"
              >{{ item().title }}</a
            >
          </h3>
          <p class="box-status">{{ gameStatus() }}</p>
          <p class="box-progress">{{ gameProgress() }}</p>
          @if (item().favorite || (item().rating !== null && item().rating !== undefined)) {
            <p class="box-marks">
              @if (item().favorite) {
                <span>Favorite</span>
              }
              @if (item().rating !== null && item().rating !== undefined) {
                <span>{{ item().rating }} / 10</span>
              }
            </p>
          }
          @if (item().note) {
            <p class="box-note">Note: {{ item().note }}</p>
          }
        </div>
      } @else {
        <a
          class="media-art"
          [routerLink]="['/media/item', item().id]"
          [state]="source()"
          tabindex="-1"
          aria-hidden="true"
        >
          @if (item().artwork_url && !broken()) {
            <img
              [src]="item().artwork_url"
              alt=""
              loading="lazy"
              (error)="broken.set(true)"
            />
          } @else {
            <span>{{ item().title.slice(0, 2).toUpperCase() }}</span>
          }
        </a>
        <div class="media-card-copy">
          <ui-badge>
            {{
              item().kind === "tv"
                ? "Series"
                : item().kind === "track"
                  ? "Song"
                  : item().kind
            }}
            @if (item().year) {
              · {{ item().year }}
            }
          </ui-badge>
          <h2>
            <a
              [attr.data-media-item]="item().id"
              [routerLink]="['/media/item', item().id]"
              [state]="source()"
              >{{ item().title }}</a
            >
          </h2>
          @if (item().creator) {
            <p class="muted">{{ item().creator }}</p>
          }
          <p>
            @if (item().favorite) {
              <ui-badge>Favorite</ui-badge>
            }
            {{ status(item().status) }}
            @if (item().rating !== null) {
              · {{ item().rating }} / 10
            }
          </p>
          @if (item().lifecycle; as lifecycle) {
            <p class="muted">
              {{
                lifecycle.state === "unknown"
                  ? "Status unknown"
                  : lifecycle.state
              }}
              @if (lifecycle.freshness === "stale") {
                · Last update needs refresh
              }
            </p>
          }
          @if (item().caught_up) {
            <p class="muted">Caught up · Waiting for next episode</p>
          }
        </div>
      }
      <div class="card-actions"><ng-content select="[mediaCardActions]" /></div>
    </article>`,
})
export class MediaCardComponent {
  readonly item = input.required<MediaCard>();
  readonly source = input<Record<string, unknown> | undefined>(undefined);
  readonly layout = input<"row" | "poster" | "box">("row");
  readonly busy = input(false);
  readonly broken = signal(false);
  readonly status = statusLabel;
  protected poster(): boolean {
    return this.layout() === "poster";
  }
  protected box(): boolean {
    return this.layout() === "box";
  }
  protected shownArt(): boolean {
    return Boolean(this.item().artwork_url) && !this.broken();
  }
  protected gameStatus(): string {
    return gameStatusWords(this.item().status);
  }
  protected gameProgress(): string {
    return gameProgressWords(this.item());
  }
  protected film() {
    return filmShelf(this.item().status, this.item().viewed_on);
  }
  protected series() {
    return seriesShelf(this.item());
  }
  protected fact(): string {
    return this.item().kind === "tv" ? this.series().fact : this.film().fact;
  }
  protected tone(): string {
    if (this.item().kind !== "tv") return this.film().tone;
    const progress = this.series().progress;
    if (progress === "next") return "continue";
    if (progress === "caught-up") return "caught-up";
    if (progress === "upcoming") return "upcoming";
    if (this.item().status === "want" || this.item().status === "anticipating") {
      return "planned";
    }
    return "none";
  }
  protected viewedLabel(): string {
    const day = this.film().viewedOn;
    return day ? formatDay(day) : "";
  }
}
