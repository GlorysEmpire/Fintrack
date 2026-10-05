/**
 * Plan settings API: a custom plan can be built and persists exactly, invalid
 * plans are never saved, buckets with history are archived not erased, and a
 * change that recalculates past months is refused until it is confirmed.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", async () => ({ prisma: (await import("@/test/db")).testDb }));
vi.mock("@/lib/auth", async () => ({
  getSessionUser: (await import("@/test/harness")).sessionUser,
}));

import {
  TITHE_FIRST_TEMPLATE,
  allocationModeFor,
  type PlanBucket,
  type WaterfallLayer,
} from "@fintrack/domain";
import { getUserPlan, savePlanFromTemplate } from "@/lib/plan";
import {
  cleanup,
  createUser,
  jsonRequest,
  midMonth,
  seedPlan,
  seedTx,
  signIn,
  testDb,
  titheFirstBuckets,
  transactionsOf,
} from "@/test/harness";
import { GET, PATCH } from "./route";

afterEach(cleanup);

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

/** A plan nobody would get from a template: all three layers, fixed + percent */
function customBuckets(): PlanBucket[] {
  return [
    bucket("tithe", "mandatory", { percent: 10 }, { order: 0, carryOver: true }),
    bucket("b_rent0001", "mandatory", { fixed: 50_000 }, { order: 1, name: "Rent", emoji: "🏠" }),
    bucket("emergency", "off_the_top", { percent: 10 }, { order: 2, carryOver: true }),
    bucket("b_school01", "life_plan", { fixed: 20_000 }, { order: 3, name: "School fees" }),
    bucket("save", "life_plan", { percent: 60 }, { order: 4, carryOver: true }),
    bucket("spend", "life_plan", { percent: 40 }, { order: 5 }),
  ];
}

const patch = (body: unknown) => PATCH(jsonRequest("PATCH", body));

async function storedBuckets(userId: string): Promise<PlanBucket[]> {
  const row = await testDb.budgetPlan.findUnique({ where: { userId } });
  return row ? (JSON.parse(row.bucketsJson) as PlanBucket[]) : [];
}

describe("PATCH /api/settings/plan — building a custom plan", () => {
  it("rejects a signed-out request", async () => {
    signIn(null);
    const res = await patch({ name: "Mine", buckets: customBuckets() });
    expect(res.status).toBe(401);
  });

  it("saves a custom plan and reads back exactly what was built", async () => {
    const user = await createUser({ onboarding: "skipped" });
    signIn(user);

    const res = await patch({ name: "  My own plan ", buckets: customBuckets() });
    expect(res.status).toBe(200);

    const stored = await storedBuckets(user.id);
    // Layer, fixed amount, carry-over and identity all survive the round trip
    expect(stored).toEqual(customBuckets());

    const plan = await getUserPlan(user.id);
    expect(plan?.name).toBe("My own plan");
    expect(plan?.buckets).toEqual(customBuckets());
    expect(plan?.buckets.find((b) => b.id === "b_rent0001")?.fixed).toBe(50_000);
    expect(plan?.buckets.find((b) => b.id === "b_rent0001")?.layer).toBe("mandatory");

    // GET returns the same plan
    const got = await (await GET()).json();
    expect(got.plan.buckets).toEqual(customBuckets());

    // Having a plan completes setup
    const after = await testDb.user.findUnique({ where: { id: user.id } });
    expect(after?.onboarding).toBe("completed");
  });

  it("renumbers the order it was sent in, and keeps ids stable through a rename", async () => {
    const user = await createUser();
    signIn(user);
    await patch({ name: "Mine", buckets: customBuckets() });

    const renamed = customBuckets().map((b) =>
      b.id === "b_rent0001" ? { ...b, name: "House rent", emoji: "🔑" } : b
    );
    const res = await patch({ name: "Mine", buckets: renamed });
    expect(res.status).toBe(200);

    const stored = await storedBuckets(user.id);
    expect(stored.map((b) => b.id)).toEqual(customBuckets().map((b) => b.id));
    expect(stored.find((b) => b.id === "b_rent0001")?.name).toBe("House rent");
  });

  it("never saves an invalid plan", async () => {
    const user = await createUser();
    signIn(user);
    await seedPlan(user.id);
    const before = await storedBuckets(user.id);

    const cases: PlanBucket[][] = [
      // Life plan adds up to 90%
      customBuckets().map((b) => (b.id === "save" ? { ...b, percent: 50 } : b)),
      // Mandatory percentages over 100%
      [
        bucket("a", "mandatory", { percent: 60 }, { order: 0 }),
        bucket("b", "mandatory", { percent: 60 }, { order: 1 }),
        bucket("rest", "life_plan", { percent: 100 }, { order: 2 }),
      ],
      // Negative fixed amount
      customBuckets().map((b) => (b.id === "b_rent0001" ? { ...b, fixed: -5 } : b)),
      // Percentage out of bounds
      customBuckets().map((b) => (b.id === "tithe" ? { ...b, percent: 140 } : b)),
      // Duplicate identity
      customBuckets().map((b) => (b.id === "emergency" ? { ...b, id: "tithe" } : b)),
      // A fixed amount the engine would silently ignore
      customBuckets().map((b) => (b.id === "save" ? { ...b, fixed: 1_000 } : b)),
    ];

    for (const buckets of cases) {
      const res = await patch({ name: "Broken", buckets, confirmHistoryChange: true });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.ok).toBe(false);
      expect(data.errors.length).toBeGreaterThan(0);
    }
    expect(await storedBuckets(user.id)).toEqual(before);
  });

  it("rejects a bucket with no layer, and an unknown field, instead of dropping them", async () => {
    const user = await createUser();
    signIn(user);

    const { layer: _layer, ...noLayer } = customBuckets()[0];
    const missing = await patch({ name: "Mine", buckets: [noLayer, ...customBuckets().slice(1)] });
    expect(missing.status).toBe(400);

    const extra = await patch({
      name: "Mine",
      buckets: customBuckets().map((b, i) => (i === 0 ? { ...b, surprise: true } : b)),
    });
    expect(extra.status).toBe(400);
    expect((await extra.json()).error).toMatch(/surprise/);

    expect(await testDb.budgetPlan.findUnique({ where: { userId: user.id } })).toBeNull();
  });

  it("only ever writes the signed-in user's plan", async () => {
    const mine = await createUser();
    const theirs = await createUser();
    await seedPlan(theirs.id);
    const theirsBefore = await storedBuckets(theirs.id);

    signIn(mine);
    await patch({ name: "Mine", buckets: customBuckets() });

    expect(await storedBuckets(theirs.id)).toEqual(theirsBefore);
    expect((await storedBuckets(mine.id)).length).toBe(6);
  });
});

describe("PATCH /api/settings/plan — changing a plan that has history", () => {
  // Last month: ₦34,000 income → Tithe ₦3,400; ₦2,400 tithe paid → ₦1,000 carried.
  async function userWithHistory() {
    const user = await createUser();
    await seedPlan(user.id);
    await seedTx(user.id, { type: "i", amount: 34_000, date: midMonth(-1) });
    await seedTx(user.id, { type: "e", amount: 2_400, date: midMonth(-1), bucketId: "tithe" });
    signIn(user);
    return user;
  }
  const noTitheCarry = () =>
    titheFirstBuckets().map((b) => (b.id === "tithe" ? { ...b, carryOver: false } : b));

  it("refuses to save until the change is confirmed, and shows what it does", async () => {
    const user = await userWithHistory();
    const before = await storedBuckets(user.id);

    const res = await patch({ name: "Tithe-first waterfall", buckets: noTitheCarry() });
    expect(res.status).toBe(409);
    const data = await res.json();
    expect(data.needsConfirmation).toBe(true);
    expect(data.kind).toBe("plan_change");
    expect(data.impact.transactionCount).toBe(2);
    expect(data.impact.monthsAffected).toBe(1);

    const tithe = data.impact.buckets.find((b: { bucketId: string }) => b.bucketId === "tithe");
    expect(tithe.before).toBe(1_000);
    expect(tithe.after).toBe(0);
    expect(data.impact.changes).toEqual([
      "✝️ Tithe now resets each month instead of carrying over.",
    ]);

    // Nothing was saved
    expect(await storedBuckets(user.id)).toEqual(before);
  });

  it("saves once confirmed, and rebuilds the cached opening balances", async () => {
    const user = await userWithHistory();
    const res = await patch({
      name: "Tithe-first waterfall",
      buckets: noTitheCarry(),
      confirmHistoryChange: true,
    });
    expect(res.status).toBe(200);

    const stored = await storedBuckets(user.id);
    expect(stored.find((b) => b.id === "tithe")?.carryOver).toBe(false);

    // Derived state follows the new plan straight away: no stale cache
    const row = await testDb.budgetPlan.findUnique({ where: { userId: user.id } });
    const openings = JSON.parse(row!.openingBalancesJson);
    expect(openings.tithe).toBeUndefined();
    expect(openings.emergency).toBe(3_060);
  });

  it("does not touch a single transaction, confirmed or not", async () => {
    const user = await userWithHistory();
    const before = await transactionsOf(user.id);

    await patch({ name: "Tithe-first waterfall", buckets: noTitheCarry() });
    expect(await transactionsOf(user.id)).toEqual(before);

    await patch({
      name: "Tithe-first waterfall",
      buckets: noTitheCarry(),
      confirmHistoryChange: true,
    });
    expect(await transactionsOf(user.id)).toEqual(before);
  });

  it("a rename needs no confirmation: it changes no numbers", async () => {
    const user = await userWithHistory();
    const renamed = titheFirstBuckets().map((b) =>
      b.id === "spend" ? { ...b, name: "Daily living" } : b
    );
    const res = await patch({ name: "My waterfall", buckets: renamed });
    expect(res.status).toBe(200);
    expect((await storedBuckets(user.id)).find((b) => b.id === "spend")?.name).toBe("Daily living");
  });

  it("a rule change with no transactions yet needs no confirmation", async () => {
    const user = await createUser();
    await seedPlan(user.id);
    signIn(user);
    const res = await patch({ name: "Tithe-first waterfall", buckets: noTitheCarry() });
    expect(res.status).toBe(200);
  });

  it("will not remove a bucket that transactions point at, even when confirmed", async () => {
    const user = await userWithHistory();
    const before = await storedBuckets(user.id);
    // Drop Tithe entirely and give its share to nobody (plan itself stays valid)
    const withoutTithe = titheFirstBuckets().filter((b) => b.id !== "tithe");

    const res = await patch({
      name: "Tithe-first waterfall",
      buckets: withoutTithe,
      confirmHistoryChange: true,
    });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/Archive it instead/);
    expect(data.issues[0].code).toBe("bucket_has_history");
    expect(await storedBuckets(user.id)).toEqual(before);
  });

  it("archives that bucket instead: its identity and transactions stay", async () => {
    const user = await userWithHistory();
    const txBefore = await transactionsOf(user.id);
    const archived = titheFirstBuckets().map((b) =>
      b.id === "tithe" ? { ...b, archived: true } : b
    );

    const res = await patch({
      name: "Tithe-first waterfall",
      buckets: archived,
      confirmHistoryChange: true,
    });
    expect(res.status).toBe(200);

    const tithe = (await storedBuckets(user.id)).find((b) => b.id === "tithe");
    expect(tithe?.archived).toBe(true);
    expect(tithe?.name).toBe("Tithe");
    expect(await transactionsOf(user.id)).toEqual(txBefore);
  });

  it("removes a bucket nothing has ever used", async () => {
    const user = await userWithHistory(); // history is on Tithe only
    const withoutGive = titheFirstBuckets()
      .filter((b) => b.id !== "give")
      .map((b) => (b.id === "spend" ? { ...b, percent: 20 } : b));
    const res = await patch({
      name: "Tithe-first waterfall",
      buckets: withoutGive,
      confirmHistoryChange: true,
    });
    expect(res.status).toBe(200);
    expect((await storedBuckets(user.id)).some((b) => b.id === "give")).toBe(false);
  });

  it("counts a recurring rule as a reason a bucket can not be removed", async () => {
    const user = await createUser();
    await seedPlan(user.id);
    await testDb.recurringRule.create({
      data: {
        userId: user.id,
        type: "e",
        amount: 5_000,
        bucketId: "give",
        cadence: "monthly",
        nextRunAt: new Date(Date.now() + 86_400_000),
      },
    });
    signIn(user);
    const withoutGive = titheFirstBuckets()
      .filter((b) => b.id !== "give")
      .map((b) => (b.id === "spend" ? { ...b, percent: 20 } : b));
    const res = await patch({ name: "Tithe-first waterfall", buckets: withoutGive });
    expect(res.status).toBe(400);
  });
});

describe("a saved plan is the user's own copy", () => {
  it("does not change when a template is changed in code afterwards", async () => {
    const user = await createUser();
    await savePlanFromTemplate(user.id, "tithe_first");
    const saved = await getUserPlan(user.id);

    const tithe = TITHE_FIRST_TEMPLATE.plan.buckets.find((b) => b.id === "tithe")!;
    const original = { percent: tithe.percent, carryOver: tithe.carryOver };
    try {
      // Simulate a later code change to the template
      tithe.percent = 25;
      tithe.carryOver = false;
      const reloaded = await getUserPlan(user.id);
      expect(reloaded).toEqual(saved);
      expect(reloaded?.buckets.find((b) => b.id === "tithe")?.percent).toBe(10);
    } finally {
      tithe.percent = original.percent;
      tithe.carryOver = original.carryOver;
    }
  });

  it("no longer forces carry-over on a bucket because it is called Emergency", async () => {
    const user = await createUser();
    signIn(user);
    const buckets = titheFirstBuckets().map((b) =>
      b.id === "emergency" ? { ...b, carryOver: false } : b
    );
    const res = await patch({ name: "Mine", buckets });
    expect(res.status).toBe(200);
    expect((await storedBuckets(user.id)).find((b) => b.id === "emergency")?.carryOver).toBe(false);
  });
});
