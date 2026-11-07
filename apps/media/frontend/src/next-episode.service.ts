import { Injectable, inject } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { Observable, map } from "rxjs";
import { Detail, Episode } from "./media.models";

export interface MarkedEpisode {
  episode_id: number;
  season_number: number;
  episode_number: number;
  title: string | null;
  label: string;
}

export interface NextResult {
  marked: MarkedEpisode;
  next: Episode | null;
}

interface NextResponse extends Detail {
  show: Detail["show"];
  marked: MarkedEpisode;
}

@Injectable({ providedIn: "root" })
export class NextEpisodeService {
  private readonly http = inject(HttpClient);

  markNext(entryId: number, expectedEpisodeId: number): Observable<NextResult> {
    return this.http
      .post<NextResponse>(`/media/api/entries/${entryId}/episodes/next`, {
        expected_episode_id: expectedEpisodeId,
      })
      .pipe(
        map((response) => ({
          marked: response.marked,
          next: response.show?.next_episode ?? null,
        })),
      );
  }

  undo(entryId: number, episodeId: number): Observable<void> {
    return this.http
      .post<void>(`/media/api/entries/${entryId}/episodes/${episodeId}/watched`, {
        watched: false,
      })
      .pipe(map(() => undefined));
  }
}
