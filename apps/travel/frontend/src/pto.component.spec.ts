import { provideHttpClient } from "@angular/common/http";
import {
HttpTestingController,
provideHttpClientTesting,
} from "@angular/common/http/testing";
import { TestBed } from "@angular/core/testing";
import { provideRouter } from "@angular/router";
import { SESSION_CONTEXT } from "@vivek/ui";
import { PtoComponent } from "./pto.component";

function payload(overrides: Record<string, unknown> = {}) {
  return {
    policy: {
      configured: true,
      balance_saved: "10",
      balance_as_of: "2026-01-01",
      balance_today: "10",
      accrual_amount: "1",
      accrual_unit: "day",
      accrual_cadence: "monthly",
      hours_per_day: "8",
      annual_cap_days: null,
      conflicts: [],
    },
    entries: [],
    hours_per_day: "8",
    pto_sick_prompt_dismissed: false,
    buckets: {
      pto: {
        bucket: "pto",
        configured: true,
        start_balance_hours: "80",
        balance_as_of: "2026-01-01",
        accrual_hours: "8",
        accrual_cadence: "monthly",
        cap_hours: null,
        year_start: "01-01",
        balance_today_hours: "80",
        balance_today_days: "10",
        at_cap: false,
        today_before_balance_date: false,
      },
      sick: null,
    },
    ...overrides,
  };
}

function seriesBody() {
  return {
    today: "2026-06-15",
    hours_per_day: "8",
    horizon_end: "2026-12-31",
    policy_year_end: "2026-12-31",
    rolled_over: false,
    days_left_in_policy_year: 199,
    year_start_bucket: "pto",
    pto: {
      bucket: "pto",
      cap_hours: null,
      at_cap_today: false,
      balance_today_hours: "80",
      balance_today_days: "10",
      balance_horizon_hours: "96",
      balance_horizon_days: "12",
      first_negative: null,
      points: [
        { on: "2026-01-01", hours: "80", days: "10", projected: false, kinds: ["as_of"] },
        { on: "2026-12-31", hours: "96", days: "12", projected: true, kinds: ["horizon"] },
      ],
    },
    sick: null,
  };
}

describe("PtoComponent (TPTO2A/2B)", () => {
  let httpMock: HttpTestingController;

  function setup(board = payload()) {
    TestBed.configureTestingModule({
      imports: [PtoComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        {
          provide: SESSION_CONTEXT,
          useValue: { currentUser: { id: 1 } },
        },
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(PtoComponent);
    fixture.detectChanges();
    httpMock.expectOne("/travel/api/pto").flush(board);
    httpMock.expectOne("/travel/api/pto/series").flush(seriesBody());
    fixture.detectChanges();
    const component = fixture.componentInstance as PtoComponent;
    return { fixture, component };
  }

  afterEach(() => httpMock?.verify());

  it("keeps the forms when the chart fails and refreshes from one retry", () => {
    TestBed.configureTestingModule({
      imports: [PtoComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: SESSION_CONTEXT, useValue: { currentUser: { id: 1 } } },
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(PtoComponent);
    fixture.detectChanges();
    httpMock.expectOne("/travel/api/pto").flush(payload());
    httpMock.expectOne("/travel/api/pto/series").flush("down", { status: 500, statusText: "down" });
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const component = fixture.componentInstance;
    expect(root.textContent).toContain("Couldn't load the balance chart.");
    expect(root.querySelector("travel-pto-chart")).toBeNull();
    expect(root.textContent).toContain("Balance today");
    expect(root.querySelector("input[name='entry-label']")).not.toBeNull();
    const retry = [...root.querySelectorAll("button")].find((button) => button.textContent?.trim() === "Retry");
    expect(retry).toBeTruthy();
    retry!.click();
    fixture.detectChanges();
    httpMock.expectOne("/travel/api/pto/series").flush(seriesBody());
    fixture.detectChanges();
    expect(root.querySelectorAll("travel-pto-chart").length).toBe(1);
    component.drafts.pto.start_balance_hours = "40";
    component.savePolicy("pto");
    httpMock.expectOne("/travel/api/pto/policies/pto").flush(payload());
    httpMock.expectOne("/travel/api/pto/series").flush(seriesBody());
    fixture.detectChanges();
    expect(root.querySelectorAll("travel-pto-chart").length).toBe(1);
  });

  it("keeps a grandfathered hour and rounds only the edited field", () => {
    const board = payload({
      buckets: {
        pto: {
          ...payload().buckets.pto,
          start_balance_hours: "12.3",
          accrual_hours: "10000",
        },
        sick: null,
      },
    });
    const { component } = setup(board);
    component.savePolicy("pto");
    const kept = httpMock.expectOne("/travel/api/pto/policies/pto");
    expect(kept.request.body.start_balance_hours).toBe("12.3");
    expect(kept.request.body.accrual_hours).toBe("10000");
    kept.flush(board);
    httpMock.expectOne("/travel/api/pto/series").flush(seriesBody());
    component.editHour("pto", "accrual_hours", "12,3");
    component.blurHour("pto", "accrual_hours");
    expect(component.drafts.pto.accrual_hours).toBe("12.25");
    expect(component.drafts.pto.start_balance_hours).toBe("12.3");
    expect(component.hintFor("pto", "accrual_hours")).toBe("Rounded to 12.25 h.");
    component.savePolicy("pto");
    const changed = httpMock.expectOne("/travel/api/pto/policies/pto");
    expect(changed.request.body.start_balance_hours).toBe("12.3");
    expect(changed.request.body.accrual_hours).toBe("12.25");
    changed.flush(board);
    httpMock.expectOne("/travel/api/pto/series").flush(seriesBody());
  });

});
