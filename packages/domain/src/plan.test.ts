/**
 * Plan rules: what may be saved, bucket identity, and how stored plans are read.
 *
 * These pin the Week 1 "custom plan" contract: every bucket has a layer,
 * percentages and fixed amounts stay in bounds, the waterfall's own rules hold,
 * and a plan that breaks any of them is reported as not savable.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  allocationModeFor,
  bucketRuleLabel,
  finalizePlanBuckets,
  isValidBucketId,
  newBucketId,
  normalizePlanBuckets,
  sortBucketsByPlanOrder,
  validatePlan,
} from "./plan";
import { allocateWaterfall } from "./waterfall";
import { monthBucketStates } from "./carryover";
import { ALL_TEMPLATES } from "./templates";
import type { PlanBucket, WaterfallLayer } from "./types";

/** Build a bucket the way the plan editor does: the mode follows from the layer. */
function bucket(
  id: string,
  layer: WaterfallLayer,
  amount: { percent: number } | { fixed: number },
  extra: Partial<PlanBucket> = {}
): PlanBucket {
  const fixed = "fixed" in amount;
  return {
    id,
    name: id.charAt(0).toUpperCase() + id.slice(1),
    emoji: "💰",
    layer,
    percent: fixed ? 0 : amount.percent,
    ...(fixed ? { fixed: amount.fixed } : {}),
    mode: allocationModeFor(layer, fixed),
    carryOver: false,
    order: 0,
    ...extra,
  };
}

/** A custom plan that uses all three layers, a fixed amount and percentages. */
function customPlan(): { name: string; buckets: PlanBucket[] } {
  return {
    name: "My plan",
    buckets: [
      bucket("tithe", "mandatory", { percent: 10 }, { order: 0, carryOver: true }),
      bucket("rent", "mandatory", { fixed: 50_000 }, { order: 1 }),
      bucket("emergency", "off_the_top", { percent: 10 }, { order: 2, carryOver: true }),
      bucket("school", "life_plan", { fixed: 20_000 }, { order: 3 }),
      bucket("save", "life_plan", { percent: 60 }, { order: 4, carryOver: true }),
      bucket("spend", "life_plan", { percent: 40 }, { order: 5 }),
    ],
  };
}

function codes(plan: { name: string; buckets: PlanBucket[] }): string[] {
  return validatePlan(plan)
    .issues.filter((i) => i.level === "error")
    .map((i) => i.code);
}

function withBucket(patch: Partial<PlanBucket>, id = "tithe") {
  const plan = customPlan();
  plan.buckets = plan.buckets.map((b) =>
    b.id === id ? ({ ...b, ...patch } as PlanBucket) : b
  );
  return plan;
}

describe("validatePlan — plans that may be saved", () => {
  it("accepts every built-in template with no errors and no warnings", () => {
    for (const template of ALL_TEMPLATES) {
      const result = validatePlan(template.plan);
      assert.deepEqual(result.errors, [], template.id);
      assert.deepEqual(result.warnings, [], template.id);
      assert.equal(result.ok, true, template.id);
    }
  });

  it("accepts a custom plan using all three layers, fixed amounts and percentages", () => {
    const result = validatePlan(customPlan());
    assert.deepEqual(result.errors, []);
    assert.equal(result.ok, true);
  });

  it("accepts life-plan percentages that add up to 100 with decimals", () => {
    const plan = {
      name: "Thirds",
      buckets: [
        bucket("a", "life_plan", { percent: 33.33 }, { order: 0 }),
        bucket("b", "life_plan", { percent: 33.33 }, { order: 1 }),
        bucket("c", "life_plan", { percent: 33.34 }, { order: 2 }),
      ],
    };
    assert.equal(validatePlan(plan).ok, true);
  });
});

describe("validatePlan — plans that must not be saved", () => {
  it("needs a name and at least one bucket", () => {
    assert.ok(codes({ name: "  ", buckets: customPlan().buckets }).includes("plan_name_missing"));
    assert.ok(codes({ name: "Empty", buckets: [] }).includes("no_buckets"));
  });

  it("rejects a bucket with no layer or an unknown layer", () => {
    assert.ok(
      codes(withBucket({ layer: undefined as unknown as WaterfallLayer })).includes(
        "bucket_layer_invalid"
      )
    );
    assert.ok(
      codes(withBucket({ layer: "needs" as unknown as WaterfallLayer })).includes(
        "bucket_layer_invalid"
      )
    );
  });

  it("rejects percentages outside 0–100 and non-numbers", () => {
    for (const percent of [-1, 100.5, 250, Number.NaN, Number.POSITIVE_INFINITY]) {
      assert.ok(
        codes(withBucket({ percent })).includes("bucket_percent_out_of_range"),
        String(percent)
      );
    }
  });

  it("rejects a negative or non-numeric fixed amount", () => {
    for (const fixed of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
      assert.ok(
        codes(withBucket({ fixed }, "rent")).includes("bucket_fixed_invalid"),
        String(fixed)
      );
    }
  });

  it("rejects a fixed amount on a percentage-split bucket (the engine would ignore it)", () => {
    const plan = withBucket({ fixed: 5_000 }, "save"); // save is share_remainder
    assert.ok(codes(plan).includes("bucket_fixed_on_share"));
  });

  it("rejects life-plan percentages that do not add up to 100", () => {
    const plan = withBucket({ percent: 50 }, "save"); // 50 + 40 = 90
    const result = validatePlan(plan);
    assert.equal(result.ok, false);
    assert.ok(codes(plan).includes("life_plan_not_100"));
    assert.match(result.errors.join(" "), /add up to 90%/);
  });

  it("rejects a plan with no life-plan percentage bucket (income would be left unassigned)", () => {
    const plan = {
      name: "Only obligations",
      buckets: [bucket("tithe", "mandatory", { percent: 10 })],
    };
    assert.ok(codes(plan).includes("life_plan_missing"));
  });

  it("rejects mandatory buckets that claim more than 100% of income", () => {
    // Audit scenario D: two buckets of 60% "of gross" used to validate as OK
    const plan = {
      name: "Too much",
      buckets: [
        bucket("a", "mandatory", { percent: 60 }, { order: 0 }),
        bucket("b", "mandatory", { percent: 60 }, { order: 1 }),
        bucket("rest", "life_plan", { percent: 100 }, { order: 2 }),
      ],
    };
    const result = validatePlan(plan);
    assert.equal(result.ok, false);
    assert.ok(codes(plan).includes("mandatory_over_100"));
    assert.match(result.errors.join(" "), /120%/);
  });

  it("rejects duplicate bucket ids and duplicate names", () => {
    const dupId = customPlan();
    dupId.buckets[1] = { ...dupId.buckets[1], id: "tithe" };
    assert.ok(codes(dupId).includes("bucket_id_duplicate"));

    const dupName = customPlan();
    dupName.buckets[1] = { ...dupName.buckets[1], name: "  TITHE " };
    assert.ok(codes(dupName).includes("bucket_name_duplicate"));
  });

  it("rejects ids that are not safe lookup keys", () => {
    for (const id of ["", "Rent Money", "UPPER", "constructor", "__proto__", "a".repeat(41)]) {
      assert.equal(isValidBucketId(id), false, id);
      assert.ok(codes(withBucket({ id }, "rent")).includes("bucket_id_invalid"), id);
    }
    for (const id of ["tithe", "50_30_20", "b_0k3x9zq1", "side-hustle"]) {
      assert.equal(isValidBucketId(id), true, id);
    }
  });

  it("rejects an active bucket that would never receive money", () => {
    assert.ok(codes(withBucket({ percent: 0 })).includes("bucket_no_allocation"));
    assert.ok(codes(withBucket({ fixed: 0 }, "rent")).includes("bucket_no_allocation"));
  });

  it("rejects an allocation rule that does not belong to the bucket's layer", () => {
    // A percentage-split bucket outside the life plan would swallow everything left
    assert.ok(codes(withBucket({ mode: "share_remainder" })).includes("bucket_mode_mismatch"));
    assert.ok(codes(withBucket({ mode: "of_gross" }, "emergency")).includes("bucket_mode_mismatch"));
    // A life-plan bucket is either a fixed amount or a percentage of the rest
    assert.ok(codes(withBucket({ mode: "of_remaining" }, "save")).includes("bucket_mode_mismatch"));
  });

  it("points each bucket error at the bucket and field it belongs to", () => {
    const issue = validatePlan(withBucket({ percent: 140 })).issues.find(
      (i) => i.code === "bucket_percent_out_of_range"
    );
    assert.equal(issue?.bucketId, "tithe");
    assert.equal(issue?.field, "percent");
  });

  it("still adds life-plan percentages correctly when a bucket has an unrelated error", () => {
    const plan = withBucket({ name: "" }, "save"); // 60 + 40 is still 100
    const errorCodes = codes(plan);
    assert.ok(errorCodes.includes("bucket_name_missing"));
    assert.equal(errorCodes.includes("life_plan_not_100"), false);
  });
});

describe("validatePlan — warnings and archived buckets", () => {
  it("warns (does not block) when mandatory buckets take all income", () => {
    const plan = {
      name: "All in",
      buckets: [
        bucket("tax", "mandatory", { percent: 100 }, { order: 0 }),
        bucket("rest", "life_plan", { percent: 100 }, { order: 1 }),
      ],
    };
    const result = validatePlan(plan);
    assert.equal(result.ok, true);
    assert.equal(result.warnings.length, 1);
  });

  it("does not apply allocation rules to archived buckets", () => {
    const plan = customPlan();
    plan.buckets.push(
      bucket("old", "life_plan", { percent: 0 }, { order: 9, archived: true })
    );
    assert.equal(validatePlan(plan).ok, true);
  });

  it("does not count archived buckets as the plan's only bucket", () => {
    const plan = {
      name: "Nothing active",
      buckets: [bucket("old", "life_plan", { percent: 100 }, { archived: true })],
    };
    assert.ok(codes(plan).includes("no_buckets"));
  });
});

describe("waterfall with custom plans", () => {
  const incomes = [0, 1, 999, 34_000, 52_000, 100_000, 1_234_567.89];

  it("assigns every unit of income to a bucket for any valid plan", () => {
    const plans = [...ALL_TEMPLATES.map((t) => t.plan), customPlan()];
    for (const plan of plans) {
      assert.equal(validatePlan(plan).ok, true);
      for (const gross of incomes) {
        const result = allocateWaterfall(gross, plan);
        assert.ok(Math.abs(result.allocatedTotal - gross) < 1e-6, `${plan.name} @ ${gross}`);
        assert.ok(result.unallocated < 1e-6);
        for (const line of result.lines) assert.ok(line.allocated >= 0);
      }
    }
  });

  it("fills fixed amounts in order and never hands out more than came in", () => {
    const plan = customPlan();
    const byId = (gross: number) =>
      Object.fromEntries(
        allocateWaterfall(gross, plan).lines.map((l) => [l.bucketId, l.allocated])
      );

    // Plenty of income: tithe 10% of gross, rent fixed, emergency 10% of the rest,
    // school fixed, then 60/40 of what is left.
    const rich = byId(200_000);
    assert.equal(rich.tithe, 20_000);
    assert.equal(rich.rent, 50_000);
    assert.equal(rich.emergency, 13_000);
    assert.equal(rich.school, 20_000);
    assert.equal(rich.save, 58_200);
    assert.equal(rich.spend, 38_800);

    // Low income: rent takes what is left after tithe and nothing is invented.
    const poor = byId(30_000);
    assert.equal(poor.tithe, 3_000);
    assert.equal(poor.rent, 27_000);
    assert.equal(poor.emergency, 0);
    assert.equal(poor.school, 0);
    assert.equal(poor.save, 0);
    assert.equal(poor.spend, 0);
  });

  it("caps a percentage of gross at what is left after an earlier fixed amount", () => {
    const plan = {
      buckets: [
        bucket("rent", "mandatory", { fixed: 50_000 }, { order: 0 }),
        bucket("tithe", "mandatory", { percent: 10 }, { order: 1 }),
        bucket("rest", "life_plan", { percent: 100 }, { order: 2 }),
      ],
    };
    const result = allocateWaterfall(52_000, plan);
    const byId = Object.fromEntries(result.lines.map((l) => [l.bucketId, l.allocated]));
    assert.equal(byId.rent, 50_000);
    assert.equal(byId.tithe, 2_000); // 10% would be 5,200 but only 2,000 is left
    assert.equal(byId.rest, 0);
    assert.equal(result.allocatedTotal, 52_000);
  });

  it("never allocates more than gross even for an invalid plan", () => {
    const plan = {
      buckets: [
        bucket("a", "mandatory", { percent: 60 }, { order: 0 }),
        bucket("b", "mandatory", { percent: 60 }, { order: 1 }),
      ],
    };
    const result = allocateWaterfall(100_000, plan);
    assert.equal(result.allocatedTotal, 100_000);
  });

  it("is deterministic: the same plan and income always give the same split", () => {
    const plan = customPlan();
    const first = allocateWaterfall(87_654.32, plan);
    const shuffled = { buckets: [...plan.buckets].reverse() };
    assert.deepEqual(allocateWaterfall(87_654.32, plan), first);
    // Array order does not matter; only each bucket's `order` does.
    assert.deepEqual(
      Object.fromEntries(allocateWaterfall(87_654.32, shuffled).lines.map((l) => [l.bucketId, l.allocated])),
      Object.fromEntries(first.lines.map((l) => [l.bucketId, l.allocated]))
    );
  });

  it("a fixed amount is applied once to the month's total income, not once per payment", () => {
    const plan = { id: "p", emergencyCarryOverDefault: true, ...customPlan() };
    const oneGo = monthBucketStates(100_000, plan, {});
    const rent = oneGo.find((s) => s.bucketId === "rent")!;
    // Two 50,000 payments in one month are one 100,000 month: rent is still 50,000.
    assert.equal(rent.allocated, 50_000);
  });
});

describe("bucket identity", () => {
  it("generates ids that are valid, unique and never derived from a name", () => {
    const taken = new Set(["tithe", "spend"]);
    const ids = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const id = newBucketId([...taken, ...ids]);
      assert.equal(isValidBucketId(id), true, id);
      assert.equal(taken.has(id), false);
      assert.equal(ids.has(id), false);
      ids.add(id);
    }
  });

  it("avoids an id that is already in use", () => {
    const fixedRandom = () => 0.5;
    const first = newBucketId([], fixedRandom);
    const second = newBucketId([first], fixedRandom);
    assert.notEqual(second, first);
    assert.equal(isValidBucketId(second), true);
  });

  it("renaming a bucket keeps its id, so its spending stays attached", () => {
    const plan = { id: "p", emergencyCarryOverDefault: true, ...customPlan() };
    const renamed = {
      ...plan,
      buckets: plan.buckets.map((b) =>
        b.id === "spend" ? { ...b, name: "Daily living", emoji: "🛒" } : b
      ),
    };
    const spent = { spend: 12_000 };
    const before = monthBucketStates(200_000, plan, spent).find((s) => s.bucketId === "spend")!;
    const after = monthBucketStates(200_000, renamed, spent).find((s) => s.bucketId === "spend")!;
    assert.deepEqual(after, before);
    assert.equal(after.spent, 12_000);
  });
});

describe("reading and saving stored plans", () => {
  it("derives the layer of a legacy bucket saved without one, exactly as the engine does", () => {
    const legacy = [
      { id: "tithe", name: "Tithe", emoji: "✝️", percent: 10, mode: "of_gross", carryOver: true, order: 0 },
      { id: "emergency", name: "Emergency", emoji: "🆘", percent: 10, mode: "of_remaining", carryOver: true, order: 1 },
      { id: "spend", name: "Spend", emoji: "💸", percent: 100, mode: "share_remainder", carryOver: false, order: 2 },
    ];
    const buckets = normalizePlanBuckets(legacy);
    assert.deepEqual(
      buckets.map((b) => b.layer),
      ["mandatory", "off_the_top", "life_plan"]
    );
    // Reading it this way does not change a single allocation
    assert.deepEqual(
      allocateWaterfall(100_000, { buckets }).lines.map((l) => l.allocated),
      allocateWaterfall(100_000, { buckets: legacy as unknown as PlanBucket[] }).lines.map((l) => l.allocated)
    );
  });

  it("keeps layer, fixed and archived, and drops junk", () => {
    const buckets = normalizePlanBuckets([
      { id: "rent", name: "Rent", emoji: "🏠", layer: "mandatory", percent: 0, fixed: 50_000, mode: "of_gross", carryOver: false, order: 0, extra: "ignored" },
      { id: "old", name: "Old", emoji: "", layer: "life_plan", percent: 10, mode: "share_remainder", carryOver: false, order: 1, archived: true },
      { id: "rent", name: "Duplicate id" },
      { name: "No id" },
      null,
      "nonsense",
    ]);
    assert.equal(buckets.length, 2);
    assert.equal(buckets[0].fixed, 50_000);
    assert.equal(buckets[0].layer, "mandatory");
    assert.equal(buckets[1].archived, true);
    assert.equal("extra" in buckets[0], false);
    assert.deepEqual(normalizePlanBuckets("not an array"), []);
  });

  it("saves buckets in fill order with archived ones last, and trims names", () => {
    const saved = finalizePlanBuckets([
      bucket("spend", "life_plan", { percent: 40 }, { order: 7, name: "  Spend " }),
      bucket("old", "mandatory", { percent: 5 }, { order: 0, archived: true }),
      bucket("tithe", "mandatory", { percent: 10 }, { order: 3 }),
      bucket("save", "life_plan", { percent: 60 }, { order: 2 }),
    ]);
    assert.deepEqual(saved.map((b) => b.id), ["tithe", "save", "spend", "old"]);
    assert.deepEqual(saved.map((b) => b.order), [0, 1, 2, 3]);
    assert.equal(saved[2].name, "Spend");
    assert.equal("archived" in saved[0], false);
    assert.equal(saved[3].archived, true);
  });

  it("orders buckets by layer first, then the user's own order", () => {
    const ordered = sortBucketsByPlanOrder([
      bucket("spend", "life_plan", { percent: 100 }, { order: 0 }),
      bucket("emergency", "off_the_top", { percent: 10 }, { order: 1 }),
      bucket("tithe", "mandatory", { percent: 10 }, { order: 2 }),
    ]);
    assert.deepEqual(ordered.map((b) => b.id), ["tithe", "emergency", "spend"]);
  });

  it("describes a bucket's rule without engine vocabulary", () => {
    assert.equal(bucketRuleLabel(bucket("t", "mandatory", { percent: 10 }), "NGN"), "10% of your total income");
    assert.equal(bucketRuleLabel(bucket("r", "mandatory", { fixed: 50_000 }), "NGN"), "₦50,000 fixed each month");
    assert.equal(bucketRuleLabel(bucket("e", "off_the_top", { percent: 12.5 }), "NGN"), "12.5% of what is left after Mandatory");
    assert.equal(bucketRuleLabel(bucket("s", "life_plan", { percent: 40 }), "NGN"), "40% of what is left for your life plan");
  });
});
