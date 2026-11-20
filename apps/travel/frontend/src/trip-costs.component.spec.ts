import { TestBed } from "@angular/core/testing";
import { provideRouter } from "@angular/router";
import { formatMoney } from "@vivek/browser";
import { FinanceTripSpendRegistry, SESSION_CONTEXT } from "@vivek/ui";
import { Subject } from "rxjs";
import { TripCostLinkConfirm, TripCostLinkStore } from "./trip-cost-links";
import { TripCostsComponent } from "./trip-costs.component";
import type { Trip } from "./travel.models";

function budget(): Trip["budget"] {
  return {
    currencies: [
      {
        currency: "EUR",
        total: "12.00",
        paid: "0.00",
        unpaid: "12.00",
        total_cents: 1200,
        paid_cents: 0,
        unpaid_cents: 1200,
        buckets: [],
      },
      {
        currency: "USD",
        total: "40.00",
        paid: "40.00",
        unpaid: "0.00",
        total_cents: 4000,
        paid_cents: 4000,
        unpaid_cents: 0,
        buckets: [],
      },
    ],
    lines: [],
    manual: [],
  };
}

describe("Trip costs Finance spend", () => {
  it("moves locked, none, and some without a reload and keeps Travel currencies separate", () => {
    TestBed.configureTestingModule({
      imports: [TripCostsComponent],
      providers: [provideRouter([])],
    });
    const fixture = TestBed.createComponent(TripCostsComponent);
    fixture.componentRef.setInput("budget", budget());
    fixture.componentRef.setInput("tripId", 7);
    fixture.detectChanges();
    const finance = () => (fixture.nativeElement.querySelector(".cost-finance") as HTMLElement).textContent ?? "";
    const tripTotals = () => (fixture.nativeElement.querySelector(".cost-currency") as HTMLElement).textContent ?? "";

    expect(finance()).toContain("Unlock Finance to see card spend");
    expect(tripTotals()).toContain("EUR");
    expect(fixture.nativeElement.textContent).toContain("Currencies are kept separate");

    const registry = TestBed.inject(FinanceTripSpendRegistry);
    const none = registry.register(() => []);
    fixture.detectChanges();
    expect(finance()).toContain("no card spend is tagged to this trip");
    expect(finance()).not.toContain("Unlock Finance");

    none();
    registry.register(() => [{ currency: "USD", cents: 1525, count: 2 }]);
    fixture.detectChanges();
    expect(finance()).toContain("Spent in Finance");
    expect(finance()).toContain(formatMoney(1525, { currency: "USD" }));
    expect(finance()).toContain("2 transactions");
    expect(finance()).toContain("Card spend isn't added to the trip total.");
    expect(finance()).not.toContain("EUR");
    expect(tripTotals()).toContain(formatMoney(1200, { currency: "EUR" }));
    expect(fixture.nativeElement.textContent).toContain(formatMoney(4000, { currency: "USD" }));
    TestBed.inject(TripCostLinkStore).clearAll();
  });
});

function stageBudget(): Trip["budget"] {
  return {
    currencies: [
      {
        currency: "EUR",
        total: "8.00",
        paid: "0.00",
        unpaid: "8.00",
        total_cents: 800,
        paid_cents: 0,
        unpaid_cents: 800,
        buckets: [],
      },
      {
        currency: "USD",
        total: "435.00",
        paid: "420.00",
        unpaid: "15.00",
        total_cents: 43500,
        paid_cents: 42000,
        unpaid_cents: 1500,
        buckets: [],
      },
    ],
    lines: [
      {
        source: "transport",
        source_id: 11,
        category: "outbound_flight",
        label: "SYN 100 · Harbor → Field",
        amount: "420.00",
        currency: "USD",
        paid: true,
        amount_cents: 42000,
        bucket: "transport",
      },
      {
        source: "plan",
        source_id: 12,
        category: "activity",
        label: "Museum hour",
        amount: "15.00",
        currency: "USD",
        paid: false,
        amount_cents: 1500,
        bucket: "stays_plans",
      },
      {
        source: "plan",
        source_id: 13,
        category: "other",
        label: "Guidebook",
        amount: "8.00",
        currency: "EUR",
        paid: false,
        amount_cents: 800,
        bucket: "other",
      },
    ],
    manual: [],
  };
}

function clickNamed(root: HTMLElement, name: string): void {
  const button = [...root.querySelectorAll("button")].find((element) =>
    (element.textContent ?? "").includes(name),
  );
  if (!button) throw new Error(`Missing button ${name}`);
  button.click();
}

describe("Trip cost reconciliation", () => {
  afterEach(() => {
    TestBed.inject(TripCostLinkStore).clearAll();
  });

  function setup(confirm: { confirm: jasmine.Spy }) {
    TestBed.configureTestingModule({
      imports: [TripCostsComponent],
      providers: [provideRouter([]), { provide: TripCostLinkConfirm, useValue: confirm }],
    });
    const fixture = TestBed.createComponent(TripCostsComponent);
    fixture.componentRef.setInput("budget", stageBudget());
    fixture.componentRef.setInput("tripId", 7);
    const registry = TestBed.inject(FinanceTripSpendRegistry);
    registry.register(() => [{
      currency: "USD",
      cents: 42000,
      count: 1,
      postings: [{ id: 4, cents: 42000, label: "2026-11-02 · Travel" }],
    }]);
    fixture.detectChanges();
    return fixture;
  }

  it("counts a booked flight and its posted transaction once", async () => {
    const confirm = jasmine.createSpy("confirm").and.resolveTo({
      status: "posted",
      posting: { id: 4, cents: 42000, label: "2026-11-02 · Travel" },
    });
    const fixture = setup({ confirm });
    const text = () => fixture.nativeElement.textContent ?? "";
    expect(text()).toContain("Planned");
    expect(text()).toContain(formatMoney(1500, { currency: "USD" }));
    expect(text()).toContain("Booked");
    expect(text()).toContain(formatMoney(42000, { currency: "USD" }));
    expect(text()).toContain("No posted EUR");
    expect(text()).not.toContain(formatMoney(84000, { currency: "USD" }));
    const finance = fixture.nativeElement.querySelector(".cost-finance") as HTMLElement;
    expect(finance.textContent).not.toContain("EUR");
    expect(finance.textContent).toContain("Card spend isn't added to the trip total.");

    clickNamed(fixture.nativeElement, "Link posted transaction");
    fixture.detectChanges();
    clickNamed(fixture.nativeElement, "2026-11-02 · Travel");
    await fixture.whenStable();
    fixture.detectChanges();

    expect(confirm).toHaveBeenCalledOnceWith(7, 4);
    expect(text()).toContain("Linked · counted once");
    expect(text()).toContain("Counted once");
    expect(text()).toContain("The linked booked cost and posted transaction are one payment.");
    expect(text()).toContain("SYN 100 · Harbor → Field");
    expect(text()).not.toContain(formatMoney(84000, { currency: "USD" }));
    expect(text()).not.toContain("SYN flight marker");
  });

  it("keeps the draft after a failed read and ignores a replaced response", async () => {
    let resolveConfirm: (value: unknown) => void = () => undefined;
    const confirm = jasmine.createSpy("confirm").and.callFake(
      () => new Promise((resolve) => { resolveConfirm = resolve; }),
    );
    const fixture = setup({ confirm });
    clickNamed(fixture.nativeElement, "Link posted transaction");
    fixture.detectChanges();
    clickNamed(fixture.nativeElement, "2026-11-02 · Travel");
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain("Saving link");

    resolveConfirm({ status: "failed" });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain("Couldn't save this link. Try again.");
    expect(fixture.nativeElement.textContent).toContain("SYN 100 · Harbor → Field");
    expect(fixture.nativeElement.textContent).not.toContain("Linked · counted once");

    clickNamed(fixture.nativeElement, "Try again");
    fixture.detectChanges();
    resolveConfirm({ status: "posted", posting: { id: 4, cents: 42000, label: "2026-11-02 · Travel" } });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain("Linked · counted once");

    clickNamed(fixture.nativeElement, "Clear link");
    fixture.detectChanges();
    clickNamed(fixture.nativeElement, "Link posted transaction");
    fixture.detectChanges();
    clickNamed(fixture.nativeElement, "2026-11-02 · Travel");
    fixture.detectChanges();
    clickNamed(fixture.nativeElement, "Cancel");
    fixture.detectChanges();
    resolveConfirm({ status: "posted", posting: { id: 4, cents: 42000, label: "2026-11-02 · Travel" } });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).not.toContain("Linked · counted once");
    expect(fixture.nativeElement.textContent).toContain("SYN 100 · Harbor → Field");
  });

  it("clears a private draft when the session ends and leaves no link", async () => {
    const cleared$ = new Subject<void>();
    const confirm = jasmine.createSpy("confirm").and.resolveTo({
      status: "posted",
      posting: { id: 4, cents: 42000, label: "2026-11-02 · Travel" },
    });
    TestBed.configureTestingModule({
      imports: [TripCostsComponent],
      providers: [
        provideRouter([]),
        { provide: TripCostLinkConfirm, useValue: { confirm } },
        { provide: SESSION_CONTEXT, useValue: { cleared$, currentUser: { id: 1 } } },
      ],
    });
    const fixture = TestBed.createComponent(TripCostsComponent);
    fixture.componentRef.setInput("budget", stageBudget());
    fixture.componentRef.setInput("tripId", 7);
    TestBed.inject(FinanceTripSpendRegistry).register(() => [{
      currency: "USD",
      cents: 42000,
      count: 1,
      postings: [{ id: 4, cents: 42000, label: "2026-11-02 · Travel" }],
    }]);
    fixture.detectChanges();
    clickNamed(fixture.nativeElement, "Link posted transaction");
    fixture.detectChanges();
    clickNamed(fixture.nativeElement, "2026-11-02 · Travel");
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain("Linked · counted once");

    (TestBed.inject(SESSION_CONTEXT) as { currentUser: unknown }).currentUser = null;
    cleared$.next();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).not.toContain("Linked · counted once");
    expect(TestBed.inject(TripCostLinkStore).forTrip(7)).toEqual([]);
    expect(fixture.nativeElement.textContent).toContain("SYN 100 · Harbor → Field");
  });
});
