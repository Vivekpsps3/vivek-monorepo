import { provideHttpClient } from "@angular/common/http";
import {
HttpTestingController,
provideHttpClientTesting,
} from "@angular/common/http/testing";
import { TestBed } from "@angular/core/testing";
import { provideRouter } from "@angular/router";
import { BehaviorSubject, Subject } from "rxjs";
import { formatDay } from "@vivek/browser";
import { SESSION_CONTEXT, ToastService } from "@vivek/ui";
import { PtoComponent } from "./pto.component";

function sessionPort(id = 1) {
  const users = new BehaviorSubject<{ id: number } | null>({ id });
  const cleared$ = new Subject<void>();
  return {
    users,
    cleared$,
    port: {
      cleared$,
      user$: users,
      get currentUser() {
        return users.value;
      },
    },
  };
}

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
          useValue: sessionPort().port,
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
        { provide: SESSION_CONTEXT, useValue: sessionPort().port },
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

  it("shows policy facts, the accrual boundary, and the server overlap", () => {
    const board = payload({
      policy: {
        ...payload().policy,
        conflicts: [{ on_date: "2026-12-14", amount: "2", labels: ["North trip", "South trip"] }],
      },
      buckets: {
        pto: {
          ...payload().buckets.pto,
          carry_forward: false,
          cap_hours: "40",
          year_start: "04-01",
          balance_as_of: "2026-03-15",
        },
        sick: null,
      },
    });
    const { fixture } = setup(board);
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain("Unused hours reset at the policy year.");
    expect(text).toContain("Cap is 40 h.");
    expect(text).toContain("Policy year starts Apr 1.");
    expect(text).toContain("Balance recorded through Mar 15, 2026. Accrual starts the next day.");
    expect(text).toContain("Accrual boundary");
    expect(text).toContain("10 days \u00b7 80 h");
    expect(text).toContain(`${formatDay("2026-12-14")} counts 2 PTO days across North trip, South trip.`);
  });

  it("leads with setup when PTO is missing and hides the booking form", () => {
    const { fixture } = setup(payload({ buckets: { pto: null, sick: null } }));
    const root = fixture.nativeElement as HTMLElement;
    const text = root.textContent || "";
    const setupAt = text.indexOf("Set up PTO");
    const sickAt = text.indexOf("Set up Sick");
    expect(setupAt).toBeGreaterThanOrEqual(0);
    expect(sickAt).toBeGreaterThan(setupAt);
    expect(text).not.toContain("Add time off");
    expect(root.querySelector("input[name='start']")).not.toBeNull();
    expect(root.querySelector("input[name='entry-label']")).toBeNull();
    expect(root.querySelector("button.ui-btn--primary")?.textContent).toContain("Save");
  });

  it("puts the balance and add form ahead of sick and keeps one policy edit", () => {
    const { fixture } = setup();
    const root = fixture.nativeElement as HTMLElement;
    const text = root.textContent || "";
    const balanceAt = text.indexOf("Balance today");
    const addAt = text.indexOf("Add time off");
    const sickAt = text.indexOf("Set up Sick");
    expect(balanceAt).toBeGreaterThanOrEqual(0);
    expect(addAt).toBeGreaterThan(balanceAt);
    expect(sickAt).toBeGreaterThan(addAt);
    expect(text).not.toContain("Edit PTO policy");
    const edits = [...root.querySelectorAll("button")].filter(
      (button) => button.getAttribute("aria-label") === "Edit PTO",
    );
    expect(edits.length).toBe(1);
    expect(text).toContain("Unused hours carry into the next policy year.");
  });

  it("keeps an edited policy when the save fails", () => {
    const { component } = setup();
    component.editHour("pto", "start_balance_hours", "40");
    component.savePolicy("pto");
    httpMock.expectOne("/travel/api/pto/policies/pto").flush(
      { message: "down" },
      { status: 500, statusText: "down" },
    );
    expect(component.drafts.pto.start_balance_hours).toBe("40");
    expect(component.data()?.buckets.pto?.start_balance_hours).toBe("80");
  });

  it("clears a private draft when the session ends and ignores the late save", async () => {
    const session = sessionPort();
    TestBed.configureTestingModule({
      imports: [PtoComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: SESSION_CONTEXT, useValue: session.port },
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(PtoComponent);
    fixture.detectChanges();
    httpMock.expectOne("/travel/api/pto").flush(payload());
    httpMock.expectOne("/travel/api/pto/series").flush(seriesBody());
    fixture.detectChanges();
    const component = fixture.componentInstance;
    component.editHour("pto", "start_balance_hours", "12.5");
    component.leave.label = "Clinic draft";
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const name = fixture.nativeElement.querySelector("input[name='entry-label']") as HTMLInputElement;
    expect(name.value).toBe("Clinic draft");
    const toast = TestBed.inject(ToastService);
    spyOn(toast, "success");
    component.savePolicy("pto");
    const put = httpMock.expectOne("/travel/api/pto/policies/pto");
    component.loadSeries();
    const held = httpMock.expectOne("/travel/api/pto/series");
    session.cleared$.next();
    fixture.detectChanges();
    expect(held.cancelled).toBeTrue();
    expect(component.leave.label).toBe("");
    expect(component.drafts.pto.start_balance_hours).not.toBe("12.5");
    expect(component.series()).toBeNull();
    expect(fixture.nativeElement.querySelector("input[name='entry-label']")).toBeNull();
    put.flush(payload({
      buckets: {
        pto: { ...payload().buckets.pto, start_balance_hours: "12.5" },
        sick: null,
      },
    }));
    fixture.detectChanges();
    expect(toast.success).not.toHaveBeenCalled();
    expect(component.data()).toBeNull();
    expect(component.drafts.pto.start_balance_hours).not.toBe("12.5");
    expect(component.leave.label).toBe("");
    expect(fixture.nativeElement.querySelector("input[name='entry-label']")).toBeNull();
  });

  it("clears a private draft when the owner changes and does not reload", async () => {
    const session = sessionPort();
    TestBed.configureTestingModule({
      imports: [PtoComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: SESSION_CONTEXT, useValue: session.port },
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(PtoComponent);
    fixture.detectChanges();
    httpMock.expectOne("/travel/api/pto").flush(payload());
    httpMock.expectOne("/travel/api/pto/series").flush(seriesBody());
    fixture.detectChanges();
    const component = fixture.componentInstance;
    component.leave.label = "Clinic draft";
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect((fixture.nativeElement.querySelector("input[name='entry-label']") as HTMLInputElement).value).toBe("Clinic draft");
    session.users.next({ id: 9 });
    fixture.detectChanges();
    expect(component.leave.label).toBe("");
    expect(fixture.nativeElement.querySelector("input[name='entry-label']")).toBeNull();
    component.load();
    httpMock.expectNone("/travel/api/pto");
    httpMock.expectNone("/travel/api/pto/series");
  });

});
