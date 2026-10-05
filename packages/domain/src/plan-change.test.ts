/**
 * Plan change safety.
 *
 * History is rebuilt with the CURRENT plan (no plan versions in the MVP), so a
 * change to how income is split or carried over recalculates every past month.
 * These tests pin: what counts as such a change, what the user is shown before
 * confirming, that buckets with history are archived rather than erased, and
 * that transactions themselves are never touched.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  allocationModeFor,
  checkBucketRemovals,
  describePlanChanges,
  draftFromTemplate,
  planRulesChanged,
  validatePlan,
} from "./plan";
import { balanceChanged, planChangeImpact } from "./plan-change";
import {
  allTimeBucketStates,
  bucketStatesForMonth,
  openingBalancesForMonth,
  transactionTotals,
  type MoneyTx,
} from "./money";
import { allocateWaterfall } from "./waterfall";
import {
  FIFTY_THIRTY_TWENTY,
  PAY_YOURSELF_FIRST_TEMPLATE,
  TITHE_FIRST_TEMPLATE,
} from "./templates";
import type { BudgetPlan, PlanBucket } from "./types";

const fx = { NGN: 1, USD: 1580, GBP: 1990, EUR: 1710 };

function titheFirst(): BudgetPlan {
  return {
    id: "p1",
    name: "Tithe-first waterfall",
    templateId: "tithe_first",
    emergencyCarryOverDefault: true,
    buckets: TITHE_FIRST_TEMPLATE.plan.buckets.map((b) => ({ ...b })),
  };
}

function change(
  plan: BudgetPlan,
  id: string,
  patch: Partial<PlanBucket>
): BudgetPlan {
  return {
    ...plan,
    buckets: plan.buckets.map((b) => (b.id === id ? { ...b, ...patch } : b)),
  };
}

function tx(type: "i" | "e", amount: number, date: Date, bucketId?: string): MoneyTx {
  return { type, amount, currency: "NGN", date, ...(bucketId ? { bucketId } : {}) };
}

const AUG = new Date(2026, 7, 12);
const SEP = new Date(2026, 8, 12);
const OCT_NOW = new Date(2026, 9, 5);

// September: ₦34,000 income → Tithe ₦3,400; ₦2,400 tithe paid → ₦1,000 left.
const history: MoneyTx[] = [tx("i", 34_000, SEP), tx("e", 2_400, SEP, "tithe")];

/** Freeze a history so any attempt to modify a transaction throws. */
function frozen(txs: MoneyTx[]): MoneyTx[] {
  return Object.freeze(txs.map((t) => Object.freeze({ ...t }))) as MoneyTx[];
}

describe("planRulesChanged — what counts as changing the plan's rules", () => {
  const plan = titheFirst();

  it("a rename or a new emoji is not a rule change", () => {
    assert.equal(planRulesChanged(plan, change(plan, "spend", { name: "Living", emoji: "🏠" })), false);
  });

  it("a different percentage, fixed amount or carry-over is a rule change", () => {
    assert.equal(planRulesChanged(plan, change(plan, "tithe", { percent: 5 })), true);
    assert.equal(planRulesChanged(plan, change(plan, "tithe", { fixed: 3_000 })), true);
    assert.equal(planRulesChanged(plan, change(plan, "tithe", { carryOver: false })), true);
  });

  it("adding, archiving or moving a bucket to another layer is a rule change", () => {
    const added: BudgetPlan = {
      ...plan,
      buckets: [
        ...plan.buckets,
        {
          id: "b_new",
          name: "Rent",
          emoji: "🏠",
          layer: "mandatory",
          percent: 0,
          fixed: 50_000,
          mode: "of_gross",
          carryOver: false,
          order: 6,
        },
      ],
    };
    assert.equal(planRulesChanged(plan, added), true);
    assert.equal(planRulesChanged(plan, change(plan, "give", { archived: true })), true);
    assert.equal(
      planRulesChanged(
        plan,
        change(plan, "emergency", { layer: "mandatory", mode: allocationModeFor("mandatory", false) })
      ),
      true
    );
  });

  it("reordering percentage-split buckets is not a rule change (they share one pot)", () => {
    const reordered = change(change(plan, "invest", { order: 5 }), "spend", { order: 2 });
    assert.equal(planRulesChanged(plan, reordered), false);
    assert.deepEqual(
      Object.fromEntries(allocateWaterfall(100_000, reordered).lines.map((l) => [l.bucketId, l.allocated])),
      Object.fromEntries(allocateWaterfall(100_000, plan).lines.map((l) => [l.bucketId, l.allocated]))
    );
  });

  it("reordering fixed buckets IS a rule change (each takes from what the last one left)", () => {
    const rent: PlanBucket = { id: "rent", name: "Rent", emoji: "🏠", layer: "mandatory", percent: 0, fixed: 50_000, mode: "of_gross", carryOver: false, order: 0 };
    const fees: PlanBucket = { id: "fees", name: "Fees", emoji: "🎓", layer: "mandatory", percent: 0, fixed: 30_000, mode: "of_gross", carryOver: false, order: 1 };
    const rest: PlanBucket = { id: "rest", name: "Rest", emoji: "💸", layer: "life_plan", percent: 100, mode: "share_remainder", carryOver: false, order: 2 };
    const a = { buckets: [rent, fees, rest] };
    const b = { buckets: [{ ...rent, order: 1 }, { ...fees, order: 0 }, rest] };
    assert.equal(planRulesChanged(a, b), true);
    // …and it really does change who gets paid in a lean month
    assert.equal(allocateWaterfall(60_000, a).lines.find((l) => l.bucketId === "fees")!.allocated, 10_000);
    assert.equal(allocateWaterfall(60_000, b).lines.find((l) => l.bucketId === "fees")!.allocated, 30_000);
  });

  it("having no plan before counts as a change", () => {
    assert.equal(planRulesChanged(null, plan), true);
  });
});

describe("buckets with history are archived, never erased", () => {
  const plan = titheFirst();
  const usage = { tithe: 12, spend: 40 };

  it("refuses to remove a bucket that transactions still point at", () => {
    const withoutTithe = { buckets: plan.buckets.filter((b) => b.id !== "tithe") };
    const result = checkBucketRemovals(plan, withoutTithe, usage);
    assert.equal(result.ok, false);
    assert.deepEqual(result.blocked, [{ bucketId: "tithe", name: "Tithe", count: 12 }]);
    assert.match(result.errors[0], /Archive it instead/);
  });

  it("allows archiving that bucket, and removing a bucket nothing uses", () => {
    const archived = change(plan, "tithe", { archived: true });
    assert.equal(checkBucketRemovals(plan, archived, usage).ok, true);

    const withoutGive = { buckets: plan.buckets.filter((b) => b.id !== "give") };
    assert.equal(checkBucketRemovals(plan, withoutGive, usage).ok, true);
  });

  it("an archived bucket keeps its identity but takes no income and has no balance", () => {
    const archived = change(change(plan, "give", { archived: true }), "spend", { percent: 20 });
    assert.equal(validatePlan(archived).ok, true);

    const lines = allocateWaterfall(100_000, archived).lines;
    assert.equal(lines.some((l) => l.bucketId === "give"), false);
    assert.equal(lines.reduce((s, l) => s + l.allocated, 0), 100_000);

    const states = allTimeBucketStates(history, archived, "NGN", fx, {}, OCT_NOW);
    assert.equal(states.some((s) => s.bucketId === "give"), false);
    // The bucket is still in the plan, so old transactions keep their name
    assert.equal(archived.buckets.find((b) => b.id === "give")!.name, "Give");
  });

  it("spending in an archived bucket still counts in the real totals", () => {
    const withGiving = [...history, tx("e", 500, SEP, "give")];
    const archived = change(change(titheFirst(), "give", { archived: true }), "spend", { percent: 20 });
    // The ₦500 given in September is still part of what actually happened…
    assert.deepEqual(
      transactionTotals(withGiving, "NGN", fx),
      { income: 34_000, expenses: 2_900, net: 31_100 }
    );
    // …it is just no longer shown against an active bucket.
    assert.equal(
      allTimeBucketStates(withGiving, archived, "NGN", fx, {}, OCT_NOW).some((s) => s.bucketId === "give"),
      false
    );
  });
});

describe("draftFromTemplate — switching template keeps history's buckets", () => {
  it("archives used buckets the new template does not have and drops unused ones", () => {
    const draft = draftFromTemplate(FIFTY_THIRTY_TWENTY, titheFirst(), { tithe: 3, spend: 9 });
    const active = draft.buckets.filter((b) => !b.archived).map((b) => b.id);
    const archived = draft.buckets.filter((b) => b.archived).map((b) => b.id);
    assert.deepEqual(active, ["needs", "wants", "savings"]);
    assert.deepEqual(archived.sort(), ["spend", "tithe"]);
    assert.equal(draft.templateId, "50_30_20");
    assert.equal(validatePlan(draft).ok, true);
    // …so saving it does not trip the "do not erase history" guard
    assert.equal(checkBucketRemovals(titheFirst(), draft, { tithe: 3, spend: 9 }).ok, true);
  });

  it("a bucket the template also has simply continues as that bucket", () => {
    const draft = draftFromTemplate(PAY_YOURSELF_FIRST_TEMPLATE, titheFirst(), { spend: 9, tithe: 1 });
    const spend = draft.buckets.find((b) => b.id === "spend")!;
    assert.equal(spend.archived, undefined);
    assert.equal(spend.name, "Living"); // the template's definition wins
    assert.equal(draft.buckets.find((b) => b.id === "tithe")!.archived, true);
  });

  it("is only a draft: the current plan and the template are left untouched", () => {
    const current = titheFirst();
    const snapshot = JSON.stringify(current);
    const templateSnapshot = JSON.stringify(FIFTY_THIRTY_TWENTY);
    draftFromTemplate(FIFTY_THIRTY_TWENTY, current, { tithe: 1 });
    assert.equal(JSON.stringify(current), snapshot);
    assert.equal(JSON.stringify(FIFTY_THIRTY_TWENTY), templateSnapshot);
  });

  it("with no current plan it is just the template", () => {
    const draft = draftFromTemplate(TITHE_FIRST_TEMPLATE, null, {});
    assert.deepEqual(
      draft.buckets.map((b) => b.id),
      TITHE_FIRST_TEMPLATE.plan.buckets.map((b) => b.id)
    );
  });
});

describe("planChangeImpact — what the user is shown before confirming", () => {
  it("shows that turning off Tithe carry-over empties today's Tithe balance", () => {
    const before = titheFirst();
    const after = change(before, "tithe", { carryOver: false });
    const impact = planChangeImpact({ txs: history, before, after, base: "NGN", fx, now: OCT_NOW });

    assert.equal(impact.rulesChanged, true);
    assert.equal(impact.transactionCount, 2);
    assert.equal(impact.monthsAffected, 1);

    const tithe = impact.buckets.find((b) => b.bucketId === "tithe")!;
    assert.equal(tithe.before, 1_000);
    assert.equal(tithe.after, 0);
    assert.equal(balanceChanged(tithe), true);

    const emergency = impact.buckets.find((b) => b.bucketId === "emergency")!;
    assert.equal(emergency.before, 3_060);
    assert.equal(emergency.after, 3_060);
    assert.equal(balanceChanged(emergency), false);

    assert.deepEqual(impact.changes, [
      "✝️ Tithe now resets each month instead of carrying over.",
    ]);
  });

  it("shows the knock-on effect of a percentage change on every bucket", () => {
    const before = titheFirst();
    const after = change(before, "tithe", { percent: 5 });
    const impact = planChangeImpact({ txs: history, before, after, base: "NGN", fx, now: OCT_NOW });
    const byId = Object.fromEntries(impact.buckets.map((b) => [b.bucketId, b]));

    // September is recalculated: Tithe gets 1,700 but 2,400 was really paid, so
    // the month ends 700 short and October opens at 0 instead of 1,000.
    assert.equal(byId.tithe.before, 1_000);
    assert.equal(byId.tithe.after, 0);
    // More flows down: emergency was 10% of 30,600, now 10% of 32,300.
    assert.equal(byId.emergency.before, 3_060);
    assert.equal(byId.emergency.after, 3_230);
    assert.match(impact.changes[0], /10% of your total income becomes 5% of your total income/);
  });

  it("lists a bucket that stops being active with nothing after the change", () => {
    const before = titheFirst();
    const after = change(change(before, "give", { archived: true }), "spend", { percent: 20 });
    const impact = planChangeImpact({ txs: history, before, after, base: "NGN", fx, now: OCT_NOW });
    const give = impact.buckets.find((b) => b.bucketId === "give")!;
    assert.equal(give.after, null);
    assert.equal(balanceChanged(give), true);
    assert.ok(impact.changes.some((c) => /Give is archived/.test(c)));
  });

  it("a rename changes no rules and no balances", () => {
    const before = titheFirst();
    const after = change(before, "spend", { name: "Daily living" });
    const impact = planChangeImpact({ txs: history, before, after, base: "NGN", fx, now: OCT_NOW });
    assert.equal(impact.rulesChanged, false);
    assert.equal(impact.buckets.some(balanceChanged), false);
    assert.deepEqual(impact.changes, ["💸 Spend is renamed to 💸 Daily living."]);
  });

  it("describes added and removed buckets", () => {
    const before = titheFirst();
    const after: BudgetPlan = {
      ...before,
      buckets: [
        ...before.buckets.filter((b) => b.id !== "give").map((b) => (b.id === "spend" ? { ...b, percent: 20 } : b)),
        { id: "b_rent", name: "Rent", emoji: "🏠", layer: "mandatory", percent: 0, fixed: 50_000, mode: "of_gross", carryOver: false, order: 9 },
      ],
    };
    const lines = describePlanChanges(before, after, "NGN");
    assert.ok(lines.includes("New bucket: 🏠 Rent (₦50,000 fixed each month)."));
    assert.ok(lines.includes("🎁 Give is removed."));
  });
});

describe("a plan change never touches transactions", () => {
  const multiMonth = frozen([
    tx("i", 10_000, AUG),
    tx("e", 300, AUG, "spend"),
    tx("i", 34_000, SEP),
    tx("e", 2_400, SEP, "tithe"),
    tx("i", 50_000, new Date(2026, 9, 2)),
  ]);

  it("recalculates derived numbers without modifying a single transaction", () => {
    const snapshot = JSON.stringify(multiMonth);
    const before = titheFirst();
    const after = change(change(before, "tithe", { percent: 5 }), "emergency", { carryOver: false });

    // Every one of these would throw on a frozen transaction if it tried to write
    planChangeImpact({ txs: multiMonth, before, after, base: "NGN", fx, now: OCT_NOW });
    allTimeBucketStates(multiMonth, after, "NGN", fx, {}, OCT_NOW);
    openingBalancesForMonth(multiMonth, after, "NGN", fx, OCT_NOW);
    bucketStatesForMonth(multiMonth, after, "NGN", fx, SEP);

    assert.equal(JSON.stringify(multiMonth), snapshot);
  });

  it("what actually happened (income, expenses, net) does not depend on the plan", () => {
    // Totals are computed from transactions alone: no plan is involved, so no
    // plan change can move them.
    assert.deepEqual(transactionTotals(multiMonth, "NGN", fx), {
      income: 94_000,
      expenses: 2_700,
      net: 91_300,
    });
  });

  it("the new plan is applied to every past month, not just from now on", () => {
    const before = titheFirst();
    const after = change(before, "tithe", { percent: 5 });
    const augBefore = bucketStatesForMonth(multiMonth, before, "NGN", fx, AUG).find((s) => s.bucketId === "tithe")!;
    const augAfter = bucketStatesForMonth(multiMonth, after, "NGN", fx, AUG).find((s) => s.bucketId === "tithe")!;
    assert.equal(augBefore.allocated, 1_000);
    assert.equal(augAfter.allocated, 500);
  });
});
