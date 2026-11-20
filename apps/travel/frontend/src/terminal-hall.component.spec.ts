import { provideHttpClient } from "@angular/common/http";
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing";
import { TestBed } from "@angular/core/testing";
import { By } from "@angular/platform-browser";
import { provideRouter, Router } from "@angular/router";
import { SESSION_CONTEXT } from "@vivek/ui";
import { BehaviorSubject, Subject } from "rxjs";
import { FlightStartComponent } from "./flight-start.component";
import { TerminalHallComponent } from "./terminal-hall.component";
import type { AcceptedFlight } from "./flight-start.mjs";

function harborHome() {
  return {
    in_progress: [],
    upcoming: [
      {
        id: 4,
        title: "Harbor week",
        start_date: "2026-12-12",
        end_date: "2026-12-14",
        transports: [
          {
            id: 9,
            role: "outbound",
            mode: "flight",
            number: "UA100",
            depart_place: "SFO",
            arrive_place: "HND",
            depart_at: "2026-12-12T09:00",
            arrive_at: "2026-12-12T11:40",
          },
          {
            id: 10,
            role: "inbound",
            mode: "flight",
            number: "UA200",
            depart_place: "HND",
            arrive_place: "SFO",
            depart_at: "2026-12-14T18:10",
            arrive_at: "2026-12-14T11:20",
          },
        ],
        days: [
          { on_date: "2026-12-12", city: "Harbor" },
          { on_date: "2026-12-13", city: "Harbor" },
          { on_date: "2026-12-14", city: "Harbor" },
        ],
      },
    ],
    past: [],
  };
}

function liveSession(id: number | null = 1) {
  const users = new BehaviorSubject<{ id: number } | null>(id == null ? null : { id });
  const cleared$ = new Subject<void>();
  const port = {
    cleared$,
    user$: users.asObservable(),
    get currentUser() {
      return users.value;
    },
  };
  return { users, cleared$, port };
}

describe("TerminalHallComponent", () => {
  let httpMock: HttpTestingController;

  function mount(session = liveSession()) {
    TestBed.configureTestingModule({
      imports: [TerminalHallComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: SESSION_CONTEXT, useValue: session.port },
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(TerminalHallComponent);
    const router = TestBed.inject(Router);
    spyOn(router, "navigate").and.resolveTo(true);
    return { fixture, component: fixture.componentInstance, router, session };
  }

  function desk(fixture: ReturnType<typeof TestBed.createComponent<TerminalHallComponent>>) {
    return fixture.debugElement.query(By.directive(FlightStartComponent))
      .componentInstance as FlightStartComponent;
  }

  afterEach(() => httpMock?.verify());

  it("starts an empty hall on the flight desk and keeps manual entry", () => {
    const { fixture } = mount();
    httpMock.expectOne("/travel/api/home").flush({ in_progress: [], upcoming: [], past: [] });
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain("No saved departures");
    expect(text).toContain("type the times manually");
    expect(text).toContain("No trip days yet");
    expect(text).toContain("Edit times manually");
    expect(fixture.nativeElement.querySelector('input[name="flightIdent"]')).not.toBeNull();
    expect(text).not.toContain("Departures are unavailable");
  });

  it("says departures are unavailable when home fails and keeps the typed flight", () => {
    const { fixture } = mount();
    fixture.detectChanges();
    const flight = desk(fixture);
    flight.onIdent("UA 404");
    httpMock.expectOne("/travel/api/home").flush("down", { status: 500, statusText: "Error" });
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain("Departures are unavailable");
    expect(text).toContain("Trip days are unavailable");
    expect(text).toContain("Retry departures");
    expect(text).not.toContain("No saved departures");
    expect(flight.ident).toBe("UA 404");
    expect(text).toContain("Edit times manually");
  });

  it("lists the saved departure, return, and local day from the home payload", () => {
    const { fixture } = mount();
    httpMock.expectOne("/travel/api/home").flush(harborHome());
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain("Open departure");
    expect(text).toContain("Open return");
    expect(text).toContain("UA100");
    expect(text).toContain("UA200");
    expect(text).toContain("Harbor week");
    expect(fixture.nativeElement.querySelector("#terminal-leg-9")).not.toBeNull();
    expect(fixture.nativeElement.querySelector("#terminal-leg-10")).not.toBeNull();
    expect(fixture.nativeElement.querySelector("#terminal-day-4-2026-12-13")).not.toBeNull();
    expect(text).toContain("Edit times manually");
    expect(text).not.toContain("No saved departures");
  });

  it("drops a cancelled home response when the owner changes", () => {
    const session = liveSession(1);
    const { fixture, component } = mount(session);
    const first = httpMock.expectOne("/travel/api/home");
    session.users.next({ id: 2 });
    fixture.detectChanges();
    expect(first.cancelled).toBe(true);
    expect(fixture.nativeElement.textContent).toContain("Sign in to see this terminal.");
    expect(fixture.nativeElement.textContent).not.toContain("Harbor week");
    expect(fixture.nativeElement.querySelector('input[name="flightIdent"]')).toBeNull();
    component.load();
    httpMock.expectNone("/travel/api/home");
  });

  it("clears a private flight draft when the session ends and ignores the late home", () => {
    const session = liveSession(1);
    const { fixture } = mount(session);
    fixture.detectChanges();
    const flight = desk(fixture);
    flight.onIdent("UA 404");
    const pending = httpMock.expectOne("/travel/api/home");
    session.cleared$.next();
    fixture.detectChanges();
    expect(pending.cancelled).toBe(true);
    expect(fixture.nativeElement.textContent).toContain("Sign in to see this terminal.");
    expect(fixture.nativeElement.textContent).not.toContain("UA 404");
    expect(fixture.nativeElement.querySelector('input[name="flightIdent"]')).toBeNull();
  });

  it("hands a flight with an empty return to the new-trip page and refuses a filled return", () => {
    const { fixture, component, router } = mount();
    httpMock.expectOne("/travel/api/home").flush({ in_progress: [], upcoming: [], past: [] });
    fixture.detectChanges();
    const flight: AcceptedFlight = {
      ok: true,
      helper: "",
      leg: { number: "UA837", depart_place: "SFO", arrive_place: "NRT" },
      start: "2026-11-02",
      end: "",
      proposal: { field: "destination_city", value: "NRT", source: "inferred" },
      number: "UA837",
    };
    component.planNew(flight);
    expect(router.navigate).toHaveBeenCalledWith(["/travel/trips/new"], {
      state: { terminalFlight: flight },
    });
    (router.navigate as jasmine.Spy).calls.reset();
    component.planNew({ ...flight, end: "2026-11-09" } as unknown as AcceptedFlight);
    expect(router.navigate).not.toHaveBeenCalled();
    expect(component.canLeave()).toBe(true);
  });

  it("does not open a trip when the flight number changed before the leg save returned", () => {
    const { fixture, component, router } = mount();
    httpMock.expectOne("/travel/api/home").flush(harborHome());
    fixture.detectChanges();
    const flight = desk(fixture);
    flight.onIdent("UA100");
    component.addLeg({ tripId: 4, leg: { number: "UA100" }, number: "UA100" });
    flight.onIdent("UA200");
    const posted = httpMock.expectOne("/travel/api/trips/4/transports");
    posted.flush({ id: 4, title: "Harbor week" });
    expect(router.navigate).not.toHaveBeenCalled();
    expect(component.actionError()).toBe("");
    expect(flight.ident).toBe("UA200");
  });

  it("keeps the typed flight when adding a leg fails", () => {
    const { fixture, component, router } = mount();
    httpMock.expectOne("/travel/api/home").flush({ in_progress: [], upcoming: [], past: [] });
    fixture.detectChanges();
    const flight = desk(fixture);
    flight.onIdent("UA 404");
    component.addLeg({ tripId: 4, leg: { number: "UA404" }, number: "UA404" });
    httpMock.expectOne("/travel/api/trips/4/transports").flush(
      {},
      { status: 502, statusText: "Bad Gateway" },
    );
    fixture.detectChanges();
    expect(component.actionError()).toContain("This could not finish. Your draft is still here. Try again.");
    expect(flight.ident).toBe("UA 404");
    expect(router.navigate).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain("Edit times manually");
  });

  it("opens the saved trip after the same flight number is accepted", () => {
    const { fixture, component, router } = mount();
    httpMock.expectOne("/travel/api/home").flush(harborHome());
    fixture.detectChanges();
    const flight = desk(fixture);
    flight.onIdent("UA100");
    component.addLeg({ tripId: 4, leg: { number: "UA100" }, number: "UA100" });
    httpMock.expectOne("/travel/api/trips/4/transports").flush({ id: 4, title: "Harbor week" });
    expect(router.navigate).toHaveBeenCalledWith(["/travel/trips", 4]);
  });
});
