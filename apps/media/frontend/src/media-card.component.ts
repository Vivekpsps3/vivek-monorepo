import { Component, input, signal } from "@angular/core";
import { RouterLink } from "@angular/router";
import { UiBadgeComponent } from "@vivek/ui";
import { MediaCard, statusLabel } from "./media.models";
@Component({
  selector: "media-card",
  standalone: true,
  imports: [RouterLink, UiBadgeComponent],
  template: `<article class="media-card">
    <a
      class="media-art"
      [routerLink]="['/media/item', item().id]"
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
        <a [routerLink]="['/media/item', item().id]">{{ item().title }}</a>
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
            lifecycle.state === "unknown" ? "Status unknown" : lifecycle.state
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
  </article>`,
})
export class MediaCardComponent {
  readonly item = input.required<MediaCard>();
  readonly broken = signal(false);
  readonly status = statusLabel;
}
