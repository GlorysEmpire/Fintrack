import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { allocateWaterfall } from "./waterfall";
import { TITHE_FIRST_TEMPLATE } from "./templates";
import { monthBucketStates, nextOpeningBalances } from "./carryover";

describe("tithe-first waterfall", () => {
  it("matches the 100_000 example", () => {
    const plan = { buckets: TITHE_FIRST_TEMPLATE.plan.buckets };
    const w = allocateWaterfall(100_000, plan);
    const byId = Object.fromEntries(w.lines.map((l) => [l.bucketId, l.allocated]));

    assert.equal(byId.tithe, 10_000);
    assert.equal(byId.emergency, 9_000);
    assert.equal(byId.invest, 32_400);
    assert.equal(byId.give, 8_100);
    assert.equal(byId.save, 32_400);
    assert.equal(byId.spend, 8_100);
    assert.ok(w.unallocated < 0.01);
  });
});

describe("emergency carry-over", () => {
  it("rolls positive closing into next opening when carryOver is true", () => {
    const plan = {
      id: "p1",
      name: "Test",
      emergencyCarryOverDefault: true,
      buckets: TITHE_FIRST_TEMPLATE.plan.buckets,
    };
    const states = monthBucketStates(100_000, plan, { emergency: 1_000 }, {});
    const em = states.find((s) => s.bucketId === "emergency")!;
    assert.equal(em.allocated, 9_000);
    assert.equal(em.spent, 1_000);
    assert.equal(em.closing, 8_000);

    const next = nextOpeningBalances(states);
    assert.equal(next.emergency, 8_000);
    assert.equal(next.tithe, undefined); // tithe does not carry by default
  });
});
