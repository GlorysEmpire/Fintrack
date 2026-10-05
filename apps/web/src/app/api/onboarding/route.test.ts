/**
 * Setup (onboarding) API: a custom plan built at first launch persists with its
 * layers and fixed amounts, and setup can never be used as a side door to
 * replace an existing plan without the confirmation Plan settings requires.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", async () => ({ prisma: (await import("@/test/db")).testDb }));
vi.mock("@/lib/auth", async () => ({
  getSessionUser: (await import("@/test/harness")).sessionUser,
}));

import type { PlanBucket } from "@fintrack/domain";
import { getUserPlan } from "@/lib/plan";
import {
  cleanup,
  createUser,
  jsonRequest,
  seedPlan,
  signIn,
  testDb,
  titheFirstBuckets,
} from "@/test/harness";
import { POST } from "./route";

afterEach(cleanup);

const post = (body: unknown) => POST(jsonRequest("POST", body));

const customBuckets: PlanBucket[] = [
  { id: "b_rent0001", name: "Rent", emoji: "🏠", layer: "mandatory", percent: 0, fixed: 40_000, mode: "of_gross", carryOver: false, order: 0 },
  { id: "b_cushion1", name: "Cushion", emoji: "🛟", layer: "off_the_top", percent: 15, mode: "of_remaining", carryOver: true, order: 1 },
  { id: "b_living01", name: "Living", emoji: "🛒", layer: "life_plan", percent: 70, mode: "share_remainder", carryOver: false, order: 2 },
  { id: "b_future01", name: "Future", emoji: "🌱", layer: "life_plan", percent: 30, mode: "share_remainder", carryOver: true, order: 3 },
];

describe("POST /api/onboarding", () => {
  it("rejects a signed-out request", async () => {
    signIn(null);
    expect((await post({ path: "skip" })).status).toBe(401);
  });

  it("saves a custom plan with its layers and fixed amounts intact", async () => {
    const user = await createUser({ onboarding: "pending" });
    signIn(user);

    const res = await post({
      path: "custom",
      name: "My first plan",
      buckets: customBuckets,
      customSources: [{ name: "Salary" }],
    });
    expect(res.status).toBe(200);

    const plan = await getUserPlan(user.id);
    expect(plan?.name).toBe("My first plan");
    expect(plan?.buckets).toEqual(customBuckets);
    expect(plan?.templateId).toBeUndefined();

    const after = await testDb.user.findUnique({ where: { id: user.id } });
    expect(after?.onboarding).toBe("completed");
    expect(await testDb.incomeSource.count({ where: { userId: user.id } })).toBe(1);
  });

  it("does not save an invalid custom plan, and setup stays unfinished", async () => {
    const user = await createUser({ onboarding: "pending" });
    signIn(user);

    const broken = customBuckets.map((b) =>
      b.id === "b_future01" ? { ...b, percent: 10 } : b
    ); // life plan adds up to 80%
    const res = await post({ path: "custom", name: "Broken", buckets: broken });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/add up to 80%/);

    expect(await getUserPlan(user.id)).toBeNull();
    const after = await testDb.user.findUnique({ where: { id: user.id } });
    expect(after?.onboarding).toBe("pending");
  });

  it("rejects a custom bucket with an unknown field rather than dropping it", async () => {
    const user = await createUser({ onboarding: "pending" });
    signIn(user);
    const res = await post({
      path: "custom",
      name: "Mine",
      buckets: customBuckets.map((b, i) => (i === 0 ? { ...b, extra: 1 } : b)),
    });
    expect(res.status).toBe(400);
    expect(await getUserPlan(user.id)).toBeNull();
  });

  it("creates a plan from a template as the user's own copy", async () => {
    const user = await createUser({ onboarding: "pending" });
    signIn(user);
    const res = await post({ path: "template", templateId: "tithe_first" });
    expect(res.status).toBe(200);
    const plan = await getUserPlan(user.id);
    expect(plan?.templateId).toBe("tithe_first");
    expect(plan?.buckets).toEqual(titheFirstBuckets());
  });

  it("rejects an unknown template", async () => {
    const user = await createUser({ onboarding: "pending" });
    signIn(user);
    expect((await post({ path: "template", templateId: "nope" })).status).toBe(400);
    expect(await getUserPlan(user.id)).toBeNull();
  });

  it("refuses to replace a plan that already exists", async () => {
    const user = await createUser();
    await seedPlan(user.id);
    signIn(user);
    const before = await getUserPlan(user.id);

    for (const body of [
      { path: "template", templateId: "50_30_20" },
      { path: "default" },
      { path: "custom", name: "Sneaky", buckets: customBuckets },
    ]) {
      const res = await post(body);
      expect(res.status).toBe(409);
    }
    expect(await getUserPlan(user.id)).toEqual(before);
  });

  it("skip leaves the user without a plan", async () => {
    const user = await createUser({ onboarding: "pending" });
    signIn(user);
    expect((await post({ path: "skip" })).status).toBe(200);
    expect(await getUserPlan(user.id)).toBeNull();
    const after = await testDb.user.findUnique({ where: { id: user.id } });
    expect(after?.onboarding).toBe("skipped");
  });
});
