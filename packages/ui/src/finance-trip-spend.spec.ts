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

  it("lookup is null until register; unregister restores null", () => {
    expect(registry.lookup()).toBeNull();
    const fn: TripSpendLookup = () => [
      { currency: "USD", cents: 1234, count: 2 },
    ];
    const unregister = registry.register(fn);
    expect(registry.lookup()).toBe(fn);
    expect(registry.lookup()?.(7)).toEqual([
      { currency: "USD", cents: 1234, count: 2 },
    ]);
    unregister();
    expect(registry.lookup()).toBeNull();
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
