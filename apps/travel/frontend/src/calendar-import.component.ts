import { HttpClient } from "@angular/common/http";
import {
  Component,
  DestroyRef,
  ElementRef,
  ViewChild,
  afterNextRender,
  inject,
  input,
  output,
  signal,
} from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { Router } from "@angular/router";
import { Subscription, filter, merge, take, timeout } from "rxjs";
import {
  SESSION_CONTEXT,
  UiButtonComponent,
  UiCardComponent,
  UiFieldComponent,
  UiFieldControlDirective,
} from "@vivek/ui";
import {
  calendarSectionDirty,
  canSaveBooking,
  clearCalendarImport,
  draftFromBooking,
  existingNotice,
  legFromBooking,
  normalizePreview,
  previewApplies,
  savedBookingNotice,
  settleImport,
  type CalendarPreview,
  type ExistingCalendarLeg,
} from "./calendar-booking.mjs";
import { existingTrips } from "./flight-start.mjs";
import { travelError, type Home } from "./travel.models";

export interface CalendarImportMemory {
  fileName: string;
  text: string;
  settledText: string;
  attemptKey: string;
  attemptBody: string;
  reading: boolean;
  preview: CalendarPreview | null;
  notice: string;
  problem: string;
  existingOpen: boolean;
  trips: { id: number; title: string; start: string; end: string }[];
  tripsError: string;
  chosenTrip: number | null;
  dirty: boolean;
}

@Component({
  selector: "travel-calendar-import",
  standalone: true,
  imports: [UiButtonComponent, UiCardComponent, UiFieldComponent, UiFieldControlDirective],
  template: `<ui-card
    ><section
      class="calendar-import"
      [attr.aria-labelledby]="showIntro() ? 'calendar-import-title' : null"
      [attr.aria-label]="showIntro() ? null : 'Calendar file'"
    >
      @if (showIntro()) {
        <h2 id="calendar-import-title">Import a calendar booking</h2>
        <p class="muted">
          Choose one flight calendar file. Travel shows the time zone and the leg
          before it writes. A return date and PTO stay untouched.
        </p>
      }
      <ui-field
        label="Calendar booking"
        hint="One .ics flight booking. Nothing is saved until you confirm."
      >
        <input
          uiFieldControl
          #bookingFile
          type="file"
          accept=".ics,text/calendar"
          name="calendarBooking"
          [disabled]="busy()"
          (change)="onFile($event)"
        />
      </ui-field>
      @if (fileName) {
        <p>File: {{ fileName }}</p>
      }
      @if (reading()) {
        <p role="status">Reading the calendar…</p>
      }
      @if (rejection()) {
        <ui-card class="calendar-preview">
          <h3>Calendar not imported</h3>
          <p class="local-error" role="status">{{ rejection() }}</p>
        </ui-card>
      }
      @if (booking(); as flight) {
        <ui-card class="calendar-preview">
          <h3>Proposed booking</h3>
          <p>{{ flight.number }} · {{ flight.origin }} → {{ flight.destination }}</p>
          <p>Booking {{ flight.uid }}</p>
          <p>Scheduled departure: {{ flight.depart_label }}</p>
          <p>Scheduled arrival: {{ flight.arrive_label }}</p>
          @if (match(); as existing) {
            <p #existingStatus tabindex="-1" role="status">{{ existingText(existing) }}</p>
          } @else {
            <p>Proposed. Not saved yet.</p>
          }
        </ui-card>
      }
      @if (notice()) {
        <p role="status">{{ notice() }}</p>
      }
      @if (problem()) {
        <p class="local-error" role="alert">{{ problem() }}</p>
      }
      <div class="button-row">
        @if (canSave()) {
          <ui-button
            variant="primary"
            type="button"
            [disabled]="busy() || saving()"
            (clicked)="saveDraft()"
          >
            {{ saving() ? "Saving draft…" : "Save this booking as a draft" }}
          </ui-button>
          <ui-button
            variant="secondary"
            type="button"
            [disabled]="busy() || saving()"
            [ariaExpanded]="existingOpen()"
            ariaControls="calendar-existing-trips"
            (clicked)="showExisting()"
          >
            Add booking to an existing trip
          </ui-button>
        }
        @if (match()) {
          <ui-button
            variant="primary"
            type="button"
            [disabled]="busy() || saving()"
            (clicked)="useExisting()"
          >
            Use the existing leg
          </ui-button>
        }
        @if (fileName) {
          <ui-button
            variant="ghost"
            type="button"
            [disabled]="busy() || saving()"
            (clicked)="returnToFile()"
          >
            Choose a different booking
          </ui-button>
        }
      </div>
      @if (existingOpen() && canSave()) {
        <div id="calendar-existing-trips">
          <h3>Existing trips</h3>
          @if (tripsLoading()) {
            <p role="status">Loading trips…</p>
          }
          @if (tripsError()) {
            <p class="local-error" role="alert">{{ tripsError() }}</p>
            <ui-button variant="ghost" type="button" (clicked)="loadTrips()">Retry trips</ui-button>
          }
          @if (!tripsLoading() && !tripsError() && !trips().length) {
            <p>No saved trips yet. Save this booking as a draft.</p>
          }
          @for (trip of trips(); track trip.id) {
            <ui-button
              variant="secondary"
              type="button"
              [pressed]="chosenTrip() === trip.id"
              (clicked)="chooseTrip(trip.id)"
            >
              {{ trip.title }} · {{ trip.start }} to {{ trip.end }}
            </ui-button>
          }
          <ui-button
            variant="primary"
            type="button"
            [disabled]="busy() || saving() || chosenTrip() === null"
            (clicked)="addToTrip()"
          >
            Add booking to this trip
          </ui-button>
        </div>
      }
    </section></ui-card
  >`,
})
export class CalendarImportComponent {
  readonly busy = input(false);
  /** The new-trip choice already states this instruction. */
  readonly showIntro = input(true);
  /** Restored once when this form is shown again. Null on a fresh choice. */
  readonly memory = input<CalendarImportMemory | null>(null);
  readonly leaving = output<void>();
  private readonly session = inject(SESSION_CONTEXT);
  private readonly ownerId = this.session.currentUser?.id;
  private sessionActive = true;
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly destroy = inject(DestroyRef);
  private pending?: Subscription;
  private saveRequest?: Subscription;
  private listRequest?: Subscription;
  private epoch = 0;
  private listEpoch = 0;
  private attemptKey = "";
  private attemptBody = "";
  fileName = "";
  private text = "";
  private settledText = "";
  readonly reading = signal(false);
  readonly saving = signal(false);
  readonly preview = signal<CalendarPreview | null>(null);
  readonly notice = signal("");
  readonly problem = signal("");
  readonly existingOpen = signal(false);
  readonly trips = signal<{ id: number; title: string; start: string; end: string }[]>([]);
  readonly tripsLoading = signal(false);
  readonly tripsError = signal("");
  readonly chosenTrip = signal<number | null>(null);
  readonly existingText = existingNotice;
  @ViewChild("bookingFile") private fileInput?: ElementRef<HTMLInputElement>;
  @ViewChild("existingStatus") private existingStatus?: ElementRef<HTMLElement>;

  constructor() {
    afterNextRender(() => {
      const memory = this.memory();
      if (memory) this.restore(memory);
    });
    merge(
      this.session.cleared$,
      this.session.user$.pipe(filter((user) => user?.id !== this.ownerId)),
    )
      .pipe(take(1), takeUntilDestroyed())
      .subscribe(() => this.clear());
    this.destroy.onDestroy(() => {
      this.pending?.unsubscribe();
      this.saveRequest?.unsubscribe();
      this.listRequest?.unsubscribe();
    });
  }

  unfinished(): boolean {
    return calendarSectionDirty({ text: this.text, settledText: this.settledText });
  }

  capture(): CalendarImportMemory {
    return {
      fileName: this.fileName,
      text: this.text,
      settledText: this.settledText,
      attemptKey: this.attemptKey,
      attemptBody: this.attemptBody,
      reading: this.reading(),
      preview: this.preview(),
      notice: this.notice(),
      problem: this.problem(),
      existingOpen: this.existingOpen(),
      trips: this.trips().map((trip) => ({ ...trip })),
      tripsError: this.tripsError(),
      chosenTrip: this.chosenTrip(),
      dirty: this.unfinished(),
    };
  }

  restore(memory: CalendarImportMemory): void {
    this.fileName = memory.fileName;
    this.text = memory.text;
    this.settledText = memory.settledText;
    this.attemptKey = memory.attemptKey;
    this.attemptBody = memory.attemptBody;
    this.preview.set(memory.preview);
    this.notice.set(memory.notice);
    this.problem.set(memory.problem);
    this.existingOpen.set(memory.existingOpen);
    this.trips.set(memory.trips.map((trip) => ({ ...trip })));
    this.tripsError.set(memory.tripsError);
    this.chosenTrip.set(memory.chosenTrip);
    this.reading.set(false);
    this.saving.set(false);
    if (memory.reading && memory.text && !memory.preview) this.readText(memory.text, this.epoch);
  }

  booking() {
    const card = this.preview();
    return card?.ok ? card.booking : null;
  }

  match(): ExistingCalendarLeg | null {
    const card = this.preview();
    return card?.ok ? card.existing : null;
  }

  rejection(): string {
    const card = this.preview();
    if (!card || card.ok) return "";
    return card.reason;
  }

  canSave(): boolean {
    return canSaveBooking(this.preview());
  }

  clear(): void {
    this.sessionActive = false;
    this.epoch += 1;
    this.listEpoch += 1;
    this.pending?.unsubscribe();
    this.saveRequest?.unsubscribe();
    this.listRequest?.unsubscribe();
    const cleared = clearCalendarImport();
    this.fileName = cleared.fileName;
    this.text = cleared.text;
    this.settledText = cleared.settledText;
    this.attemptKey = "";
    this.attemptBody = "";
    this.reading.set(false);
    this.saving.set(false);
    this.preview.set(null);
    this.notice.set(cleared.notice);
    this.problem.set(cleared.error);
    this.existingOpen.set(false);
    this.trips.set([]);
    this.tripsLoading.set(false);
    this.tripsError.set("");
    this.chosenTrip.set(null);
    if (this.fileInput) this.fileInput.nativeElement.value = "";
  }

  onFile(event: Event): void {
    const input = event.target;
    if (!(input instanceof HTMLInputElement)) return;
    const file = input.files && input.files.length ? input.files[0] : null;
    this.epoch += 1;
    this.pending?.unsubscribe();
    this.saving.set(false);
    this.notice.set("");
    this.problem.set("");
    this.existingOpen.set(false);
    this.chosenTrip.set(null);
    if (!file) {
      this.fileName = "";
      this.text = "";
      this.settledText = "";
      this.preview.set(null);
      this.reading.set(false);
      return;
    }
    const epoch = this.epoch;
    this.fileName = file.name;
    this.reading.set(true);
    this.preview.set(null);
    void file.text().then(
      (value) => this.readText(value, epoch),
      () => this.readText("", epoch),
    );
  }

  returnToFile(): void {
    setTimeout(() => {
      if (!this.destroy.destroyed) this.fileInput?.nativeElement.focus();
    });
  }

  saveDraft(): void {
    const card = this.preview();
    const flight = card?.booking;
    if (!canSaveBooking(card) || !flight || this.saving() || this.busy() || !this.sessionActive) return;
    const built = draftFromBooking(flight);
    if (!built.ok) {
      this.problem.set(built.helper);
      return;
    }
    const encoded = JSON.stringify(built.body);
    if (encoded !== this.attemptBody) {
      this.attemptKey = crypto.randomUUID();
      this.attemptBody = encoded;
    }
    const epoch = this.epoch;
    this.saving.set(true);
    this.problem.set("");
    this.saveRequest?.unsubscribe();
    this.saveRequest = this.http
      .post<{ id: number }>("/travel/api/trip-drafts", {
        ...built.body,
        client_request_id: this.attemptKey,
      })
      .pipe(timeout(20000))
      .subscribe({
        next: () => this.finishSave(epoch, flight.uid, true, "", true),
        error: (error) => this.finishSave(epoch, flight.uid, false, travelError(error), true),
      });
  }

  showExisting(): void {
    const open = !this.existingOpen();
    this.existingOpen.set(open);
    if (open) this.loadTrips();
  }

  chooseTrip(id: number): void {
    this.chosenTrip.set(id);
  }

  addToTrip(): void {
    const tripId = this.chosenTrip();
    const flight = this.booking();
    if (tripId == null || !flight || !this.canSave() || this.saving() || this.busy() || !this.sessionActive) {
      return;
    }
    const epoch = this.epoch;
    this.saving.set(true);
    this.problem.set("");
    this.saveRequest?.unsubscribe();
    this.saveRequest = this.http
      .post<{ id: number }>(`/travel/api/trips/${tripId}/transports`, legFromBooking(flight))
      .pipe(timeout(20000))
      .subscribe({
        next: (trip) => {
          if (!this.finishSave(epoch, flight.uid, true, "", false)) return;
          this.leaving.emit();
          void this.router.navigate(["/travel/trips", trip.id]);
        },
        error: (error) => this.finishSave(epoch, flight.uid, false, travelError(error), false),
      });
  }

  loadTrips(): void {
    if (!this.sessionActive) return;
    const epoch = ++this.listEpoch;
    this.listRequest?.unsubscribe();
    this.tripsLoading.set(true);
    this.tripsError.set("");
    this.listRequest = this.http
      .get<Home>("/travel/api/home")
      .pipe(takeUntilDestroyed(this.destroy))
      .subscribe({
        next: (home) => {
          if (!this.sessionActive || epoch !== this.listEpoch) return;
          this.trips.set(existingTrips(home));
          this.tripsLoading.set(false);
        },
        error: (error) => {
          if (!this.sessionActive || epoch !== this.listEpoch) return;
          this.tripsLoading.set(false);
          this.tripsError.set(travelError(error));
        },
      });
  }

  useExisting(): void {
    const existing = this.match();
    if (!existing || !this.sessionActive || this.saving() || this.busy()) return;
    this.settledText = this.text;
    this.notice.set(existingNotice(existing));
    if (existing.kind === "trip") {
      this.leaving.emit();
      void this.router.navigate(["/travel/trips", existing.id]);
      return;
    }
    setTimeout(() => {
      if (!this.destroy.destroyed) this.existingStatus?.nativeElement.focus();
    });
  }

  private readText(value: string, epoch: number): void {
    if (!previewApplies({
      epoch,
      currentEpoch: this.epoch,
      sessionActive: this.sessionActive,
      submittedText: value,
      currentText: value,
    })) {
      return;
    }
    this.text = value;
    this.settledText = "";
    this.pending?.unsubscribe();
    this.reading.set(true);
    this.pending = this.http
      .post<CalendarPreview>("/travel/api/calendar-bookings/preview", { text: value })
      .pipe(timeout(20000))
      .subscribe({
        next: (body) => {
          if (!this.previewCurrent(epoch, value)) return;
          this.reading.set(false);
          const next = normalizePreview(body);
          this.preview.set(next);
          if (!next.ok) this.returnToFile();
        },
        error: (error) => {
          if (!this.previewCurrent(epoch, value)) return;
          this.reading.set(false);
          this.preview.set({
            ok: false,
            code: "malformed",
            reason: travelError(error),
            booking: null,
            existing: null,
          });
          this.returnToFile();
        },
      });
  }

  private previewCurrent(epoch: number, submitted: string): boolean {
    return previewApplies({
      epoch,
      currentEpoch: this.epoch,
      sessionActive: this.sessionActive,
      submittedText: submitted,
      currentText: this.text,
    });
  }

  private finishSave(
    epoch: number,
    uid: string,
    ok: boolean,
    message: string,
    announce: boolean,
  ): boolean {
    const decision = settleImport({
      epoch,
      currentEpoch: this.epoch,
      sessionActive: this.sessionActive,
      ok,
      submittedUid: uid,
      currentUid: this.booking()?.uid || "",
    });
    if (!decision.apply && !decision.failed) return false;
    this.saving.set(false);
    if (!decision.apply) {
      this.problem.set(message);
      return false;
    }
    this.settledText = this.text;
    this.notice.set(announce ? savedBookingNotice() : "");
    this.problem.set("");
    return true;
  }
}
