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
    assert.equal(next.tithe, 10_000); // tithe carries over by template default (10% of 100,000, no spend)
  });

  it("does not carry over when the bucket's carryOver is false", () => {
    const plan = {
      id: "p1",
      name: "Test",
      emergencyCarryOverDefault: true,
      buckets: TITHE_FIRST_TEMPLATE.plan.buckets.map((b) =>
        b.id === "tithe" ? { ...b, carryOver: false } : b
      ),
    };
    const states = monthBucketStates(100_000, plan, { tithe: 2_400 }, {});
    const t = states.find((s) => s.bucketId === "tithe")!;
    assert.equal(t.opening, 0);
    assert.equal(t.allocated, 10_000);
    assert.equal(t.spent, 2_400);
    assert.equal(t.closing, 7_600);

    const next = nextOpeningBalances(states);
    assert.equal(next.tithe, undefined); // carryOver=false → no roll
  });

  it("carries over tithe when template sets carryOver=true", () => {
    const plan = {
      id: "p1",
      name: "Test",
      emergencyCarryOverDefault: true,
      buckets: TITHE_FIRST_TEMPLATE.plan.buckets,
    };
    // Previous month: 10,000 tithe allocated, 2,400 spent → closing 7,600
    const prev = monthBucketStates(100_000, plan, { tithe: 2_400 }, {});
    const pt = prev.find((s) => s.bucketId === "tithe")!;
    assert.equal(pt.allocated, 10_000);
    assert.equal(pt.spent, 2_400);
    assert.equal(pt.closing, 7_600);

    const nextOpen = nextOpeningBalances(prev);
    assert.equal(nextOpen.tithe, 7_600);

    // Next month: 0 income → 0 allocation, 0 spent, carry-over opening kept
    const next = monthBucketStates(0, plan, {}, { tithe: 7_600 });
    const nt = next.find((s) => s.bucketId === "tithe")!;
    assert.equal(nt.opening, 7_600);
    assert.equal(nt.allocated, 0);
    assert.equal(nt.spent, 0);
    assert.equal(nt.closing, 7_600);
  });

  it("produces the exact ₦3,400 tithe allocation / ₦2,400 spend / ₦1,000 carry scenario", () => {
    const plan = {
      id: "p1",
      name: "Test",
      emergencyCarryOverDefault: true,
      buckets: TITHE_FIRST_TEMPLATE.plan.buckets,
    };

    // Tithe is 10% of gross in this plan, so gross=34,000 yields 3,400 tithe.
    const grossForTithe3400 = 34_000;
    const prev = monthBucketStates(grossForTithe3400, plan, { tithe: 2_400 }, {});
    const pt = prev.find((s) => s.bucketId === "tithe")!;
    assert.equal(pt.allocated, 3_400);
    assert.equal(pt.spent, 2_400);
    assert.equal(pt.closing, 1_000);

    const nextOpen = nextOpeningBalances(prev);
    assert.equal(nextOpen.tithe, 1_000);

    // Next month: 0 income → 0 allocation, 0 spent
    const next = monthBucketStates(0, plan, {}, { tithe: 1_000 });
    const nt = next.find((s) => s.bucketId === "tithe")!;
    assert.equal(nt.opening, 1_000);
    assert.equal(nt.allocated, 0);
    assert.equal(nt.spent, 0);
    assert.equal(nt.closing, 1_000);
  });

  it("spending carries over the tithe balance correctly reduces it", () => {
    const plan = {
      id: "p1",
      name: "Test",
      emergencyCarryOverDefault: true,
      buckets: TITHE_FIRST_TEMPLATE.plan.buckets,
    };
    // Start with 1,000 carry-over from previous month
    const states = monthBucketStates(0, plan, { tithe: 600 }, { tithe: 1_000 });
    const t = states.find((s) => s.bucketId === "tithe")!;
    assert.equal(t.opening, 1_000);
    assert.equal(t.allocated, 0);
    assert.equal(t.spent, 600);
    assert.equal(t.closing, 400);

    const nextOpen = nextOpeningBalances(states);
    assert.equal(nextOpen.tithe, 400);
  });

  it("carry-over persists across more than one month", () => {
    const plan = {
      id: "p1",
      name: "Test",
      emergencyCarryOverDefault: true,
      buckets: TITHE_FIRST_TEMPLATE.plan.buckets,
    };
    // Month 1: 34,000 income, 2,400 tithe spend → closing 1,000
    const m1 = monthBucketStates(34_000, plan, { tithe: 2_400 }, {});
    const t1 = m1.find((s) => s.bucketId === "tithe")!;
    assert.equal(t1.allocated, 3_400);
    assert.equal(t1.spent, 2_400);
    assert.equal(t1.closing, 1_000);

    const open2 = nextOpeningBalances(m1);
    assert.equal(open2.tithe, 1_000);

    // Month 2: 0 income, no spend → full carry-over preserved
    const m2 = monthBucketStates(0, plan, {}, open2);
    const t2 = m2.find((s) => s.bucketId === "tithe")!;
    assert.equal(t2.opening, 1_000);
    assert.equal(t2.allocated, 0);
    assert.equal(t2.spent, 0);
    assert.equal(t2.closing, 1_000);

    const open3 = nextOpeningBalances(m2);
    assert.equal(open3.tithe, 1_000);

    // Month 3: 5,000 income (new tithe allocation 500) + spend 300 on top of carry-over
    const m3 = monthBucketStates(5_000, plan, { tithe: 300 }, open3);
    const t3 = m3.find((s) => s.bucketId === "tithe")!;
    assert.equal(t3.opening, 1_000);
    assert.equal(t3.allocated, 500);
    assert.equal(t3.spent, 300);
    assert.equal(t3.closing, 1_200);
  });
});

describe("additional waterfall tests", () => {
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
});