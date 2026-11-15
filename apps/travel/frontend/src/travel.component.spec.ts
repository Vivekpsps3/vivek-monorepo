import { provideHttpClient } from "@angular/common/http";
import {
HttpTestingController,
provideHttpClientTesting,
} from "@angular/common/http/testing";
import { TestBed } from "@angular/core/testing";
import { provideRouter } from "@angular/router";
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
  });

});
