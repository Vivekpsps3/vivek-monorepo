import {
  Component,
  DestroyRef,
  ElementRef,
  HostListener,
  Injector,
  ViewChild,
  afterNextRender,
  inject,
  signal,
} from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { ActivatedRoute, Router } from "@angular/router";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { Subscription, filter, merge, take } from "rxjs";
import { formatDay } from "@vivek/browser";
import {
  ConfirmService,
  ReturnContext,
  SESSION_CONTEXT,
  UiPageHeaderComponent,
} from "@vivek/ui";
import { FlightStartComponent } from "./flight-start.component";
import { HarborRoomsComponent } from "./harbor-rooms.component";
import { readRoomQuery } from "./harbor-rooms.mjs";
import { settleAttach, type AcceptedFlight } from "./flight-start.mjs";
import {
  acceptHallLoad,
  clearHallDesk,
  dayActionLabel,
  departureRows,
  hallIsEmpty,
  hallReturnPath,
  itineraryRows,
  legActionLabel,
  legTarget,
  matchingDay,
  matchingLeg,
  readHallQuery,
  type HallDay,
  type HallLeg,
} from "./terminal-hall.mjs";
import { Home, Trip, travelError } from "./travel.models";

@Component({
  selector: "travel-terminal-hall",
  standalone: true,
  imports: [FlightStartComponent, HarborRoomsComponent, UiPageHeaderComponent],
  styleUrl: "./terminal-hall.component.css",
  templateUrl: "./terminal-hall.component.html",
})
export class TerminalHallComponent {
  readonly formatDay = formatDay;
  readonly legActionLabel = legActionLabel;
  readonly dayActionLabel = dayActionLabel;
  readonly hallIsEmpty = hallIsEmpty;
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroy = inject(DestroyRef);
  private readonly injector = inject(Injector);
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly confirm = inject(ConfirmService);
  private readonly returns = inject(ReturnContext);
  private readonly session = inject(SESSION_CONTEXT);
  private readonly ownerId = this.session.currentUser?.id;
  private sessionActive = true;
  private handingOff = false;
  private homeEpoch = 0;
  private actionEpoch = 0;
  private welcomed = false;
  private homeRequest?: Subscription;
  private actionRequest?: Subscription;
  @ViewChild(FlightStartComponent) private flightStart?: FlightStartComponent;
  readonly home = signal<Home | null>(null);
  readonly error = signal("");
  readonly actionError = signal("");
  readonly pending = signal(false);
  readonly closed = signal(false);
  readonly selection = signal(readHallQuery(this.route.snapshot.queryParamMap));
  readonly room = signal(readRoomQuery(this.route.snapshot.queryParamMap).room);

  constructor() {
    merge(
      this.session.cleared$,
      this.session.user$.pipe(filter((user) => user?.id !== this.ownerId)),
    )
      .pipe(take(1), takeUntilDestroyed())
      .subscribe(() => this.retire());
    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      this.selection.set(readHallQuery(params));
      this.room.set(readRoomQuery(params).room);
    });
    this.load();
  }

  private get ownsSession(): boolean {
    return this.sessionActive && !!this.ownerId && this.ownerId === this.session.currentUser?.id;
  }

  departures(): HallLeg[] {
    return departureRows(this.home());
  }

  days(): HallDay[] {
    return itineraryRows(this.home());
  }

  chosenLeg(): HallLeg | null {
    return matchingLeg(this.departures(), this.selection());
  }

  chosenDay(): HallDay | null {
    return matchingDay(this.days(), this.selection());
  }

  load(): void {
    if (!this.sessionActive) return;
    const epoch = ++this.homeEpoch;
    this.error.set("");
    this.homeRequest?.unsubscribe();
    this.homeRequest = this.http
      .get<Home>("/travel/api/home")
      .pipe(takeUntilDestroyed(this.destroy))
      .subscribe({
        next: (home) => {
          if (!acceptHallLoad({ epoch, currentEpoch: this.homeEpoch, sessionActive: this.sessionActive })) return;
          this.home.set(home);
          this.focusAfterLoad();
        },
        error: (error) => {
          if (!acceptHallLoad({ epoch, currentEpoch: this.homeEpoch, sessionActive: this.sessionActive })) return;
          this.home.set(null);
          this.error.set(travelError(error));
          this.focusAfterLoad();
        },
      });
  }

  focusObject(object: "board" | "desk" | "table"): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { object, room: null, card: null, place: null },
      queryParamsHandling: "merge",
      replaceUrl: true,
    });
    if (object === "desk") {
      this.flightField()?.focus();
      return;
    }
    document.getElementById(object === "board" ? "terminal-board" : "terminal-table")?.focus();
  }

  async openLeg(row: HallLeg): Promise<void> {
    const target = legTarget(row);
    if (!target) return;
    const path = hallReturnPath({
      object: "board",
      trip: target.tripId,
      leg: target.transportId,
      day: target.day,
    });
    await this.router.navigate(["/travel/terminal"], {
      queryParams: {
        object: "board",
        trip: target.tripId,
        leg: target.transportId,
        day: target.day || null,
      },
      replaceUrl: true,
    });
    this.returns.saveView("/travel/terminal", String(target.transportId));
    await this.router.navigate(["/travel/trips", target.tripId], {
      queryParams: { day: target.day || null, transport: target.transportId },
      state: this.returns.link(path),
    });
  }

  async openDay(row: HallDay): Promise<void> {
    const path = hallReturnPath({ object: "table", trip: row.tripId, day: row.day });
    await this.router.navigate(["/travel/terminal"], {
      queryParams: { object: "table", trip: row.tripId, leg: null, day: row.day },
      replaceUrl: true,
    });
    this.returns.saveView("/travel/terminal", row.day);
    await this.router.navigate(["/travel/trips", row.tripId], {
      queryParams: { day: row.day },
      state: this.returns.link(path),
    });
  }

  planNew(flight: AcceptedFlight): void {
    if (!flight?.ok || flight.end !== "") return;
    this.handingOff = true;
    void this.router.navigate(["/travel/trips/new"], { state: { terminalFlight: flight } });
  }

  addLeg(event: { tripId: number; leg: Record<string, unknown>; number: string }): void {
    if (this.pending() || !this.sessionActive) return;
    const epoch = ++this.actionEpoch;
    const submittedNumber = event.number;
    this.pending.set(true);
    this.actionError.set("");
    this.actionRequest?.unsubscribe();
    this.actionRequest = this.http
      .post<Trip>(`/travel/api/trips/${event.tripId}/transports`, event.leg)
      .pipe(takeUntilDestroyed(this.destroy))
      .subscribe({
        next: (trip) => {
          this.pending.set(false);
          const decision = settleAttach({
            epoch,
            currentEpoch: this.actionEpoch,
            sessionActive: this.sessionActive,
            ok: true,
            submittedNumber,
            currentNumber: this.flightStart?.currentNumber() || submittedNumber,
          });
          if (!decision.apply || !trip?.id) return;
          this.handingOff = true;
          void this.router.navigate(["/travel/trips", trip.id]);
        },
        error: (error) => {
          this.pending.set(false);
          const decision = settleAttach({
            epoch,
            currentEpoch: this.actionEpoch,
            sessionActive: this.sessionActive,
            ok: false,
            submittedNumber,
            currentNumber: this.flightStart?.currentNumber() || submittedNumber,
          });
          if (!decision.failed) return;
          this.actionError.set(travelError(error));
        },
      });
  }

  canLeave(): boolean | Promise<boolean> {
    if (this.handingOff || !this.ownsSession || !this.flightStart?.unfinished()) return true;
    return this.confirm.ask(
      "Leave this flight?",
      "This flight has not been added to a trip.",
      "Leave flight",
      "Keep planning",
    );
  }

  @HostListener("window:beforeunload", ["$event"])
  unload(event: BeforeUnloadEvent): void {
    if (this.ownsSession && !this.handingOff && this.flightStart?.unfinished()) {
      event.preventDefault();
      event.returnValue = "";
    }
  }

  openRoom(room: "map" | "gallery"): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { room, object: null, leg: null, day: null },
      queryParamsHandling: "merge",
      replaceUrl: true,
    });
  }

  closeRoom(): void {
    const room = this.room();
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { room: null, card: null, place: null },
      queryParamsHandling: "merge",
      replaceUrl: true,
    }).then(() => {
      afterNextRender(() => {
        if (this.destroy.destroyed) return;
        const id = room === "gallery" ? "terminal-souvenir-gallery" : "terminal-map-room";
        document.getElementById(id)?.focus();
      }, { injector: this.injector });
    });
  }

  whenText(row: HallLeg): string {
    return row.departAt ? row.departAt.replace("T", " ") : "Time not set";
  }

  private flightField(): HTMLElement | null {
    const field = this.host.nativeElement.querySelector('input[name="flightIdent"]');
    return field instanceof HTMLElement ? field : null;
  }

  private retire(): void {
    this.sessionActive = false;
    this.homeEpoch += 1;
    this.actionEpoch += 1;
    this.homeRequest?.unsubscribe();
    this.actionRequest?.unsubscribe();
    const cleared = clearHallDesk();
    this.home.set(cleared.home);
    this.actionError.set(cleared.actionError);
    this.error.set("");
    this.pending.set(false);
    this.closed.set(true);
    this.flightStart?.clear();
  }

  private focusAfterLoad(): void {
    const query = this.selection();
    const rowId =
      query.object === "board" && query.leg
        ? "terminal-leg-" + query.leg
        : query.object === "table" && query.trip && query.day
          ? "terminal-day-" + query.trip + "-" + query.day
          : "";
    if (this.room()) return;
    const empty = !this.error() && hallIsEmpty(this.home());
    const failed = Boolean(this.error());
    afterNextRender(() => {
      if (this.destroy.destroyed || !this.sessionActive) return;
      if (rowId) {
        document.getElementById(rowId)?.focus();
        return;
      }
      if (failed) {
        document.getElementById("terminal-retry")?.focus();
        return;
      }
      if (empty && !this.welcomed) {
        this.welcomed = true;
        this.flightField()?.focus();
      }
    }, { injector: this.injector });
  }
}
