import { Injectable, inject, signal } from "@angular/core";
import { HttpClient, HttpErrorResponse } from "@angular/common/http";
import { SearchHit } from "./media.models";
import { cleanPopular, popularError } from "./popular.mjs";

export type PopularState = "idle" | "loading" | "ready" | "error";

@Injectable({ providedIn: "root" })
export class PopularMoviesService {
  private readonly http = inject(HttpClient);
  private request = 0;
  readonly state = signal<PopularState>("idle");
  readonly rows = signal<SearchHit[]>([]);
  readonly error = signal("");
  load(): void {
    if (this.state() === "loading" || this.state() === "ready") return;
    this.fetch();
  }
  retry(): void {
    if (this.state() === "loading") return;
    this.fetch();
  }
  markSaved(key: string, savedId: number): void {
    this.rows.update((rows) =>
      rows.map((row) =>
        row.source + "|" + row.source_id === key
          ? { ...row, already_saved: true, saved_id: savedId }
          : row,
      ),
    );
  }
  private fetch(): void {
    const request = ++this.request;
    this.state.set("loading");
    this.error.set("");
    this.http.get<{ results?: unknown } | null>("/media/api/movies").subscribe({
      next: (body) => {
        if (request !== this.request) return;
        this.rows.set(cleanPopular(body?.results));
        this.state.set("ready");
      },
      error: (error) => {
        if (request !== this.request) return;
        this.error.set(
          popularError(error instanceof HttpErrorResponse ? error.status : 0),
        );
        this.state.set("error");
      },
    });
  }
}
