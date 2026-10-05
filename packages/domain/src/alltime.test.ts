import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { allTimeBucketStates, type MoneyTx } from "./money";
import { monthBucketStates } from "./carryover";
import { TITHE_FIRST_TEMPLATE } from "./templates";

const fx = { NGN: 1, USD: 1580, GBP: 1990, EUR: 1710 };
const plan = {
  id: "p1",
  name: "Tithe",
  emergencyCarryOverDefault: true,
  buckets: TITHE_FIRST_TEMPLATE.plan.buckets,
};

function tx(
  type: "i" | "e",
  amount: number,
  date: Date,
  bucketId?: string
): MoneyTx {
  return {
    type,
    amount,
    currency: "NGN",
    date,
    ...(bucketId ? { bucketId } : {}),
  };
}

const JAN = new Date(2026, 0, 10);
const FEB = new Date(2026, 1, 10);
const MAR = new Date(2026, 2, 10);

describe("allTimeBucketStates (TOTAL bucket scope, multi-month)", () => {
  it("returns the final month's state for each bucket (not cumulative)", () => {
    // JAN: 100,000 income, 1,000 spend in spend bucket
    // FEB: 50,000 income, 2,000 spend in spend bucket
    // TOTAL = final month FEB's state, not JAN+FEB cumulative.
    const txs: MoneyTx[] = [
      tx("i", 100_000, JAN),
      tx("e", 1_000, JAN, "spend"),
      tx("i", 50_000, FEB),
      tx("e", 2_000, FEB, "spend"),
    ];
    const states = allTimeBucketStates(txs, plan, "NGN", fx, {}, FEB);
    const byId = new Map(states.map((s) => [s.bucketId, s]));

    assert.equal(states.length, plan.buckets.length);

    const spend = byId.get("spend")!;
    // FEB spend: opening=0, allocated=4050, spent=2000, closing=2050
    assert.equal(spend.opening, 0);
    assert.equal(spend.allocated, 4_050);
    assert.equal(spend.spent, 2_000);
    assert.equal(spend.closing, 2_050);
    assert.equal(spend.carryOver, false);

    const emergency = byId.get("emergency")!;
    // FEB emergency: opening=9000 (from JAN closing), allocated=4500, spent=0, closing=13500
    assert.equal(emergency.opening, 9_000);
    assert.equal(emergency.allocated, 4_500);
    assert.equal(emergency.spent, 0);
    assert.equal(emergency.closing, 13_500);
    assert.equal(emergency.carryOver, true);

    const tithe = byId.get("tithe")!;
    // FEB tithe: opening=10000 (carry-over from JAN closing 10000),
    // allocated=FEB tithe allocation on 50000 income = 5000, spent=0, closing=15000
    assert.equal(tithe.opening, 10_000);
    assert.equal(tithe.allocated, 5_000);
    assert.equal(tithe.spent, 0);
    assert.equal(tithe.closing, 15_000);
    assert.equal(tithe.carryOver, true);
  });

  it("carry-over bucket preserves chain across months", () => {
    // JAN: 100,000 income only → emergency closing = 9,000
    // FEB: 50,000 income only → emergency opening = 9,000, closing = 13,500
    // TOTAL = FEB final state.
    const txs: MoneyTx[] = [
      tx("i", 100_000, JAN),
      tx("i", 50_000, FEB),
    ];
    const states = allTimeBucketStates(txs, plan, "NGN", fx, {}, FEB);
    const emergency = states.find((s) => s.bucketId === "emergency")!;
    assert.equal(emergency.opening, 9_000);
    assert.equal(emergency.allocated, 4_500);
    assert.equal(emergency.spent, 0);
    assert.equal(emergency.closing, 13_500);
  });

  it("a month with no transactions in the middle keeps the carry-over chain intact", () => {
    // JAN: 100,000 income → emergency closing 9,000
    // FEB: no transactions
    // MAR: 50,000 income → emergency opening = 9,000, closing = 13,500
    // TOTAL = MAR final state.
    const txs: MoneyTx[] = [
      tx("i", 100_000, JAN),
      tx("i", 50_000, MAR), // February has no transactions
    ];
    const states = allTimeBucketStates(txs, plan, "NGN", fx, {}, MAR);
    const emergency = states.find((s) => s.bucketId === "emergency")!;
    assert.equal(emergency.opening, 9_000);
    assert.equal(emergency.allocated, 4_500);
    assert.equal(emergency.spent, 0);
    assert.equal(emergency.closing, 13_500);
  });

  it("monthly-reset buckets (give, spend) still reset by design", () => {
    // JAN: 100,000 income, 1,000 spend in spend bucket
    // FEB: 50,000 income, 2,000 spend in spend bucket
    // spend and give are monthly-reset (carryOver=false), so TOTAL shows FEB only.
    const txs: MoneyTx[] = [
      tx("i", 100_000, JAN),
      tx("e", 1_000, JAN, "spend"),
      tx("i", 50_000, FEB),
      tx("e", 2_000, FEB, "spend"),
    ];
    const states = allTimeBucketStates(txs, plan, "NGN", fx, {}, FEB);
    const spend = states.find((s) => s.bucketId === "spend")!;
    assert.equal(spend.carryOver, false);
    // FEB spend: opening=0, allocated=4050, spent=2000, closing=2050
    assert.equal(spend.opening, 0);
    assert.equal(spend.allocated, 4_050);
    assert.equal(spend.spent, 2_000);
    assert.equal(spend.closing, 2_050);

    const give = states.find((s) => s.bucketId === "give")!;
    assert.equal(give.carryOver, false);
    // FEB give: opening=0, allocated=4050, spent=0, closing=4050
    assert.equal(give.opening, 0);
    assert.equal(give.allocated, 4_050);
    assert.equal(give.spent, 0);
    assert.equal(give.closing, 4_050);
  });

  it("tithe now carries over as a default plan rule, not a special case", () => {
    // Previous month: 34,000 income → tithe allocation = 3,400, spent = 2,400 → closing = 1,000
    // Current month: 0 income → 0 allocation, 0 spent
    // Expected current-month tithe state: opening = 1000, allocated = 0, spent = 0, closing = 1000
    // Dashboard displays: ₦1,000 of ₦1,000 (alloc = opening + allocated)
    const prevMonth = new Date(2026, 0, 10);
    const currentMonth = new Date(2026, 1, 10);

    const txs: MoneyTx[] = [
      tx("i", 34_000, prevMonth),
      tx("e", 2_400, prevMonth, "tithe"),
      // current month has no transactions
    ];
    const states = allTimeBucketStates(txs, plan, "NGN", fx, {}, prevMonth);
    const tithe = states.find((s) => s.bucketId === "tithe")!;

    // As of January (the month the transactions are in), TOTAL = January's tithe state
    // which should be: opening=0, allocated=3400, spent=2400, closing=1000
    assert.equal(tithe.opening, 0);
    assert.equal(tithe.allocated, 3_400);
    assert.equal(tithe.spent, 2_400);
    assert.equal(tithe.closing, 1_000);
    assert.equal(tithe.carryOver, true);

    // Verify THIS MONTH semantics via monthBucketStates directly:
    // previous closing 1000 carried as opening, 0 new income → 0 new allocation
    const thisMonthStates = monthBucketStates(0, plan, {}, { tithe: 1_000 });
    const thisTithe = thisMonthStates.find((s) => s.bucketId === "tithe")!;
    assert.equal(thisTithe.opening, 1_000);
    assert.equal(thisTithe.allocated, 0);
    assert.equal(thisTithe.spent, 0);
    assert.equal(thisTithe.closing, 1_000);
    assert.equal(thisTithe.carryOver, true);

    // Dashboard representation: alloc = opening + allocated = 1000 + 0 = 1000
    // remaining = closing = 1000
    // Format: ₦1,000 of ₦1,000
    const displayedAlloc = thisTithe.opening + thisTithe.allocated;
    assert.equal(displayedAlloc, 1_000);
    assert.equal(thisTithe.closing, 1_000);
    assert.equal(displayedAlloc, thisTithe.closing);
  });

  it("zero current-month income does not erase tithe carry-over", () => {
    // Previous month leaves tithe = 1,000.
    // Current month has no income and no tithe spending.
    // The 1,000 carry-over must survive.
    const states = monthBucketStates(0, plan, {}, { tithe: 1_000 });
    const tithe = states.find((s) => s.bucketId === "tithe")!;
    assert.equal(tithe.opening, 1_000);
    assert.equal(tithe.allocated, 0);
    assert.equal(tithe.spent, 0);
    assert.equal(tithe.closing, 1_000);
    assert.equal(tithe.carryOver, true);
  });

  it("zero current-month allocation does not erase tithe carry-over", () => {
    // Previous month leaves tithe = 1,000.
    // Current month: 0 income → tithe allocation is 0 because tithe is 10% of gross.
    // Even with zero new allocation, the 1,000 carry-over must survive.
    const states = monthBucketStates(0, plan, {}, { tithe: 1_000 });
    const tithe = states.find((s) => s.bucketId === "tithe")!;
    assert.equal(tithe.opening, 1_000);
    assert.equal(tithe.allocated, 0);
    assert.equal(tithe.spent, 0);
    assert.equal(tithe.closing, 1_000);
    assert.equal(tithe.carryOver, true);
  });

  it("spending the carried-over tithe reduces the balance correctly", () => {
    // Previous month leaves tithe = 1,000.
    // Current month: 0 income, spend 600 from tithe.
    // Expected: opening=1000, allocated=0, spent=600, closing=400
    const states = monthBucketStates(0, plan, { tithe: 600 }, { tithe: 1_000 });
    const tithe = states.find((s) => s.bucketId === "tithe")!;
    assert.equal(tithe.opening, 1_000);
    assert.equal(tithe.allocated, 0);
    assert.equal(tithe.spent, 600);
    assert.equal(tithe.closing, 400);
  });

  it("tithe carry-over persists across more than one month", () => {
    // Month 1: 34,000 income, 2,400 tithe spend → closing 1,000
    // Month 2: 0 income, 0 spend → carry-over preserved at 1,000
    // Month 3: 5,000 income (tithe allocation 500) + spend 300 → closing 1,200
    const jAN = new Date(2026, 0, 10);
    const fEB = new Date(2026, 1, 10);
    const mAR = new Date(2026, 2, 10);

    const states = allTimeBucketStates(
      [
        tx("i", 34_000, jAN),
        tx("e", 2_400, jAN, "tithe"),
        // FEB has no transactions
        tx("i", 5_000, mAR),
        tx("e", 300, mAR, "tithe"),
      ],
      plan,
      "NGN",
      fx,
      {},
      mAR
    );
    const tithe = states.find((s) => s.bucketId === "tithe")!;
    // As of March, TOTAL = March's tithe state
    assert.equal(tithe.opening, 1_000); // carried from February
    assert.equal(tithe.allocated, 500); // 10% of 5,000
    assert.equal(tithe.spent, 300);
    assert.equal(tithe.closing, 1_200);
    assert.equal(tithe.carryOver, true);

    // Also verify the intermediate February state via the carry-over chain:
    // February has no transactions, so its tithe state should be:
    // opening=1000 (carried from January closing), allocated=0, spent=0, closing=1000
    const febStates = monthBucketStates(0, plan, {}, { tithe: 1_000 });
    const febTithe = febStates.find((s) => s.bucketId === "tithe")!;
    assert.equal(febTithe.opening, 1_000);
    assert.equal(febTithe.allocated, 0);
    assert.equal(febTithe.spent, 0);
    assert.equal(febTithe.closing, 1_000);
    assert.equal(febTithe.carryOver, true);
  });

  it("carry-over still works for other carry-over buckets (emergency)", () => {
    // JAN: 100,000 income → emergency closing = 9,000
    // FEB: 0 income → emergency opening = 9,000, allocated = 0, closing = 9,000
    const jAN = new Date(2026, 0, 10);
    const fEB = new Date(2026, 1, 10);

    const states = allTimeBucketStates(
      [tx("i", 100_000, jAN)],
      plan,
      "NGN",
      fx,
      {},
      jAN
    );
    const emergency = states.find((s) => s.bucketId === "emergency")!;
    assert.equal(emergency.opening, 0);
    assert.equal(emergency.allocated, 9_000);
    assert.equal(emergency.spent, 0);
    assert.equal(emergency.closing, 9_000);
    assert.equal(emergency.carryOver, true);

    // THIS MONTH: carry-over opening preserved
    const thisMonth = monthBucketStates(0, plan, {}, { emergency: 9_000 });
    const em = thisMonth.find((s) => s.bucketId === "emergency")!;
    assert.equal(em.opening, 9_000);
    assert.equal(em.allocated, 0);
    assert.equal(em.spent, 0);
    assert.equal(em.closing, 9_000);
  });

  it("TOTAL reconstruction remains correct after tithe carry-over change", () => {
    // Same as the first test but with tithe now carrying over
    const jAN = new Date(2026, 0, 10);
    const fEB = new Date(2026, 1, 10);

    const txs: MoneyTx[] = [
      tx("i", 100_000, jAN),
      tx("e", 1_000, jAN, "spend"),
      tx("i", 50_000, fEB),
      tx("e", 2_000, fEB, "spend"),
    ];
    const states = allTimeBucketStates(txs, plan, "NGN", fx, {}, fEB);
    const byId = new Map(states.map((s) => [s.bucketId, s]));

    assert.equal(states.length, plan.buckets.length);

    const spend = byId.get("spend")!;
    // FEB spend: opening=0, allocated=4050, spent=2000, closing=2050
    assert.equal(spend.opening, 0);
    assert.equal(spend.allocated, 4_050);
    assert.equal(spend.spent, 2_000);
    assert.equal(spend.closing, 2_050);
    assert.equal(spend.carryOver, false);

    const emergency = byId.get("emergency")!;
    // FEB emergency: opening=9000 (from JAN closing), allocated=4500, spent=0, closing=13500
    assert.equal(emergency.opening, 9_000);
    assert.equal(emergency.allocated, 4_500);
    assert.equal(emergency.spent, 0);
    assert.equal(emergency.closing, 13_500);
    assert.equal(emergency.carryOver, true);

    const tithe = byId.get("tithe")!;
    // FEB tithe: opening=10000 (carry-over from JAN closing 10000),
    // allocated=FEB tithe allocation on 50000 income = 5000, spent=0, closing=15000
    assert.equal(tithe.opening, 10_000);
    assert.equal(tithe.allocated, 5_000);
    assert.equal(tithe.spent, 0);
    assert.equal(tithe.closing, 15_000);
    assert.equal(tithe.carryOver, true);
  });

  it("empty history returns every plan bucket at zero", () => {
    const states = allTimeBucketStates([], plan, "NGN", fx);
    assert.equal(states.length, plan.buckets.length);
    for (const s of states) {
      assert.deepEqual(
        { opening: s.opening, allocated: s.allocated, spent: s.spent, closing: s.closing },
        { opening: 0, allocated: 0, spent: 0, closing: 0 }
      );
    }
  });

  it("no plan means no bucket state", () => {
    assert.deepEqual(allTimeBucketStates([tx("i", 100_000, JAN)], null, "NGN", fx), []);
  });

  it("converts foreign-currency transactions to base before replaying", () => {
    const txs: MoneyTx[] = [
      { ...tx("i", 100, JAN), currency: "USD" }, // 100 × 1580 = 158,000 NGN
      { ...tx("e", 50, JAN, "spend"), currency: "USD" }, // 50 × 1580 = 79,000 NGN
    ];
    const states = allTimeBucketStates(txs, plan, "NGN", fx, {}, JAN);
    const spend = states.find((s) => s.bucketId === "spend")!;
    // spend gets 10% of remainder after tithe + emergency:
    // 158,000 → 142,200 → 127,980 → 12,798 allocated; spent 79,000
    assert.equal(spend.opening, 0);
    assert.equal(spend.allocated, 12_798);
    assert.equal(spend.spent, 79_000);
    assert.equal(spend.closing, 12_798 - 79_000);
  });

  it("carry-over bucket displays ₦1,000 of ₦1,000 when previous month had ₦1,000 and current month has no income", () => {
    // This is the exact scenario from the requirements:
    //   Previous month: bucket receives ₦1,000, ₦0 spent → closing = ₦1,000
    //   Current month: income = ₦0 → allocation = ₦0
    //   Expected current-month state: opening = 1000, allocated = 0, spent = 0, closing = 1000
    //   Dashboard displays: ₦1,000 of ₦1,000 (because alloc = opening + allocated = 1000 + 0)
    //
    // Tithe in the default plan has carryOver=false (monthly reset), so we use
    // Emergency (carryOver=true) to demonstrate the carry-over behavior.
    const prevMonth = new Date(2026, 0, 10);
    const currentMonth = new Date(2026, 1, 10);

    // Previous month: 10,000 income → emergency allocation = 9,000
    // But to get exactly 1,000 in emergency, we use a small income.
    // Emergency gets 10% of (income - tithe) = 10% of 90% of income = 9% of income.
    // For emergency closing = 1,000: income ≈ 11,111.11...
    // Simpler: we directly construct the THIS MONTH state via monthBucketStates
    // using the exact opening we want.

    const closingFromPrev = 1_000;
    const thisMonthStates = monthBucketStates(0, plan, {}, { emergency: closingFromPrev });
    const emergencyState = thisMonthStates.find((s) => s.bucketId === "emergency")!;

    assert.equal(emergencyState.opening, closingFromPrev);
    assert.equal(emergencyState.allocated, 0);
    assert.equal(emergencyState.spent, 0);
    assert.equal(emergencyState.closing, closingFromPrev);

    // Dashboard display: alloc = opening + allocated = 1000 + 0 = 1000
    // Remaining = closing = 1000
    // Format: ₦1,000 of ₦1,000
    const displayedAlloc = emergencyState.opening + emergencyState.allocated;
    assert.equal(displayedAlloc, closingFromPrev);
    assert.equal(emergencyState.closing, closingFromPrev);
    assert.equal(displayedAlloc, emergencyState.closing);
  });

  it("carry-over bucket combines previous month closing + new allocation + spending", () => {
    // Previous month leaves emergency = ₦1,000.
    // Current month: income = ₦10,000 → emergency allocation = ₦900 (9% of 10,000).
    // Current month emergency spending = ₦200.
    //
    // Expected THIS MONTH emergency state:
    //   opening = 1000 (carry-over from previous month)
    //   allocated = 900 (new allocation from current month income)
    //   spent = 200
    //   closing = 1000 + 900 - 200 = 1700
    //
    // Dashboard displays: ₦1,700 of ₦1,900 (alloc = opening + allocated)

    const prevMonth = new Date(2026, 0, 10);
    const currentMonth = new Date(2026, 1, 10);
    const closingFromPrev = 1_000;
    const currentIncome = 10_000;

    // emergency allocation on 10,000 income: 9% of 10,000 = 900
    const thisMonthStates = monthBucketStates(
      currentIncome,
      plan,
      { emergency: 200 },
      { emergency: closingFromPrev }
    );
    const emergencyState = thisMonthStates.find((s) => s.bucketId === "emergency")!;

    assert.equal(emergencyState.opening, closingFromPrev);
    assert.equal(emergencyState.allocated, 900);
    assert.equal(emergencyState.spent, 200);
    assert.equal(emergencyState.closing, closingFromPrev + 900 - 200);

    // Dashboard: alloc = opening + allocated = 1000 + 900 = 1900
    // Remaining = closing = 1700
    const displayedAlloc = emergencyState.opening + emergencyState.allocated;
    assert.equal(displayedAlloc, 1_900);
    assert.equal(emergencyState.closing, 1_700);
    assert.equal(displayedAlloc > emergencyState.closing, true);
  });

  it("monthly-reset buckets (give, spend) still show ₦0 of ₦0 in zero-income month", () => {
    // give and spend have carryOver=false in the default plan.
    // Previous month: 100,000 income → give allocation = 8,100, spend allocation = 8,100
    // Current month: income = ₦0 → 0 allocation for all buckets
    // give/spend are monthly-reset, so they do NOT carry over.
    // THIS MONTH give/spend state: opening = 0, allocated = 0, spent = 0, closing = 0
    // Dashboard shows: ₦0 of ₦0

    const currentMonthStates = monthBucketStates(0, plan, {}, {});
    const giveState = currentMonthStates.find((s) => s.bucketId === "give")!;
    const spendState = currentMonthStates.find((s) => s.bucketId === "spend")!;

    assert.equal(giveState.opening, 0);
    assert.equal(giveState.allocated, 0);
    assert.equal(giveState.spent, 0);
    assert.equal(giveState.closing, 0);
    assert.equal(giveState.carryOver, false);

    assert.equal(spendState.opening, 0);
    assert.equal(spendState.allocated, 0);
    assert.equal(spendState.spent, 0);
    assert.equal(spendState.closing, 0);
    assert.equal(spendState.carryOver, false);

    // Dashboard: alloc = opening + allocated = 0 + 0 = 0
    const giveAlloc = giveState.opening + giveState.allocated;
    const spendAlloc = spendState.opening + spendState.allocated;
    assert.equal(giveAlloc, 0);
    assert.equal(spendAlloc, 0);
    assert.equal(giveState.closing, 0);
    assert.equal(spendState.closing, 0);
  });

  it("tithe carries over even in zero-income month (now carryOver=true by default)", () => {
    // Previous month: 100,000 income → tithe allocation = 10,000, ₦0 spent → closing = 10,000
    // Current month: income = ₦0 → tithe allocation = ₦0
    // Since tithe now has carryOver=true by default, it DOES carry over.
    // THIS MONTH tithe state: opening = 10000, allocated = 0, spent = 0, closing = 10000
    // Dashboard shows: ₦10,000 of ₦10,000

    const currentMonthStates = monthBucketStates(0, plan, {}, { tithe: 10_000 });
    const titheState = currentMonthStates.find((s) => s.bucketId === "tithe")!;

    assert.equal(titheState.opening, 10_000);
    assert.equal(titheState.allocated, 0);
    assert.equal(titheState.spent, 0);
    assert.equal(titheState.closing, 10_000);
    assert.equal(titheState.carryOver, true);

    // Dashboard: alloc = opening + allocated = 10000 + 0 = 10000
    const displayedAlloc = titheState.opening + titheState.allocated;
    assert.equal(displayedAlloc, 10_000);
    assert.equal(titheState.closing, 10_000);
  });

  it("carry-over bucket does not reset when current month has no allocation", () => {
    // Previous month leaves emergency = ₦1,000.
    // Current month: income = ₦0 → no allocation.
    // Emergency carry-over is true, so the ₦1,000 carries forward.
    // THIS MONTH state: opening = 1000, allocated = 0, spent = 0, closing = 1000.

    const thisMonthStates = monthBucketStates(0, plan, {}, { emergency: 1_000 });
    const emergencyState = thisMonthStates.find((s) => s.bucketId === "emergency")!;

    assert.equal(emergencyState.opening, 1_000);
    assert.equal(emergencyState.allocated, 0);
    assert.equal(emergencyState.spent, 0);
    assert.equal(emergencyState.closing, 1_000);
    assert.equal(emergencyState.carryOver, true);

    // Dashboard: alloc = 1000 + 0 = 1000, remaining = closing = 1000
    // Format: ₦1,000 of ₦1,000
    assert.equal(emergencyState.opening + emergencyState.allocated, 1_000);
    assert.equal(emergencyState.closing, 1_000);
  });
});
