/**
 * Financial integrity after Week 1.
 *
 * Week 1 lets users date, edit and delete transactions and change their plan.
 * None of that may break the reconciliation from PR #2:
 *
 *     closing = opening + allocated − spent
 *
 * for every bucket in every month, with next month's opening following from
 * this month's closing. These tests walk whole histories month by month and
 * check exactly that, across: a normal month, an empty month, carry-over,
 * a bucket below zero, transactions dated in the past, plan changes, and many
 * months.
 *
 * About "below zero": a new expense is never accepted past a bucket's balance.
 * A bucket can still end up below zero when history is recalculated (a plan
 * change, or a corrected income), so the engine must reconcile through that too.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  allTimeBucketStates,
  bucketStatesForMonth,
  monthKeyOf,
  openingBalancesForMonth,
  sumIncome,
  transactionTotals,
  txsInMonth,
  type MoneyTx,
} from "./money";
import { nextOpeningBalances, type MonthBucketState } from "./carryover";
import { allocationModeFor, validatePlan } from "./plan";
import { dateFromDateKey } from "./transaction-rules";
import { TITHE_FIRST_TEMPLATE } from "./templates";
import type { BudgetPlan, PlanBucket, WaterfallLayer } from "./types";

const fx = { NGN: 1, USD: 1580, GBP: 1990, EUR: 1710 };
const NOW = new Date(2026, 9, 5); // 5 October 2026
const MONTHS = [5, 6, 7, 8, 9].map((m) => new Date(2026, m, 15)); // Jun … Oct

function tx(type: "i" | "e", amount: number, date: Date, bucketId?: string, currency = "NGN"): MoneyTx {
  return { type, amount, currency, date, ...(bucketId ? { bucketId } : {}) };
}

const titheFirst: BudgetPlan = {
  id: "p1",
  name: "Tithe-first waterfall",
  templateId: "tithe_first",
  emergencyCarryOverDefault: true,
  buckets: TITHE_FIRST_TEMPLATE.plan.buckets.map((b) => ({ ...b })),
};

function bucket(
  id: string,
  layer: WaterfallLayer,
  amount: { percent: number } | { fixed: number },
  order: number,
  carryOver: boolean
): PlanBucket {
  const fixed = "fixed" in amount;
  return {
    id,
    name: id,
    emoji: "",
    layer,
    percent: fixed ? 0 : amount.percent,
    ...(fixed ? { fixed: amount.fixed } : {}),
    mode: allocationModeFor(layer, fixed),
    carryOver,
    order,
  };
}

/** A custom plan with a fixed amount in two layers */
const customPlan: BudgetPlan = {
  id: "p2",
  name: "Custom",
  emergencyCarryOverDefault: true,
  buckets: [
    bucket("tithe", "mandatory", { percent: 10 }, 0, true),
    bucket("rent", "mandatory", { fixed: 15_000 }, 1, false),
    bucket("emergency", "off_the_top", { percent: 10 }, 2, true),
    bucket("school", "life_plan", { fixed: 5_000 }, 3, true),
    bucket("save", "life_plan", { percent: 70 }, 4, true),
    bucket("spend", "life_plan", { percent: 30 }, 5, false),
  ],
};

/**
 * Five months of history:
 *   Jun  normal month
 *   Jul  empty month (nothing recorded)
 *   Aug  two buckets below zero (Spend, and the carry-over Emergency)
 *   Sep  foreign-currency income, carry-over drawn down
 *   Oct  current month, one income so far
 */
const history: MoneyTx[] = [
  tx("i", 80_000, new Date(2026, 5, 3)),
  tx("e", 2_000, new Date(2026, 5, 10), "spend"),
  tx("e", 3_000, new Date(2026, 5, 12), "tithe"),
  tx("i", 40_000, new Date(2026, 7, 1)),
  tx("e", 30_000, new Date(2026, 7, 9), "spend"),
  tx("e", 60_000, new Date(2026, 7, 20), "emergency"),
  tx("i", 20, new Date(2026, 8, 4), undefined, "USD"),
  tx("e", 9_000, new Date(2026, 8, 6), "tithe"),
  tx("e", 1_000, new Date(2026, 8, 21), "save"),
  tx("i", 50_000, new Date(2026, 9, 2)),
];

const near = (a: number, b: number) => Math.abs(a - b) < 1e-6;

/**
 * Walk every month and check the reconciliation invariants.
 * Returns each month's states so a test can look closer.
 */
function assertReconciles(txs: MoneyTx[], plan: BudgetPlan): MonthBucketState[][] {
  const perMonth: MonthBucketState[][] = [];
  let expectedOpenings: Record<string, number> = {};

  for (const month of MONTHS) {
    const label = monthKeyOf(month);
    const states = bucketStatesForMonth(txs, plan, "NGN", fx, month);
    const income = sumIncome(txsInMonth(txs, month), "NGN", fx);

    for (const s of states) {
      // The invariant from PR #2
      assert.ok(near(s.closing, s.opening + s.allocated - s.spent), `${label} ${s.bucketId}`);
      // This month opens with exactly what last month carried over
      assert.ok(near(s.opening, expectedOpenings[s.bucketId] || 0), `${label} ${s.bucketId} opening`);
      assert.ok(s.allocated >= 0);
    }
    // Every unit of income is assigned to a bucket, never more
    assert.ok(near(states.reduce((sum, s) => sum + s.allocated, 0), income), `${label} allocation`);

    expectedOpenings = nextOpeningBalances(states);
    perMonth.push(states);
  }

  // The cached "opening balances" the packer writes are exactly this replay
  const octoberOpenings = openingBalancesForMonth(txs, plan, "NGN", fx, NOW);
  const fromSeptember = nextOpeningBalances(perMonth[perMonth.length - 2]);
  assert.deepEqual(octoberOpenings, fromSeptember);

  // TOTAL and THIS MONTH agree
  assert.deepEqual(allTimeBucketStates(txs, plan, "NGN", fx, {}, NOW), perMonth[perMonth.length - 1]);
  return perMonth;
}

function state(states: MonthBucketState[], id: string): MonthBucketState {
  return states.find((s) => s.bucketId === id)!;
}

for (const plan of [titheFirst, customPlan]) {
  describe(`reconciliation holds — ${plan.name}`, () => {
    it("is a valid plan", () => {
      assert.equal(validatePlan(plan).ok, true);
    });

    it("normal month, empty month, carry-over, buckets below zero and multiple months all reconcile", () => {
      const [jun, jul, aug] = assertReconciles(history, plan);

      // Normal month: money left in a carry-over bucket…
      assert.equal(state(jun, "tithe").closing, 5_000);
      // …survives an empty month untouched,
      assert.equal(state(jul, "tithe").opening, 5_000);
      assert.equal(state(jul, "tithe").allocated, 0);
      assert.equal(state(jul, "tithe").closing, 5_000);
      // while a monthly-reset bucket starts the empty month at zero.
      assert.equal(state(jul, "spend").opening, 0);
      assert.equal(state(jul, "spend").closing, 0);

      // Spending is counted in full: both buckets end the month below zero.
      assert.ok(state(aug, "spend").closing < 0);
      assert.ok(state(aug, "emergency").closing < 0);
      assert.equal(state(aug, "spend").spent, 30_000);
      assert.equal(state(aug, "emergency").spent, 60_000);
    });

    it("real totals are income minus expenses, whatever the buckets say", () => {
      assert.deepEqual(transactionTotals(history, "NGN", fx), {
        income: 80_000 + 40_000 + 20 * 1580 + 50_000,
        expenses: 2_000 + 3_000 + 30_000 + 60_000 + 9_000 + 1_000,
        net: 201_600 - 105_000,
      });
    });

    it("the result does not depend on the order transactions were recorded in", () => {
      const expected = assertReconciles(history, plan);
      const reversed = [...history].reverse();
      const interleaved = [...history.filter((_, i) => i % 2), ...history.filter((_, i) => !(i % 2))];
      assert.deepEqual(assertReconciles(reversed, plan), expected);
      assert.deepEqual(assertReconciles(interleaved, plan), expected);
    });

    it("a transaction dated in a past month reconciles as if it had been recorded then", () => {
      const before = assertReconciles(history, plan);
      // Recorded today, filed under 18 June: ₦1,500 more tithe paid back then.
      const late = tx("e", 1_500, dateFromDateKey("2026-06-18"), "tithe");
      const after = assertReconciles([...history, late], plan);

      assert.equal(state(after[0], "tithe").spent, state(before[0], "tithe").spent + 1_500);
      assert.equal(state(after[0], "tithe").closing, state(before[0], "tithe").closing - 1_500);
      // The smaller June balance flows forward through the empty month
      assert.equal(state(after[1], "tithe").opening, state(before[1], "tithe").opening - 1_500);
      // Nothing about other buckets in June changed
      assert.deepEqual(state(after[0], "spend"), state(before[0], "spend"));
    });

    it("editing a transaction is the same as if it had been recorded that way", () => {
      const edited = history.map((t) =>
        t.amount === 2_000 && t.bucketId === "spend" ? { ...t, amount: 2_750 } : t
      );
      const states = assertReconciles(edited, plan);
      assert.equal(state(states[0], "spend").spent, 2_750);
    });

    it("deleting a transaction leaves exactly the history without it", () => {
      const without = history.filter((t) => !(t.amount === 9_000 && t.bucketId === "tithe"));
      const states = assertReconciles(without, plan);
      assert.equal(state(states[3], "tithe").spent, 0);
    });

    it("moving a transaction to another month moves its effect with it", () => {
      const moved = history.map((t) =>
        t.amount === 3_000 && t.bucketId === "tithe" ? { ...t, date: dateFromDateKey("2026-09-10") } : t
      );
      const states = assertReconciles(moved, plan);
      assert.equal(state(states[0], "tithe").spent, 0);
      assert.equal(state(states[3], "tithe").spent, 12_000);
    });

    it("still reconciles after a plan change, and the transactions are untouched", () => {
      const frozenHistory = Object.freeze(history.map((t) => Object.freeze({ ...t }))) as MoneyTx[];
      const snapshot = JSON.stringify(frozenHistory);
      const changed: BudgetPlan = {
        ...plan,
        buckets: plan.buckets.map((b) => {
          if (b.id === "tithe") return { ...b, percent: 5 };
          if (b.id === "emergency") return { ...b, carryOver: false };
          return { ...b };
        }),
      };
      assert.equal(validatePlan(changed).ok, true);

      const before = assertReconciles(frozenHistory, plan);
      const after = assertReconciles(frozenHistory, changed);

      // Past months really are recalculated under the new rules…
      assert.equal(state(after[0], "tithe").allocated, state(before[0], "tithe").allocated / 2);
      // …and what actually happened is not.
      assert.equal(JSON.stringify(frozenHistory), snapshot);
      assert.deepEqual(transactionTotals(frozenHistory, "NGN", fx), transactionTotals(history, "NGN", fx));
    });
  });
}
