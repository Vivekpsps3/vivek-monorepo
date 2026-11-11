import { TestBed } from "@angular/core/testing";
import { provideRouter } from "@angular/router";
import { formatMoney } from "@vivek/browser";
import { FinanceTripSpendRegistry } from "@vivek/ui";
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
  });
});
