import { provideHttpClient } from "@angular/common/http";
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing";
import { TestBed } from "@angular/core/testing";
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from "@angular/router";
import { SESSION_CONTEXT } from "@vivek/ui";
import { BehaviorSubject, Subject } from "rxjs";
import { HarborRoomsComponent } from "./harbor-rooms.component";

function paperHome() {
  return {
    in_progress: [],
    upcoming: [
      {
        id: 4,
        title: "Paper coast",
        status: "planning",
        start_date: "2026-12-01",
        end_date: "2026-12-03",
        counts_as_pto: false,
        pto: {
          counts: false,
          days: "0",
          note: "This trip is not counted as PTO. Day choices are kept.",
        },
        pto_dates: [
          { on_date: "2026-12-01", amount: "1" },
          { on_date: "2026-12-02", amount: "1" },
        ],
        stays: [{ city: "Paper Harbor", lat: 1, lng: 2 }],
        days: [{ on_date: "2026-12-01", city: "Paper Harbor" }],
        transports: [{ id: 8, mode: "ferry", role: "local", number: "BELL" }],
        budget: {
          lines: [
            { currency: "USD", amount_cents: 1500, paid: false, source: "plan", source_id: 1 },
            { currency: "USD", amount_cents: 1200, paid: true, source: "transport", source_id: 9 },
          ],
        },
      },
    ],
    past: [
      {
        id: 5,
        title: "Paper return",
        status: "done",
        start_date: "2026-10-01",
        end_date: "2026-10-03",
        stays: [{ city: "Paper City" }],
        days: [],
        transports: [],
        budget: { lines: [] },
      },
    ],
  };
}

function paperMemories() {
  return {
    memories: [
      {
        id: "trip:4",
        trip_id: 4,
        title: "Paper coast",
        status: "planning",
        mark: "planned",
        mark_label: "Planned",
        span_start: "2026-12-01",
        span_end: "2026-12-03",
        span_text: "December 1, 2026 through December 3, 2026",
      },
      {
        id: "trip:5",
        trip_id: 5,
        title: "Paper return",
        status: "done",
        mark: "completed",
        mark_label: "Completed",
        span_start: "2026-10-01",
        span_end: "2026-10-03",
        span_text: "October 1, 2026 through October 3, 2026",
      },
    ],
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

describe("HarborRoomsComponent", () => {
  let httpMock: HttpTestingController;

  function mount(session = liveSession()) {
    const params = new BehaviorSubject(convertToParamMap({ room: "gallery" }));
    TestBed.configureTestingModule({
      imports: [HarborRoomsComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: SESSION_CONTEXT, useValue: session.port },
        {
          provide: ActivatedRoute,
          useValue: {
            get snapshot() {
              return { queryParamMap: params.value };
            },
            queryParamMap: params.asObservable(),
          },
        },
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(HarborRoomsComponent);
    fixture.componentRef.setInput("room", "gallery");
    const router = TestBed.inject(Router);
    spyOn(router, "navigate").and.resolveTo(true);
    return { fixture, component: fixture.componentInstance, router, session, params };
  }

  function flushBoth(
    fixture: ReturnType<typeof mount>["fixture"],
    home: ReturnType<typeof paperHome> | null = paperHome(),
    memories: ReturnType<typeof paperMemories> | null = paperMemories(),
  ) {
    const homeRequest = httpMock.expectOne("/travel/api/home");
    const memoryRequest = httpMock.expectOne((req) => req.url.includes("/travel/api/memories"));
    if (home) homeRequest.flush(home);
    if (memories) memoryRequest.flush(memories);
    fixture.detectChanges();
  }

  function button(fixture: ReturnType<typeof mount>["fixture"], label: string) {
    return [...fixture.nativeElement.querySelectorAll("button")].find((node) =>
      (node.textContent || "").includes(label),
    ) as HTMLButtonElement;
  }

  afterEach(() => httpMock?.verify());

  it("shows the planned span, then the completed span, from the saved rows", () => {
    const { fixture } = mount();
    flushBoth(fixture);
    button(fixture, "Select planned postcard").click();
    fixture.detectChanges();
    const planned = fixture.nativeElement.querySelector("#harbor-facts").textContent as string;
    expect(planned).toContain("Status planning.");
    expect(planned).toContain("December 1, 2026 through December 3, 2026");
    expect(planned).toContain("2026-12-01 through 2026-12-03");
    expect(planned).not.toContain("Status done.");
    expect(planned).toContain("PTO charge 0 days.");
    expect(planned).toContain("This room does not add a PTO charge.");
    expect(planned).toContain("2026-12-01 · 1");
    expect(planned).toContain("Hidden while Finance is locked");
    button(fixture, "Select completed postcard").click();
    fixture.detectChanges();
    const completed = fixture.nativeElement.querySelector("#harbor-facts").textContent as string;
    expect(completed).toContain("Status done.");
    expect(completed).toContain("October 1, 2026 through October 3, 2026");
    expect(completed).toContain("2026-10-01 through 2026-10-03");
    expect(completed).not.toContain("Status planning.");
    expect(completed).not.toContain("December 1, 2026 through December 3, 2026");
  });

  it("says when the souvenir span and the trip span disagree", () => {
    const { fixture } = mount();
    const memories = paperMemories();
    memories.memories[0].span_end = "2026-12-09";
    memories.memories[0].span_text = "December 1, 2026 through December 9, 2026";
    flushBoth(fixture, paperHome(), memories);
    button(fixture, "Select planned postcard").click();
    fixture.detectChanges();
    const facts = fixture.nativeElement.querySelector("#harbor-facts").textContent as string;
    expect(facts).toContain("December 1, 2026 through December 9, 2026");
    expect(facts).toContain("The saved trip dates do not match this souvenir.");
    expect(facts).toContain("Status planning.");
  });

  it("keeps the trip and the private note when a later trip load fails", () => {
    const { fixture, component } = mount();
    flushBoth(fixture);
    const note = fixture.nativeElement.querySelector("#harbor-note") as HTMLInputElement;
    note.value = "quay pencil";
    note.dispatchEvent(new Event("input"));
    fixture.detectChanges();
    component.load();
    httpMock.expectOne("/travel/api/home").flush("down", { status: 503, statusText: "Down" });
    httpMock.expectOne((req) => req.url.includes("/travel/api/memories")).flush(paperMemories());
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain("Couldn't load this trip.");
    expect(text).toContain("Paper coast");
    expect(text).toContain("Paper return");
    expect((fixture.nativeElement.querySelector("#harbor-note") as HTMLInputElement).value).toBe("quay pencil");
  });

  it("keeps the note when souvenirs fail and shows them after retry", () => {
    const { fixture, component } = mount();
    httpMock.expectOne("/travel/api/home").flush(paperHome());
    httpMock.expectOne((req) => req.url.includes("/travel/api/memories")).flush("down", { status: 503, statusText: "Down" });
    fixture.detectChanges();
    const note = fixture.nativeElement.querySelector("#harbor-note") as HTMLInputElement;
    note.value = "quay pencil";
    note.dispatchEvent(new Event("input"));
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain("Couldn't load saved souvenirs.");
    expect(fixture.nativeElement.querySelector("#harbor-planned-4")).toBeNull();
    component.loadMemories();
    httpMock.expectOne((req) => req.url.includes("/travel/api/memories")).flush(paperMemories());
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector("#harbor-planned-4")).not.toBeNull();
    expect((fixture.nativeElement.querySelector("#harbor-note") as HTMLInputElement).value).toBe("quay pencil");
  });

  it("rings the model ferry without writing a trip", () => {
    const { fixture } = mount();
    flushBoth(fixture);
    button(fixture, "Select planned postcard").click();
    button(fixture, "Ring the model ferry").click();
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain("Trip status remains planning.");
    expect(text).toContain("does not complete a trip");
    httpMock.expectNone((req) => req.method !== "GET");
  });

  it("drops a late trip response and clears the note when the owner changes", () => {
    const session = liveSession(1);
    const { fixture, component } = mount(session);
    const pending = httpMock.expectOne("/travel/api/home");
    const memories = httpMock.expectOne((req) => req.url.includes("/travel/api/memories"));
    fixture.detectChanges();
    const note = fixture.nativeElement.querySelector("#harbor-note") as HTMLInputElement;
    note.value = "quay pencil";
    note.dispatchEvent(new Event("input"));
    session.users.next({ id: 2 });
    fixture.detectChanges();
    expect(pending.cancelled).toBe(true);
    expect(memories.cancelled).toBe(true);
    expect(fixture.nativeElement.textContent).toContain("Sign in to see this room.");
    expect(fixture.nativeElement.textContent).not.toContain("quay pencil");
    expect(fixture.nativeElement.textContent).not.toContain("Paper coast");
    component.load();
    httpMock.expectNone("/travel/api/home");
    httpMock.expectNone((req) => req.url.includes("/travel/api/memories"));
  });

  it("clears the note when the session ends and ignores the held response", () => {
    const session = liveSession(1);
    const { fixture } = mount(session);
    const pending = httpMock.expectOne("/travel/api/home");
    const memories = httpMock.expectOne((req) => req.url.includes("/travel/api/memories"));
    fixture.detectChanges();
    const note = fixture.nativeElement.querySelector("#harbor-note") as HTMLInputElement;
    note.value = "quay pencil";
    note.dispatchEvent(new Event("input"));
    session.cleared$.next();
    fixture.detectChanges();
    expect(pending.cancelled).toBe(true);
    expect(memories.cancelled).toBe(true);
    expect(fixture.nativeElement.textContent).toContain("Sign in to see this room.");
    expect(fixture.nativeElement.textContent).not.toContain("quay pencil");
    expect(fixture.nativeElement.textContent).not.toContain("Secret harbor");
  });
});
