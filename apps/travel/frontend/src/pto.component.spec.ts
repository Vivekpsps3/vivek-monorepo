import { TestBed } from "@angular/core/testing";
import {
  HttpTestingController,
  provideHttpClientTesting,
} from "@angular/common/http/testing";
import { provideHttpClient } from "@angular/common/http";
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

  function setup() {
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
    httpMock.expectOne("/travel/api/pto").flush(payload());
    httpMock.expectOne("/travel/api/pto/series").flush(seriesBody());
    fixture.detectChanges();
    const component = fixture.componentInstance as PtoComponent;
    return { fixture, component };
  }

  afterEach(() => httpMock?.verify());

  it("adopts bucket state into the forms and renders the forecast chart", () => {
    const { fixture, component } = setup();
    expect(component.bucketForms.pto.start_balance_hours).toBe("80");
    expect(component.bucketForms.sick.start_balance_hours).toBe("");
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector("travel-pto-chart")).not.toBeNull();
    expect(root.textContent).toContain("Leave buckets");
    expect(root.textContent).toContain("Track sick time in its own bucket?");
  });

  it("saves a bucket policy with hours fields and a null blank cap", () => {
    const { component } = setup();
    component.bucketForms.sick = {
      start_balance_hours: " 40 ",
      balance_as_of: "2026-02-01",
      accrual_hours: "4",
      accrual_cadence: "monthly",
      cap_hours: "",
      year_start: "01-01",
    };
    component.saveBucket("sick");
    const req = httpMock.expectOne("/travel/api/pto/policies/sick");
    expect(req.request.method).toBe("PUT");
    expect(req.request.body).toEqual({
      start_balance_hours: "40",
      balance_as_of: "2026-02-01",
      accrual_hours: "4",
      accrual_cadence: "monthly",
      cap_hours: null,
      year_start: "01-01",
    });
    req.flush(payload());
    httpMock.expectOne("/travel/api/pto/series").flush(seriesBody());
    expect(component.saving()).toBeFalse();
  });

  it("sends the chosen bucket when saving leave", () => {
    const { component } = setup();
    component.leave = {
      label: "Flu",
      start_date: "2026-07-01",
      end_date: "2026-07-02",
      days: null,
      notes: "",
      bucket: "sick",
    };
    component.saveLeave();
    const req = httpMock.expectOne("/travel/api/pto/entries");
    expect(req.request.method).toBe("POST");
    expect(req.request.body.bucket).toBe("sick");
    req.flush(payload());
    httpMock.expectOne("/travel/api/pto/series").flush(seriesBody());
  });

  it("dismisses the sick prompt through PTO settings", () => {
    const { component } = setup();
    component.dismissSickPrompt();
    const req = httpMock.expectOne("/travel/api/settings/pto");
    expect(req.request.method).toBe("PUT");
    expect(req.request.body).toEqual({ sick_prompt_dismissed: true });
    req.flush({ hours_per_day: "8", sick_prompt_dismissed: true });
    expect(component.data()?.pto_sick_prompt_dismissed).toBeTrue();
  });
});
