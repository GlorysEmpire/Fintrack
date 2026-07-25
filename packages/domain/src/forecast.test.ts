import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { forecast, expectedMonthlyGross } from "./forecast";
import type { BudgetPlan } from "./types";

const plan: Pick<BudgetPlan, "buckets"> = {
  buckets: [
    {
      id: "tithe",
      name: "Tithe",
      emoji: "✝️",
      percent: 10,
      mode: "of_gross",
      carryOver: false,
      order: 0,
    },
    {
      id: "spend",
      name: "Spend",
      emoji: "🛒",
      percent: 90,
      mode: "of_remaining",
      carryOver: false,
      order: 1,
    },
  ],
};

const fx = { NGN: 1, USD: 1580, GBP: 1990, EUR: 1710 };

describe("forecast", () => {
  it("projects waterfall for next months from income history", () => {
    const now = new Date();
    const history = [
      {
        type: "i" as const,
        amount: 100_000,
        currency: "NGN",
        date: new Date(now.getFullYear(), now.getMonth() - 1, 5),
      },
      {
        type: "i" as const,
        amount: 100_000,
        currency: "NGN",
        date: new Date(now.getFullYear(), now.getMonth() - 2, 5),
      },
      {
        type: "i" as const,
        amount: 100_000,
        currency: "NGN",
        date: new Date(now.getFullYear(), now.getMonth() - 3, 5),
      },
    ];

    const result = forecast(plan, history, 2, { base: "NGN", fx });
    assert.equal(result.months.length, 2);
    assert.ok(result.baselineGross > 0);
    const tithe = result.months[0].waterfall.lines.find(
      (l) => l.bucketId === "tithe"
    );
    assert.ok(tithe);
    assert.ok(Math.abs(tithe.allocated - result.baselineGross * 0.1) < 1);
  });

  it("adds monthlyized recurring income when no history", () => {
    const g = expectedMonthlyGross({
      history: [],
      base: "NGN",
      fx,
      recurring: [
        {
          amount: 50_000,
          currency: "NGN",
          cadence: "monthly",
          type: "i",
          active: true,
        },
      ],
    });
    assert.equal(g, 50_000);
  });

  it("clamps monthsAhead to 1–3", () => {
    const r = forecast(plan, [], 99, { base: "NGN", fx });
    assert.equal(r.months.length, 3);
  });
});
