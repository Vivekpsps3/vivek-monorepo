import { HttpClient, HttpErrorResponse } from "@angular/common/http";
import {
  Component,
  DestroyRef,
  HostListener,
  Injector,
  afterNextRender,
  inject,
  signal,
} from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { Subscription, filter, firstValueFrom, merge, take } from "rxjs";
import {
  ConfirmService,
  SESSION_CONTEXT,
  UiButtonComponent,
  UiEmptyStateComponent,
  UiFieldComponent,
  UiFieldControlDirective,
  UiPageHeaderComponent,
  UiDialogComponent,
  silentErrorToast,
} from "@vivek/ui";
import {
  acceptMemoryLoad,
  browserZone,
  clearMemoryDraft,
  settleMemoryWrite,
  type MemoryList,
  type TripMemory,
} from "./memories.mjs";
import { travelError } from "./travel.models";

@Component({
  selector: "travel-memories",
  standalone: true,
  imports: [
    UiButtonComponent,
    UiEmptyStateComponent,
    UiFieldComponent,
    UiFieldControlDirective,
    UiPageHeaderComponent,
    UiDialogComponent,
  ],
  styleUrl: "./memories.component.css",
  template: `<main class="page travel-page">
    <ui-page-header title="Trip memories">
      <ui-button uiPageActions variant="ghost" type="button" (click)="load()">
        Reload memories
      </ui-button>
    </ui-page-header>
    <p class="muted">
      Each card is the saved trip. Town credit is a separate date from the span.
      Pixels counts the days inside the span. Nothing here is a second copy.
    </p>
    @if (error()) {
      <p class="local-error" role="alert">{{ error() }}</p>
      <ui-button variant="ghost" type="button" (click)="load()">Retry memories</ui-button>
    }
    @if (data(); as list) {
      <section id="trip-memories" tabindex="-1" aria-labelledby="memory-differences">
        <h2 id="memory-differences">How these dates differ</h2>
        <ul>
          @for (item of list.differences; track item.id) {
            <li [attr.data-difference]="item.id">{{ item.text }}</li>
          }
        </ul>
        @if (list.notice) {
          <p role="status">{{ list.notice }}</p>
        }
        @if (list.memories.length) {
          <div class="memory-list">
            @for (memory of list.memories; track memory.id) {
              <article
                class="memory-card"
                [id]="'memory-' + memory.trip_id"
                tabindex="-1"
                [attr.data-trip]="memory.trip_id"
              >
                <p class="eyebrow">{{ memory.mark_label }}</p>
                <h2>{{ memory.title }}</h2>
                <p>Source trip {{ memory.trip_id }}.</p>
                <h3>Span</h3>
                <p>{{ memory.span_text }}</p>
                <p>{{ memory.overlap_text }}</p>
                <h3>Town credit</h3>
                <p>{{ memory.logged_text }}</p>
                <p>{{ memory.credit_text }}</p>
                <h3>Pixels</h3>
                <p>{{ memory.pixels_text }}</p>
                <h3>Place</h3>
                <p>{{ memory.world_text }}</p>
                <div class="button-row">
                  <ui-button
                    variant="secondary"
                    [href]="memory.route"
                    [label]="'Open ' + memory.title"
                  />
                  <ui-button
                    variant="secondary"
                    type="button"
                    [disabled]="saving()"
                    (click)="openRedate(memory)"
                  >
                    Redate {{ memory.title }}
                  </ui-button>
                  @if (memory.status === "booked" || memory.status === "done") {
                    <ui-button
                      variant="ghost"
                      type="button"
                      [disabled]="saving()"
                      (click)="cancelTrip(memory)"
                    >
                      Cancel {{ memory.title }}
                    </ui-button>
                  }
                  <ui-button
                    variant="danger"
                    type="button"
                    [disabled]="saving()"
                    (click)="deleteTrip(memory)"
                  >
                    Delete {{ memory.title }}
                  </ui-button>
                </div>
              </article>
            }
          </div>
        } @else {
          <ui-empty-state
            title="No saved trips yet"
            message="A trip memory appears here from a trip you save. Nothing is invented."
          />
        }
      </section>
    } @else if (!error()) {
      <p role="status">Loading trip memories…</p>
    }
    <ui-dialog [open]="editingId() !== null" labelledBy="memory-redate-title" (closed)="closeRedate()">
      <h2 id="memory-redate-title">Redate {{ editingTitle() }}</h2>
      <p id="memory-redate-hint" class="muted">
        Saving changes the trip dates. The memory is read again from that trip.
      </p>
      <form (submit)="saveDates($event)">
        <ui-field label="Leave date" [required]="true">
          <input
            uiFieldControl
            type="date"
            name="start"
            data-dialog-initial-focus
            [value]="draftStart()"
            (input)="setField('start', $event)"
          />
        </ui-field>
        <ui-field label="Return date" [required]="true">
          <input
            uiFieldControl
            type="date"
            name="end"
            [value]="draftEnd()"
            (input)="setField('end', $event)"
          />
        </ui-field>
        <ui-field label="Private note" hint="This note stays in this session and is not saved on the trip.">
          <textarea
            uiFieldControl
            name="note"
            rows="3"
            [value]="draftNote()"
            (input)="setField('note', $event)"
          ></textarea>
        </ui-field>
        @if (formError()) {
          <p class="local-error" role="alert">{{ formError() }}</p>
        }
        <div class="button-row">
          <ui-button variant="primary" type="submit" [disabled]="saving()">
            {{ saving() ? "Saving dates…" : "Save dates" }}
          </ui-button>
          <ui-button variant="ghost" type="button" (click)="closeRedate()">Close</ui-button>
        </div>
      </form>
    </ui-dialog>
  </main>`,
})
export class MemoriesComponent {
  private readonly http = inject(HttpClient);
  private readonly destroy = inject(DestroyRef);
  private readonly injector = inject(Injector);
  private readonly confirm = inject(ConfirmService);
  private readonly session = inject(SESSION_CONTEXT);
  private readonly ownerId = this.session.currentUser?.id;
  private sessionActive = true;
  private loadEpoch = 0;
  private writeEpoch = 0;
  private loadSub?: Subscription;
  private openedStart = "";
  private openedEnd = "";
  private pendingFocus = "";
  readonly data = signal<MemoryList | null>(null);
  readonly error = signal("");
  readonly formError = signal("");
  readonly saving = signal(false);
  readonly editingId = signal<number | null>(null);
  readonly draftStart = signal("");
  readonly draftEnd = signal("");
  readonly draftNote = signal("");

  constructor() {
    merge(
      this.session.cleared$,
      this.session.user$.pipe(filter((user) => user?.id !== this.ownerId)),
    )
      .pipe(take(1), takeUntilDestroyed())
      .subscribe(() => this.retire());
    this.load();
  }

  private get ownsSession(): boolean {
    return this.sessionActive && !!this.ownerId && this.ownerId === this.session.currentUser?.id;
  }

  load(): void {
    if (!this.sessionActive) return;
    const epoch = ++this.loadEpoch;
    this.error.set("");
    this.loadSub = this.http
      .get<MemoryList>("/travel/api/memories", {
        params: { tz: this.zone() },
        context: silentErrorToast(),
      })
      .pipe(takeUntilDestroyed(this.destroy))
      .subscribe({
        next: (body) => {
          if (!acceptMemoryLoad({ epoch, currentEpoch: this.loadEpoch, sessionActive: this.sessionActive })) {
            return;
          }
          this.data.set(body);
          this.restoreFocus();
        },
        error: () => {
          if (!acceptMemoryLoad({ epoch, currentEpoch: this.loadEpoch, sessionActive: this.sessionActive })) {
            return;
          }
          this.error.set("Couldn't load trip memories.");
        },
      });
  }

  editingTitle(): string {
    const id = this.editingId();
    return this.data()?.memories.find((item) => item.trip_id === id)?.title ?? "this trip";
  }

  openRedate(memory: TripMemory): void {
    if (!this.ownsSession || this.saving()) return;
    this.formError.set("");
    this.openedStart = memory.span_start;
    this.openedEnd = memory.span_end;
    this.draftStart.set(memory.span_start);
    this.draftEnd.set(memory.span_end);
    this.draftNote.set("");
    this.editingId.set(memory.trip_id);
  }

  closeRedate(): void {
    if (!this.sessionActive || this.saving()) return;
    this.editingId.set(null);
    this.formError.set("");
    this.applyDraft(clearMemoryDraft());
  }

  setField(field: "start" | "end" | "note", event: Event): void {
    const target = event.target;
    const value =
      target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement ? target.value : "";
    if (field === "start") this.draftStart.set(value);
    else if (field === "end") this.draftEnd.set(value);
    else this.draftNote.set(value);
  }

  saveDates(event: Event): void {
    event.preventDefault();
    const tripId = this.editingId();
    if (!this.ownsSession || tripId == null || this.saving()) return;
    const epoch = ++this.writeEpoch;
    const sentStart = this.draftStart();
    const sentEnd = this.draftEnd();
    this.saving.set(true);
    this.formError.set("");
    this.http
      .patch(
        "/travel/api/trips/" + tripId,
        { start_date: sentStart, end_date: sentEnd },
        { context: silentErrorToast() },
      )
      .pipe(takeUntilDestroyed(this.destroy))
      .subscribe({
        next: () => {
          const decision = settleMemoryWrite({
            epoch,
            currentEpoch: this.writeEpoch,
            sessionActive: this.sessionActive,
            tripId,
            editingTripId: this.editingId(),
            start: this.draftStart(),
            end: this.draftEnd(),
            sentStart,
            sentEnd,
          });
          if (decision === "drop") {
            if (this.sessionActive && epoch === this.writeEpoch) this.saving.set(false);
            return;
          }
          this.saving.set(false);
          if (decision === "apply") {
            this.editingId.set(null);
            this.formError.set("");
            this.applyDraft(clearMemoryDraft());
            this.pendingFocus = "memory-" + tripId;
          }
          this.load();
        },
        error: (error: unknown) => {
          if (!this.sessionActive || epoch !== this.writeEpoch) return;
          this.saving.set(false);
          if (error instanceof HttpErrorResponse && error.status === 401) return;
          this.formError.set(travelError(error));
        },
      });
  }

  async cancelTrip(memory: TripMemory): Promise<void> {
    if (!this.ownsSession || this.saving()) return;
    const epoch = ++this.writeEpoch;
    const tripId = memory.trip_id;
    const ran = await this.confirm.confirmAction({
      title: "Cancel " + memory.title + "?",
      message: "This marks the trip planned. Town credit for it goes away. The saved dates stay.",
      confirmLabel: "Cancel trip",
      cancelLabel: "Keep status",
      busyLabel: "Canceling trip",
      errorMessage: "Couldn't cancel this trip. Nothing was changed. Try again.",
      run: () =>
        firstValueFrom(
          this.http.patch(
            "/travel/api/trips/" + tripId,
            { status: "planning" },
            { context: silentErrorToast() },
          ),
        ),
    });
    if (!ran || !this.sessionActive || epoch !== this.writeEpoch) return;
    this.pendingFocus = "memory-" + tripId;
    this.load();
  }

  async deleteTrip(memory: TripMemory): Promise<void> {
    if (!this.ownsSession || this.saving()) return;
    const epoch = ++this.writeEpoch;
    const tripId = memory.trip_id;
    const ran = await this.confirm.confirmAction({
      title: "Delete " + memory.title + "?",
      message: "This removes the trip and every memory read from it.",
      confirmLabel: "Delete trip",
      cancelLabel: "Keep trip",
      busyLabel: "Deleting trip",
      phrase: memory.title,
      errorMessage: "Couldn't delete this trip. Nothing was deleted. Try again.",
      run: () =>
        firstValueFrom(
          this.http.delete("/travel/api/trips/" + tripId, { context: silentErrorToast() }),
        ),
    });
    if (!ran || !this.sessionActive || epoch !== this.writeEpoch) return;
    if (this.editingId() === tripId) this.closeRedate();
    this.pendingFocus = "trip-memories";
    this.load();
  }

  canLeave(): boolean | Promise<boolean> {
    if (!this.sessionActive || !this.dirty()) return true;
    return this.confirm.ask(
      "Leave this editor?",
      "Your unsaved changes will be discarded.",
      "Leave editor",
      "Keep editing",
    );
  }

  @HostListener("window:beforeunload", ["$event"])
  unload(event: BeforeUnloadEvent): void {
    if (this.sessionActive && this.dirty()) {
      event.preventDefault();
      event.returnValue = "";
    }
  }

  private dirty(): boolean {
    if (!this.sessionActive || this.editingId() == null) return false;
    return (
      this.draftNote().trim() !== "" ||
      this.draftStart() !== this.openedStart ||
      this.draftEnd() !== this.openedEnd
    );
  }

  private zone(): string {
    const named = typeof Intl === "undefined" ? "" : Intl.DateTimeFormat().resolvedOptions().timeZone;
    return browserZone(named);
  }

  private applyDraft(draft: { start: string; end: string; note: string }): void {
    this.draftStart.set(draft.start);
    this.draftEnd.set(draft.end);
    this.draftNote.set(draft.note);
  }

  private restoreFocus(): void {
    const id = this.pendingFocus;
    if (!id || !this.sessionActive) return;
    this.pendingFocus = "";
    afterNextRender(
      () => {
        if (!this.sessionActive) return;
        document.getElementById(id)?.focus();
      },
      { injector: this.injector },
    );
  }

  private retire(): void {
    this.sessionActive = false;
    this.loadEpoch += 1;
    this.writeEpoch += 1;
    this.loadSub?.unsubscribe();
    this.editingId.set(null);
    this.saving.set(false);
    this.error.set("");
    this.formError.set("");
    this.data.set(null);
    this.applyDraft(clearMemoryDraft());
  }
}
