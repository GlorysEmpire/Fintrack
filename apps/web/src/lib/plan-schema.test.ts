/**
 * The plan's wire shape. Regression for the audit finding that both plan
 * schemas dropped `layer` and `fixed`, so a custom plan lost them on its way
 * to the database.
 */
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { planBucketSchema, planFields, toPlanBuckets } from "./plan-schema";

const bucket = {
  id: "rent",
  name: "Rent",
  emoji: "🏠",
  layer: "mandatory",
  percent: 0,
  fixed: 50_000,
  mode: "of_gross",
  carryOver: false,
  order: 0,
};

describe("plan bucket schema", () => {
  it("keeps layer, fixed and archived", () => {
    const parsed = planBucketSchema.parse({ ...bucket, archived: true });
    expect(parsed.layer).toBe("mandatory");
    expect(parsed.fixed).toBe(50_000);
    expect(parsed.archived).toBe(true);
    const [domain] = toPlanBuckets([parsed]);
    expect(domain).toEqual({ ...bucket, archived: true });
  });

  it("rejects a field it does not know instead of silently dropping it", () => {
    const result = planBucketSchema.safeParse({ ...bucket, colour: "red" });
    expect(result.success).toBe(false);
  });

  it("requires a layer", () => {
    const { layer: _layer, ...withoutLayer } = bucket;
    expect(planBucketSchema.safeParse(withoutLayer).success).toBe(false);
    expect(planBucketSchema.safeParse({ ...bucket, layer: "needs" }).success).toBe(false);
  });

  it("treats fixed: null and archived: false as absent", () => {
    const parsed = planBucketSchema.parse({ ...bucket, fixed: null, archived: false });
    const [domain] = toPlanBuckets([parsed]);
    expect("fixed" in domain).toBe(false);
    expect("archived" in domain).toBe(false);
  });

  it("rejects numbers that are not real numbers", () => {
    expect(planBucketSchema.safeParse({ ...bucket, percent: "10" }).success).toBe(false);
    expect(planBucketSchema.safeParse({ ...bucket, percent: Number.NaN }).success).toBe(false);
    expect(planBucketSchema.safeParse({ ...bucket, fixed: Number.POSITIVE_INFINITY }).success).toBe(false);
  });

  it("is the same shape for a whole plan", () => {
    const plan = z.object(planFields).strict();
    expect(plan.safeParse({ name: "Mine", buckets: [bucket] }).success).toBe(true);
    expect(plan.safeParse({ name: "Mine", buckets: [bucket], surprise: 1 }).success).toBe(false);
  });
});
