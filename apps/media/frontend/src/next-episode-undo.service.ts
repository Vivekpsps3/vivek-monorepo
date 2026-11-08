import { Injectable, Injector, inject } from "@angular/core";
import { Subject, filter, finalize, merge, takeUntil } from "rxjs";
import { SESSION_CONTEXT, ToastService } from "@vivek/ui";
import { NextEpisodeService, type NextResult } from "./next-episode.service";

/** Toast actions outlive the row that offered them, including the final episode. */
@Injectable({ providedIn: "root" })
export class NextEpisodeUndoService {
  private readonly injector = inject(Injector);
  private readonly toast = inject(ToastService);
  private readonly session = inject(SESSION_CONTEXT, { optional: true });
  private readonly restored = new Subject<number>();
  readonly restored$ = this.restored.asObservable();

  offer(entryId: number, result: NextResult): void {
    const session = this.session;
    const ownerId = session?.currentUser?.id;
    if (ownerId == null || !session) return;
    const revision = session.revision;
    const current = () => session.currentUser?.id === ownerId && session.revision === revision;
    const label = result.marked.label;
    const episodeId = result.marked.episode_id;
    let inFlight = false;
    const restore = () => {
      if (inFlight || !current()) return;
      inFlight = true;
      this.injector.get(NextEpisodeService).undo(entryId, episodeId)
        .pipe(
          takeUntil(merge(session.cleared$, session.user$.pipe(filter(user => user?.id !== ownerId)))),
          finalize(() => { inFlight = false; }),
        ).subscribe({
          next: () => {
            if (!current()) return;
            this.restored.next(entryId);
            this.toast.show(`${label} is next again.`);
          },
          error: () => {
            if (!current()) return;
            this.toast.error(`Couldn't undo. ${label} is still marked watched.`, {
              label: "Try again", run: restore,
            });
          },
        });
    };
    this.toast.show(`Marked ${label} watched`, "success", undefined, {
      label: "Undo", run: restore,
    });
  }
}
