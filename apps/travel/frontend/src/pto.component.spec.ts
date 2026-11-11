import { TestBed } from "@angular/core/testing";
import {
  HttpTestingController,
  provideHttpClientTesting,
} from "@angular/common/http/testing";
import { provideHttpClient } from "@angular/common/http";
import { provideRouter } from "@angular/router";
import { SESSION_CONTEXT, ToastService } from "@vivek/ui";
import { ACCRUAL_COPY } from "./pto-model.mjs";
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

  it("adopts bucket state into the forms and renders the forecast chart", () => {
    const { fixture, component } = setup();
    expect(component.drafts.pto.start_balance_hours).toBe("80");
    expect(component.drafts.sick.start_balance_hours).toBe("");
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector("travel-pto-chart")).not.toBeNull();
    expect(root.querySelector("h1.visually-hidden")?.textContent).toContain("PTO");
    expect(root.querySelector("p.lede")).toBeNull();
    expect(root.textContent).not.toContain("Your time off today and what's left after each trip.");
    expect(root.querySelectorAll("travel-pto-chart").length).toBe(1);
    expect(root.textContent).toContain("Projected to Dec 31, 2026");
    expect(root.textContent).toContain("end of your policy year");
    expect(root.textContent).not.toContain("Chart runs through");
    expect(root.textContent).not.toContain("last 60");
    expect(root.textContent).toContain("Balance today");
    expect(root.textContent).toContain("Track sick time too");
  });

  it("saves a bucket policy with hours fields and a null blank cap", () => {
    const { component } = setup();
    component.drafts.sick = {
      start_balance_hours: " 40 ",
      balance_as_of: "2026-02-01",
      accrual_hours: "4",
      accrual_cadence: "monthly",
      cap_hours: "",
      year_month: "01",
      year_day: "01",
      carry_forward: true,
      accrual_mode: "daily",
      accrual_anchor: "",
      accrual_version: 0,
    };
    component.savePolicy("sick");
    const req = httpMock.expectOne("/travel/api/pto/policies/sick");
    expect(req.request.method).toBe("PUT");
    expect(req.request.body).toEqual({
      start_balance_hours: "40",
      balance_as_of: "2026-02-01",
      accrual_hours: "4",
      accrual_cadence: "monthly",
      cap_hours: null,
      year_start: "01-01",
      carry_forward: true,
      accrual_mode: "daily",
      accrual_anchor: null,
      accrual_version: 0,
    });
    req.flush(payload());
    httpMock.expectOne("/travel/api/pto/series").flush(seriesBody());
    expect(component.busy()).toBe("");
  });

  it("sends the chosen bucket when saving leave", () => {
    const { component } = setup();
    component.entryBucket = "sick";
    component.leave = {
      label: "Flu",
      start_date: "2026-07-01",
      end_date: "2026-07-02",
      days: "",
      notes: "",
    };
    component.saveEntry();
    const req = httpMock.expectOne("/travel/api/pto/entries");
    expect(req.request.method).toBe("POST");
    expect(req.request.body.bucket).toBe("sick");
    req.flush(payload());
    httpMock.expectOne("/travel/api/pto/series").flush(seriesBody());
  });

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

  it("keeps the original policy body when retry follows a later edit", () => {
    const { component } = setup();
    const toast = TestBed.inject(ToastService);
    let retry: (() => void) | undefined;
    spyOn(toast, "error").and.callFake((_message: string, action?: { run?: () => void }) => {
      retry = action?.run;
    });
    component.editHour("pto", "start_balance_hours", "40");
    component.savePolicy("pto");
    const failed = httpMock.expectOne("/travel/api/pto/policies/pto");
    expect(failed.request.body.start_balance_hours).toBe("40");
    failed.flush({ message: "down" }, { status: 502, statusText: "down" });
    component.editHour("pto", "start_balance_hours", "99");
    retry?.();
    const again = httpMock.expectOne("/travel/api/pto/policies/pto");
    expect(again.request.body.start_balance_hours).toBe("40");
    again.flush(payload());
    httpMock.expectOne("/travel/api/pto/series").flush(seriesBody());
  });

  it("maps a 422 onto the field and drops a preview whose policy changed", () => {
    const { component } = setup();
    component.leave = { label: "Trip", start_date: "2026-07-01", end_date: "2026-07-02", days: "", notes: "" };
    component.preview();
    const preview = httpMock.expectOne((req) => req.url.startsWith("/travel/api/pto/preview"));
    preview.flush({
      balance_when_you_leave: "10",
      leftover_after: "8",
      note: "",
      days: "2",
      auto: true,
      configured: true,
    });
    expect(component.visiblePreview()?.balance_when_you_leave).toBe("10");
    component.editHour("pto", "accrual_hours", "4");
    component.savePolicy("pto");
    const rejected = httpMock.expectOne("/travel/api/pto/policies/pto");
    rejected.flush(
      { field_errors: { accrual_hours: ACCRUAL_COPY } },
      { status: 422, statusText: "invalid" },
    );
    expect(component.fieldErrors()["accrual_hours"]).toBe(ACCRUAL_COPY);
    expect(component.drafts.pto.accrual_hours).toBe("4");
    expect(component.visiblePreview()?.balance_when_you_leave).toBe("10");
    const saved = payload({
      buckets: {
        pto: { ...payload().buckets.pto, accrual_hours: "4" },
        sick: null,
      },
    });
    component.editHour("pto", "accrual_hours", "6");
    component.savePolicy("pto");
    httpMock.expectOne("/travel/api/pto/policies/pto").flush(saved);
    httpMock.expectOne("/travel/api/pto/series").flush(seriesBody());
    expect(component.visiblePreview()).toBeNull();
  });

  it("dismisses the sick prompt through PTO settings", () => {
    const { component } = setup();
    component.dismissPrompt();
    const req = httpMock.expectOne("/travel/api/settings/pto");
    expect(req.request.method).toBe("PUT");
    expect(req.request.body).toEqual({ sick_prompt_dismissed: true });
    req.flush({ hours_per_day: "8", sick_prompt_dismissed: true });
    expect(component.data()?.pto_sick_prompt_dismissed).toBeTrue();
  });
});
