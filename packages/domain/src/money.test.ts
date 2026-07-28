import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { expenseFriction, monthSnapshot } from "./money";
import { TITHE_FIRST_TEMPLATE } from "./templates";

const fx = { NGN: 1, USD: 1580, GBP: 1990, EUR: 1710 };
const plan = {
  id: "p1",
  name: "Tithe",
  emergencyCarryOverDefault: true,
  buckets: TITHE_FIRST_TEMPLATE.plan.buckets,
};

describe("monthSnapshot", () => {
  it("allocates from actual income", () => {
    const txs = [
      {
        type: "i" as const,
        amount: 100_000,
        currency: "NGN",
        date: new Date(),
      },
      {
        type: "e" as const,
        amount: 1_000,
        currency: "NGN",
        bucketId: "spend",
        date: new Date(),
      },
    ];
    const snap = monthSnapshot(plan, txs, "NGN", fx);
    assert.equal(snap.income, 100_000);
    assert.equal(snap.expenses, 1_000);
    const spend = snap.buckets.find((b) => b.bucketId === "spend")!;
    assert.equal(spend.allocated, 8_100);
    assert.equal(spend.spent, 1_000);
    assert.equal(spend.closing, 7_100);
  });
});

describe("expenseFriction", () => {
  it("flags overspend as blocked when amount exceeds remaining", () => {
    const txs = [
      {
        type: "i" as const,
        amount: 100_000,
        currency: "NGN",
        date: new Date(),
      },
    ];
    const f = expenseFriction({
      amountBase: 50_000,
      bucketId: "spend",
      plan,
      monthTxs: txs,
      base: "NGN",
      fx,
    });
    // spend budget is 8100; 50k is way over
    assert.equal(f.wouldOverspend, true);
    assert.equal(f.blocked, true);
    assert.ok(f.overBy > 0);
  });
});
