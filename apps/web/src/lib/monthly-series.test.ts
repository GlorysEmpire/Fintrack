import { describe, expect, it } from "vitest";
import { monthlySeries } from "./monthly-series";

const fx = { NGN: 1, USD: 1000 };
const now = new Date(Date.UTC(2026, 9, 28, 12)); // 28 Oct 2026

describe("monthlySeries", () => {
  it("returns the requested months oldest first, across a year boundary, with zeros filled", () => {
    const s = monthlySeries([], "NGN", fx, 4, new Date(Date.UTC(2026, 1, 10)));
    expect(s.map((p) => p.label)).toEqual(["Nov", "Dec", "Jan", "Feb"]);
    expect(s.every((p) => p.income === 0 && p.expenses === 0)).toBe(true);
  });

  it("sums income and expenses per month in the base currency and ignores older months", () => {
    const s = monthlySeries(
      [
        { type: "i", amount: 100, currency: "NGN", date: "2026-10-03T12:00:00Z" },
        { type: "i", amount: 2, currency: "USD", date: "2026-10-20T12:00:00Z" },
        { type: "e", amount: 40, currency: "NGN", date: "2026-09-30T23:00:00Z" },
        { type: "e", amount: 5, currency: "NGN", date: "2026-01-01T00:00:00Z" },
      ],
      "NGN",
      fx,
      3,
      now
    );
    expect(s.map((p) => p.label)).toEqual(["Aug", "Sep", "Oct"]);
    expect(s[2].income).toBe(2100);
    expect(s[1].expenses).toBe(40);
    expect(s[0].expenses).toBe(0);
  });
});
