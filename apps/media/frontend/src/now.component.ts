import { Component, DestroyRef, inject, signal } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { RouterLink } from "@angular/router";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { MediaCardComponent } from "./media-card.component";
import { MediaCard, NextEpisode, errorCopy } from "./media.models";
import {
  UiButtonComponent,
  UiCardComponent,
  UiPageHeaderComponent,
  UiEmptyStateComponent,
} from "@vivek/ui";
interface Summary {
  currently: MediaCard[];
  next_episodes: NextEpisode[];
  recent_reviews: {
    id: number;
    title: string;
    review_excerpt: string;
    rating: number | null;
  }[];
  upcoming: {
    id: number;
    title: string;
    when: string;
    release_on: string | null;
  }[];
  counts: {
    library: number;
  };
}
@Component({
  standalone: true,
  imports: [
    RouterLink,
    MediaCardComponent,
    UiButtonComponent,
    UiCardComponent,
    UiPageHeaderComponent,
    UiEmptyStateComponent,
  ],
  template: `<main class="page media-page">
    <ui-page-header
      eyebrow="Your media, at your pace"
      title="Now"
      subtitle="Pick up where you left off."
    >
      <ui-button
        uiPageActions
        variant="primary"
        href="/media/search"
        label="Find something new"
      />
    </ui-page-header>
    @if (error()) {
      <p class="local-error" role="alert">{{ error() }}</p>
      <ui-button variant="ghost" (click)="load()">Retry Now</ui-button>
    }
    @if (data(); as summary) {
      @if (summary.next_episodes.length) {
        <ui-card>
          <h2>Next episodes</h2>
          @for (episode of summary.next_episodes; track episode.episode_id) {
            <article class="episode-row">
              <div>
                <a [routerLink]="['/media/item', episode.entry_id]"
                  ><strong>{{ episode.show_title }}</strong></a
                >
                <p>
                  S{{ episode.season }} E{{ episode.episode }} ·
                  {{ episode.title }} · {{ episode.air_date }}
                  @if (episode.state === "upcoming") {
                    · Upcoming
                  }
                </p>
              </div>
              <ui-button
                variant="ghost"
                [href]="'/media/item/' + episode.entry_id"
                label="Open series"
              />
            </article>
          }
        </ui-card>
      }
      <section>
        <h2>In progress</h2>
        <div class="media-grid">
          @for (item of summary.currently; track item.id) {
            <media-card [item]="item" />
          } @empty {
            <p class="muted">
              Nothing in progress. Choose something from your library when
              you're ready.
            </p>
          }
        </div>
      </section>
      @if (summary.upcoming.length) {
        <ui-card>
          <h2>Looking forward to</h2>
          @for (item of summary.upcoming; track item.id) {
            <p>
              <a [routerLink]="['/media/item', item.id]">{{ item.title }}</a> ·
              {{ item.release_on || "Date unknown" }}
            </p>
          }
        </ui-card>
      }
      @if (summary.recent_reviews.length) {
        <ui-card>
          <h2>Recent notes</h2>
          @for (review of summary.recent_reviews; track review.id) {
            <article>
              <h3>
                <a [routerLink]="['/media/item', review.id]">{{
                  review.title
                }}</a>
              </h3>
              <p>{{ review.review_excerpt }}</p>
            </article>
          }
        </ui-card>
      }
      @if (!summary.counts.library) {
        <ui-empty-state
          title="A place for your favorites"
          message="Add a book, film, album, or anything you'd like to return to."
        >
          <ui-button
            variant="ghost"
            href="/media/search"
            label="Start your library"
          />
        </ui-empty-state>
      }
    } @else {
      @if (!error()) {
        <p role="status">Loading your media…</p>
      }
    }
  </main>`,
})
export class NowComponent {
  private readonly http = inject(HttpClient);
  private readonly destroy = inject(DestroyRef);
  readonly data = signal<Summary | null>(null);
  readonly error = signal("");
  constructor() {
    this.load();
  }
  load(): void {
    this.error.set("");
    this.http
      .get<Summary>("/media/api/summary")
      .pipe(takeUntilDestroyed(this.destroy))
      .subscribe({
        next: (d) => this.data.set(d),
        error: (e) => this.error.set(errorCopy(e)),
      });
  }
}
