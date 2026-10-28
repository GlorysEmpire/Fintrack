import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  allTimeBucketStates,
  expenseFriction,
  monthSnapshot,
  movedByBucket,
  sumExpenses,
  sumIncome,
  transactionTotals,
  type MoneyTx,
} from "./money";
import { monthlyPerformance } from "./performance";
import { TITHE_FIRST_TEMPLATE } from "./templates";

const fx = { NGN: 1, USD: 1580, GBP: 1990, EUR: 1710 };
const plan = {
  id: "p",
  name: "Tithe",
  emergencyCarryOverDefault: true,
  buckets: TITHE_FIRST_TEMPLATE.plan.buckets,
};
const NOW = new Date("2026-10-15T12:00:00Z");
const at = (m: number, d: number) => new Date(Date.UTC(2026, m - 1, d, 12));

const income: MoneyTx = { type: "i", amount: 100_000, currency: "NGN", date: at(10, 2) };
/** ₦900 moved from Save to Spend to fund an expense */
const move = (amount = 900): MoneyTx => ({ type: "m", amount, currency: "NGN", bucketId: "spend", fromBucketId: "save", date: at(10, 5) });
const spend = (amount: number, bucketId = "spend"): MoneyTx => ({ type: "e", amount, currency: "NGN", bucketId, date: at(10, 5) });

const state = (txs: MoneyTx[], id: string, month = 10) =>
  monthSnapshot(plan, txs.filter((t) => new Date(t.date).getUTCMonth() === month - 1), "NGN", fx, {}).buckets.find((b) => b.bucketId === id)!;

describe("an approved exception moves money between buckets, and is never income or spending", () => {
  it("movedByBucket nets to zero and ignores everything that is not a move", () => {
    const moved = movedByBucket([income, spend(500), move(900)], "NGN", fx);
    assert.deepEqual(moved, { spend: 900, save: -900 });
    assert.equal(Object.values(moved).reduce((a, b) => a + b, 0), 0);
  });

  it("changes the two buckets by exactly the amount and keeps closing = opening + allocated + moved - spent", () => {
    const before = [income];
    const after = [income, move(900)];
    for (const id of ["spend", "save"]) {
      const b = state(before, id);
      const a = state(after, id);
      assert.equal(a.moved, id === "spend" ? 900 : -900);
      assert.equal(a.closing - b.closing, id === "spend" ? 900 : -900);
      assert.equal(a.closing, a.opening + a.allocated + a.moved - a.spent);
    }
    // the other buckets are untouched
    assert.equal(state(after, "tithe").closing, state(before, "tithe").closing);
  });

  it("is invisible to income, expenses and net: only the buckets change", () => {
    const base = [income, spend(500)];
    const withMove = [...base, move(900)];
    assert.equal(sumIncome(withMove, "NGN", fx), sumIncome(base, "NGN", fx));
    assert.equal(sumExpenses(withMove, "NGN", fx), sumExpenses(base, "NGN", fx));
    assert.deepEqual(transactionTotals(withMove, "NGN", fx), transactionTotals(base, "NGN", fx));
  });

  it("carries into the next month like any other balance in a carry-over bucket", () => {
    // Save carries over; take ₦900 from it in October, and November opens ₦900 lower
    const octOnly = allTimeBucketStates([income], plan, "NGN", fx, {}, new Date("2026-11-10T12:00:00Z"));
    const withMove = allTimeBucketStates([income, move(900)], plan, "NGN", fx, {}, new Date("2026-11-10T12:00:00Z"));
    const save = (s: typeof octOnly) => s.find((b) => b.bucketId === "save")!;
    if (save(octOnly).carryOver) assert.equal(save(octOnly).opening - save(withMove).opening, 900);
  });

  it("is what lets an expense bigger than its bucket be recorded: the bucket then covers it", () => {
    // Spend holds ₦8,100 in October. A ₦9,000 expense is blocked on its own...
    const blocked = expenseFriction({ amountBase: 9_000, bucketId: "spend", plan, txs: [income], base: "NGN", fx, date: at(10, 6), now: NOW });
    assert.equal(blocked.blocked, true);
    assert.equal(Math.round(blocked.overBy), 900);
    // ...and fits once ₦900 has been moved in
    const funded = expenseFriction({ amountBase: 9_000, bucketId: "spend", plan, txs: [income, move(900)], base: "NGN", fx, date: at(10, 6), now: NOW });
    assert.equal(funded.blocked, false);
  });

  it("monthly performance does not count a move as income or spending", () => {
    const rows = monthlyPerformance({ txs: [income, spend(9_000), move(900)], plan, base: "NGN", fx, now: NOW });
    const oct = rows[rows.length - 1];
    assert.equal(oct.income, 100_000);
    assert.equal(oct.expenses, 9_000);
    assert.equal(oct.expenseRate, 9);
  });
});
