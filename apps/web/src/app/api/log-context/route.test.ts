/**
 * The log sheet's data: signed-out is refused, and each bucket's remaining
 * balance matches what the Overview shows (carry-over, spending and income
 * logged this month included), with accounts and sources of the user only.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", async () => ({ prisma: (await import("@/test/db")).testDb }));
vi.mock("@/lib/auth", async () => ({
  getSessionUser: (await import("@/test/harness")).sessionUser,
}));

import { allocateWaterfall } from "@fintrack/domain";
import { cleanup, createUser, seedPlan, seedTx, signIn, testDb, titheFirstBuckets } from "@/test/harness";
import { GET } from "./route";

afterEach(cleanup);

describe("GET /api/log-context", () => {
  it("refuses a signed-out request", async () => {
    signIn(null);
    expect((await GET()).status).toBe(401);
  });

  it("returns the plan, this month's remaining per bucket and the income logged", async () => {
    const user = await createUser({ onboarding: "completed" });
    await seedPlan(user.id);
    await seedTx(user.id, { type: "i", amount: 100_000, date: new Date() });
    await seedTx(user.id, { type: "e", amount: 1_000, bucketId: "spend", date: new Date() });
    signIn(user);

    const body = await (await GET()).json();
    expect(body.ok).toBe(true);
    const ctx = body.context;
    expect(ctx.baseCurrency).toBe(user.baseCurrency);
    expect(ctx.plan.buckets.length).toBeGreaterThan(0);
    expect(ctx.monthIncome).toBe(100_000);
    const allocated = (id: string) =>
      allocateWaterfall(100_000, { buckets: titheFirstBuckets() }).lines.find((l) => l.bucketId === id)!.allocated;
    expect(ctx.bucketRemaining.spend).toBeCloseTo(allocated("spend") - 1_000, 2);
    expect(ctx.bucketRemaining.tithe).toBeCloseTo(allocated("tithe"), 2);
  });

  it("never includes another user's accounts or income sources", async () => {
    const me = await createUser({ onboarding: "completed" });
    const other = await createUser({ onboarding: "completed" });
    await seedPlan(me.id);
    await testDb.incomeSource.create({ data: { userId: other.id, name: "Theirs" } });
    signIn(me);
    const body = await (await GET()).json();
    expect(body.context.sources).toEqual([]);
    expect(body.context.accounts).toEqual([]);
  });
});
