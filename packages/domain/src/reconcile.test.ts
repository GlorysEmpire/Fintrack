/**
 * Regression: Tithe carry-over after a month was already packed.
 *
 * Live bug (Oct 2026): September was packed while the saved plan had
 * Tithe carryOver=false, so the stored October openings had no tithe entry.
 * After the plan was corrected to carryOver=true, the dashboard still showed
 * Tithe = 0 because the stored openings were never recomputed.
 *
 * The fix treats stored openings as a cache of openingBalancesForMonth():
 * these tests pin the replay results the packer reconciles against.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  allTimeBucketStates,
  monthSnapshot,
  openingBalancesForMonth,
  sameOpeningBalances,
  type MoneyTx,
} from "./money";
import { nextOpeningBalances, monthBucketStates } from "./carryover";
import { TITHE_FIRST_TEMPLATE } from "./templates";
import type { BudgetPlan } from "./types";

const fx = { NGN: 1, USD: 1580, GBP: 1990, EUR: 1710 };

const plan: BudgetPlan = {
  id: "p1",
  name: "Tithe-first waterfall",
  templateId: "tithe_first",
  emergencyCarryOverDefault: true,
  buckets: TITHE_FIRST_TEMPLATE.plan.buckets.map((b) => ({ ...b })),
};

/** The user's plan as it was saved before the template correction */
const planBeforeFix: BudgetPlan = {
  ...plan,
  buckets: plan.buckets.map((b) =>
    b.id === "tithe" ? { ...b, carryOver: false } : { ...b }
  ),
};

function tx(type: "i" | "e", amount: number, date: Date, bucketId?: string): MoneyTx {
  return { type, amount, currency: "NGN", date, ...(bucketId ? { bucketId } : {}) };
}

const AUG = new Date(2026, 7, 12);
const SEP = new Date(2026, 8, 12);
const OCT_NOW = new Date(2026, 9, 5);

// September: ₦34,000 income → Tithe allocated ₦3,400; ₦2,400 tithe paid → closing ₦1,000.
// October: no transactions yet.
const history: MoneyTx[] = [
  tx("i", 34_000, SEP),
  tx("e", 2_400, SEP, "tithe"),
];

describe("tithe template", () => {
  it("tithe carries over in the tithe-first template", () => {
    const tithe = TITHE_FIRST_TEMPLATE.plan.buckets.find((b) => b.id === "tithe")!;
    assert.equal(tithe.carryOver, true);
  });
});

describe("openingBalancesForMonth (what this month should open with)", () => {
  it("opens October with the ₦1,000 tithe left from September", () => {
    const openings = openingBalancesForMonth(history, plan, "NGN", fx, OCT_NOW);
    assert.equal(openings.tithe, 1_000);
    assert.equal(openings.emergency, 3_060);
    // Monthly-reset buckets never carry
    assert.equal(openings.give, undefined);
    assert.equal(openings.spend, undefined);
  });

  it("ignores the current month's own transactions", () => {
    const withOctober = [...history, tx("i", 50_000, new Date(2026, 9, 2))];
    assert.deepEqual(
      openingBalancesForMonth(withOctober, plan, "NGN", fx, OCT_NOW),
      openingBalancesForMonth(history, plan, "NGN", fx, OCT_NOW)
    );
  });

  it("carries through a month with no transactions (skipped month)", () => {
    // August: ₦10,000 income, ₦0 tithe paid → ₦1,000 tithe left.
    // September: nothing. October opening must still hold the ₦1,000.
    const openings = openingBalancesForMonth(
      [tx("i", 10_000, AUG)],
      plan,
      "NGN",
      fx,
      OCT_NOW
    );
    assert.equal(openings.tithe, 1_000);
  });

  it("matches packing month by month (same chain as the live packer)", () => {
    const sepStates = monthBucketStates(34_000, plan, { tithe: 2_400 }, {});
    assert.deepEqual(
      openingBalancesForMonth(history, plan, "NGN", fx, OCT_NOW),
      nextOpeningBalances(sepStates)
    );
  });

  it("no history or no plan → no openings", () => {
    assert.deepEqual(openingBalancesForMonth([], plan, "NGN", fx, OCT_NOW), {});
    assert.deepEqual(openingBalancesForMonth(history, null, "NGN", fx, OCT_NOW), {});
  });
});

describe("stale openings packed under the old plan", () => {
  it("openings packed with tithe carryOver=false have no tithe and differ from the corrected replay", () => {
    const stale = openingBalancesForMonth(history, planBeforeFix, "NGN", fx, OCT_NOW);
    assert.equal(stale.tithe, undefined);

    const corrected = openingBalancesForMonth(history, plan, "NGN", fx, OCT_NOW);
    assert.equal(sameOpeningBalances(stale, corrected), false);
  });

  it("THIS MONTH shows Tithe ₦0 with stale openings and ₦1,000 of ₦1,000 once reconciled", () => {
    const stale = openingBalancesForMonth(history, planBeforeFix, "NGN", fx, OCT_NOW);
    const staleTithe = monthSnapshot(plan, [], "NGN", fx, stale).buckets.find(
      (b) => b.bucketId === "tithe"
    )!;
    assert.equal(staleTithe.closing, 0); // the bug

    const reconciled = openingBalancesForMonth(history, plan, "NGN", fx, OCT_NOW);
    const tithe = monthSnapshot(plan, [], "NGN", fx, reconciled).buckets.find(
      (b) => b.bucketId === "tithe"
    )!;
    assert.equal(tithe.opening, 1_000);
    assert.equal(tithe.allocated, 0);
    assert.equal(tithe.spent, 0);
    assert.equal(tithe.closing, 1_000);
    // Dashboard: alloc = opening + allocated → ₦1,000 of ₦1,000
    assert.equal(tithe.opening + tithe.allocated, 1_000);
  });

  it("carry-over is not counted as income (net stays ₦0)", () => {
    const reconciled = openingBalancesForMonth(history, plan, "NGN", fx, OCT_NOW);
    const snap = monthSnapshot(plan, [], "NGN", fx, reconciled);
    assert.equal(snap.income, 0);
    assert.equal(snap.net, 0);
  });
});

describe("allTimeBucketStates (TOTAL) rolls forward to the current month", () => {
  it("TOTAL shows Tithe ₦1,000 of ₦1,000 when October has no activity", () => {
    const states = allTimeBucketStates(history, plan, "NGN", fx, {}, OCT_NOW);
    const tithe = states.find((s) => s.bucketId === "tithe")!;
    assert.equal(tithe.opening, 1_000);
    assert.equal(tithe.allocated, 0);
    assert.equal(tithe.spent, 0);
    assert.equal(tithe.closing, 1_000);
  });

  it("TOTAL matches THIS MONTH once openings are reconciled", () => {
    const total = allTimeBucketStates(history, plan, "NGN", fx, {}, OCT_NOW);
    const openings = openingBalancesForMonth(history, plan, "NGN", fx, OCT_NOW);
    const month = monthSnapshot(plan, [], "NGN", fx, openings).buckets;
    assert.deepEqual(total, month);
  });

  it("monthly-reset buckets show 0 in a month with no activity, not last month's leftover", () => {
    const states = allTimeBucketStates(history, plan, "NGN", fx, {}, OCT_NOW);
    const give = states.find((s) => s.bucketId === "give")!;
    assert.equal(give.closing, 0);
  });

  it("future-dated transactions extend the replay past now", () => {
    const states = allTimeBucketStates(
      [...history, tx("i", 10_000, new Date(2026, 10, 3))],
      plan,
      "NGN",
      fx,
      {},
      OCT_NOW
    );
    const tithe = states.find((s) => s.bucketId === "tithe")!;
    // November: opening ₦1,000 + ₦1,000 allocated
    assert.equal(tithe.opening, 1_000);
    assert.equal(tithe.allocated, 1_000);
  });
});

describe("sameOpeningBalances", () => {
  it("treats a missing key as 0 and tolerates float noise", () => {
    assert.equal(sameOpeningBalances({ a: 0 }, {}), true);
    assert.equal(sameOpeningBalances({ a: 1000.001 }, { a: 1000 }), true);
    assert.equal(sameOpeningBalances({ a: 1000 }, { a: 1001 }), false);
  });
});
