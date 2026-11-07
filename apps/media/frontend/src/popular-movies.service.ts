import { Injectable, inject, signal } from "@angular/core";
import { HttpClient, HttpErrorResponse } from "@angular/common/http";
import { SearchHit } from "./media.models";
import { cleanPopular, popularError } from "./popular.mjs";

export type PopularState = "idle" | "loading" | "ready" | "error";

@Injectable({ providedIn: "root" })
export class PopularMoviesService {
  private readonly http = inject(HttpClient);
  readonly state = signal<PopularState>("idle");
  readonly rows = signal<SearchHit[]>([]);
  readonly error = signal("");
  load(): void {
    if (this.state() === "loading" || this.state() === "ready") return;
    this.state.set("loading");
    this.error.set("");
    this.http
      .get<{ results: SearchHit[] }>("/media/api/movies")
      .subscribe({
        next: (r) => {
          this.rows.set(cleanPopular(r.results));
          this.state.set("ready");
        },
        error: (e) => {
          this.error.set(
            popularError(e instanceof HttpErrorResponse ? e.status : 0),
          );
          this.state.set("error");
        },
      });
  }
  retry(): void {
    this.load();
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
}
