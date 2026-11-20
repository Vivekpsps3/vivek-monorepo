import { provideHttpClient } from "@angular/common/http";
import {
HttpTestingController,
provideHttpClientTesting,
} from "@angular/common/http/testing";
import { TestBed } from "@angular/core/testing";
import { provideRouter } from "@angular/router";
import { SESSION_CONTEXT } from "@vivek/ui";
import { BehaviorSubject, Subject } from "rxjs";
import { TravelComponent } from "./travel.component";

function bucket(days: string, hours: string) {
  return {
    bucket: "pto",
    configured: true,
    balance_today_days: days,
    balance_today_hours: hours,
  };
}

function home(overrides: Record<string, unknown> = {}) {
  return {
    in_progress: [],
    upcoming: [
      {
        id: 7,
        title: "Kyoto",
        start_date: "2026-11-12",
        end_date: "2026-11-14",
        phase: "upcoming",
        cities: ["Kyoto"],
        pto_days_effective: "2",
        pto: { conflicts: [] },
        next_action: "Review the plan",
        days_until: 2,
        budget: {
          currencies: [{ currency: "EUR", total_cents: 8000, total: "80.00" }],
        },
      },
    ],
    past: [],
    pto: { configured: true, balance_today: "999" },
    next_pto: {
      trip_id: 7,
      title: "Kyoto",
      start_date: "2026-11-12",
      days: "2",
      hours: "16.5",
      balance_when_you_leave: "10",
      balance_when_you_leave_hours: "77",
      leftover_after: "8",
      leftover_after_hours: "61",
    },
    attention: [],
    ...overrides,
  };
}

function board(overrides: Record<string, unknown> = {}) {
  return {
    hours_per_day: "8",
    pto_sick_prompt_dismissed: true,
    buckets: {
      pto: bucket("10", "80"),
      sick: { ...bucket("5", "40"), bucket: "sick" },
    },
    entries: [],
    ...overrides,
  };
}

describe("TravelComponent time off", () => {
  let httpMock: HttpTestingController;

  function setup(homeBody = home(), ptoBody: unknown = board()) {
    TestBed.configureTestingModule({
      imports: [TravelComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    httpMock = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(TravelComponent);
    httpMock.expectOne("/travel/api/home").flush(homeBody);
    const leave = httpMock.expectOne("/travel/api/pto");
    if (ptoBody === null) {
      leave.flush("down", { status: 500, statusText: "Error" });
    } else {
      leave.flush(ptoBody as Record<string, unknown>);
    }
    fixture.detectChanges();
    return fixture;
  }

  afterEach(() => httpMock?.verify());

  it("shows server day and hour balances and the server trip impact", () => {
    const fixture = setup();
    const section = fixture.nativeElement.querySelector(".time-off") as HTMLElement;
    expect(section.textContent).toContain("PTO balance today:");
    expect(section.textContent).toContain("10 days · 80 h");
    expect(section.textContent).toContain("Sick balance today:");
    expect(section.textContent).toContain("5 days · 40 h");
    expect(section.textContent).toContain("Next trip Kyoto uses 2 days · 16.5 h.");
    expect(section.textContent).toContain("10 days · 77 h before the trip");
    expect(section.textContent).toContain("8 days · 61 h after");
    expect(section.textContent).not.toContain("999");
    expect(section.textContent).not.toContain("€");
    const card = fixture.nativeElement.querySelector(".trip-card") as HTMLElement;
    expect(card.textContent).toContain("€");
    expect(card.textContent).toContain("Kyoto");
    const forecast = section.querySelector('a[href="/travel/pto"]') as HTMLAnchorElement;
    expect(forecast.textContent).toContain("View forecast");
    expect(card.textContent).toContain("Upcoming");
    expect(card.textContent).toContain("Review the plan");
    expect(card.textContent).toContain("No destination saved.");
  });

  it("paints the newest home response and drops a cancelled one", () => {
    TestBed.configureTestingModule({
      imports: [TravelComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    httpMock = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(TravelComponent);
    const firstHome = httpMock.expectOne("/travel/api/home");
    const firstLeave = httpMock.expectOne("/travel/api/pto");
    fixture.componentInstance.load();
    expect(firstHome.cancelled).toBe(true);
    expect(firstLeave.cancelled).toBe(true);
    httpMock.expectOne("/travel/api/home").flush(home());
    httpMock.expectOne("/travel/api/pto").flush(board());
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain("Kyoto");

    fixture.componentInstance.load();
    httpMock.expectOne("/travel/api/home").flush(
      home({
        upcoming: [
          {
            id: 8,
            title: "Paper week",
            start_date: "2026-12-01",
            end_date: "2026-12-03",
            phase: "upcoming",
            cities: [],
            pto_days_effective: "0",
            pto: { conflicts: [] },
            next_action: "Review the plan",
            days_until: 11,
            budget: { currencies: [] },
          },
        ],
        next_pto: null,
      }),
    );
    httpMock.expectOne("/travel/api/pto").flush(board());
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain("Paper week");
    expect(text).toContain("No destination saved.");
    expect(text).not.toContain("Kyoto");
  });

  it("clears listed trips when the session ends and ignores the late response", () => {
    const cleared$ = new Subject<void>();
    const users = new BehaviorSubject<{ id: number } | null>({ id: 1 });
    TestBed.configureTestingModule({
      imports: [TravelComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        {
          provide: SESSION_CONTEXT,
          useValue: {
            cleared$,
            user$: users,
            get currentUser() {
              return users.value;
            },
          },
        },
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(TravelComponent);
    const firstHome = httpMock.expectOne("/travel/api/home");
    const firstLeave = httpMock.expectOne("/travel/api/pto");
    cleared$.next();
    fixture.detectChanges();
    expect(firstHome.cancelled).toBe(true);
    expect(firstLeave.cancelled).toBe(true);
    const hidden = fixture.nativeElement.textContent as string;
    expect(hidden).not.toContain("Kyoto");
    expect(hidden).not.toContain("Loading trips");

    users.next({ id: 2 });
    fixture.componentInstance.load();
    httpMock.expectNone("/travel/api/home");
    httpMock.expectNone("/travel/api/pto");
  });

  it("removes a shown trip list when the signed-in owner changes", () => {
    const cleared$ = new Subject<void>();
    const users = new BehaviorSubject<{ id: number } | null>({ id: 4 });
    TestBed.configureTestingModule({
      imports: [TravelComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        {
          provide: SESSION_CONTEXT,
          useValue: {
            cleared$,
            user$: users,
            get currentUser() {
              return users.value;
            },
          },
        },
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(TravelComponent);
    httpMock.expectOne("/travel/api/home").flush(home());
    httpMock.expectOne("/travel/api/pto").flush(board());
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain("Kyoto");
    users.next({ id: 9 });
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent as string;
    expect(text).not.toContain("Kyoto");
    expect(text).not.toContain("Loading trips");
    expect(text).not.toContain("Review the plan");
  });

});
