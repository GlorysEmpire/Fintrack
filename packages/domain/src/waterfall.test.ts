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
it("allocates a fixed amount instead of the percentage", () => {
  const result = allocateWaterfall(100_000, {
    buckets: [
      {
        id: "fixed",
        name: "Fixed",
        emoji: "💰",
        layer: "life_plan",
        percent: 50,
        fixed: 10_000,
        mode: "of_remaining",
        carryOver: false,
        order: 1,
      },
    ],
  });

assert.equal(result.lines[0].allocated, 10_000);});

describe("fixed waterfall allocation", () => {
  it("uses the fixed amount instead of the percentage", () => {
    const result = allocateWaterfall(100_000, {
      buckets: [
        {
          id: "fixed",
          name: "Fixed",
          emoji: "💰",
          layer: "life_plan",
          percent: 50,
          fixed: 10_000,
          mode: "of_remaining",
          carryOver: false,
          order: 1,
        },
      ],
    });

    assert.equal(result.lines[0].allocated, 10_000);
  });
});
describe("layered waterfall", () => {
  it("allocates life plan percentages from the remaining balance", () => {
    const result = allocateWaterfall(100_000, {
      buckets: [
        {
          id: "tax",
          name: "Tax",
          emoji: "🧾",
          layer: "mandatory",
          percent: 10,
          mode: "of_gross",
          carryOver: false,
          order: 0,
        },
        {
          id: "tithe",
          name: "Tithe",
          emoji: "✝️",
          layer: "off_the_top",
          percent: 10,
          mode: "of_remaining",
          carryOver: false,
          order: 1,
        },
        {
          id: "needs",
          name: "Needs",
          emoji: "🏠",
          layer: "life_plan",
          percent: 50,
          mode: "share_remainder",
          carryOver: false,
          order: 2,
        },
        {
          id: "wants",
          name: "Wants",
          emoji: "✨",
          layer: "life_plan",
          percent: 20,
          mode: "share_remainder",
          carryOver: false,
          order: 3,
        },
        {
          id: "savings",
          name: "Savings",
          emoji: "💰",
          layer: "life_plan",
          percent: 30,
          mode: "share_remainder",
          carryOver: false,
          order: 4,
        },
      ],
    });

    const byId = Object.fromEntries(
      result.lines.map((line) => [line.bucketId, line.allocated])
    );

    assert.equal(byId.tax, 10_000);
    assert.equal(byId.tithe, 9_000);
    assert.equal(byId.needs, 40_500);
    assert.equal(byId.wants, 16_200);
    assert.equal(byId.savings, 24_300);
    assert.ok(result.unallocated < 0.01);
  });
});