import { TestBed } from "@angular/core/testing";
import {
FinanceTripSpendRegistry,
type TripSpendLookup,
} from "./finance-trip-spend";

describe("FinanceTripSpendRegistry", () => {
  let registry: FinanceTripSpendRegistry;

  beforeEach(() => {
    registry = TestBed.inject(FinanceTripSpendRegistry);
  });

  it("a stale unregister does not clear a newer registration", () => {
    const first: TripSpendLookup = () => [];
    const second: TripSpendLookup = () => [
      { currency: "EUR", cents: 500, count: 1 },
    ];
    const unregisterFirst = registry.register(first);
    registry.register(second);
    unregisterFirst();
    expect(registry.lookup()).toBe(second);
  });
});
