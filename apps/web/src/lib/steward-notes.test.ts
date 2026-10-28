/**
 * Steward's own Inbox notes: one heads-up when an expense takes a bucket to
 * running low or uses it up (once per bucket per month, never pointing at
 * another bucket), and one recap when a month is packed up.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", async () => ({ prisma: (await import("@/test/db")).testDb }));

import { allocateWaterfall } from "@fintrack/domain";
import { cleanup, createUser, midMonth, seedPlan, seedTx, testDb, titheFirstBuckets } from "@/test/harness";
import { createTransaction } from "./transactions";
import { ensureMonthPacked } from "./month-close";

afterEach(cleanup);

async function setup() {
  const user = await createUser({ onboarding: "completed" });
  await seedPlan(user.id);
  await seedTx(user.id, { type: "i", amount: 100_000, date: new Date() });
  const spend = allocateWaterfall(100_000, { buckets: titheFirstBuckets() }).lines.find((l) => l.bucketId === "spend")!.allocated;
  const session = { id: user.id, baseCurrency: user.baseCurrency, fxRates: user.fxRates };
  const spendNote = (amount: number) =>
    createTransaction(session, { type: "e", amount, currency: "NGN", bucketId: "spend" });
  const notes = () => testDb.inboxMessage.findMany({ where: { userId: user.id, kind: "plan_tip" } });
  return { user, spend, spendNote, notes };
}

describe("low and empty bucket heads-ups", () => {
  it("writes one heads-up when a bucket first runs low, and none while it stays low", async () => {
    const { spend, spendNote, notes } = await setup();
    expect((await spendNote(spend * 0.5)).status).toBe("ok");
    expect(await notes()).toHaveLength(0); // still comfortable
    expect((await spendNote(spend * 0.38)).status).toBe("ok"); // 12% left
    const first = await notes();
    expect(first).toHaveLength(1);
    expect(first[0].title).toBe("Spend is running low");
    expect(first[0].body).toMatch(/left of/);
    expect((await spendNote(spend * 0.01)).status).toBe("ok");
    expect(await notes()).toHaveLength(1); // not again
  });

  it("says when the bucket is used up, without pointing at another bucket", async () => {
    const { spend, spendNote, notes } = await setup();
    expect((await spendNote(spend)).status).toBe("ok");
    const all = await notes();
    expect(all.map((n) => n.title)).toEqual(["Spend is used up"]);
    expect(all[0].body).not.toMatch(/another bucket|other bucket|borrow|take from/i);
  });

  it("a refused expense writes nothing", async () => {
    const { spend, spendNote, notes } = await setup();
    expect((await spendNote(spend * 2)).status).toBe("blocked");
    expect(await notes()).toHaveLength(0);
  });
});

describe("monthly recap", () => {
  it("is written once, when last month is packed, with plain totals", async () => {
    const user = await createUser({ onboarding: "completed" });
    await seedPlan(user.id);
    await seedTx(user.id, { type: "i", amount: 200_000, date: midMonth(-1) });
    await seedTx(user.id, { type: "e", amount: 50_000, bucketId: "spend", date: midMonth(-1) });
    expect((await ensureMonthPacked(user.id)).status).toBe("packed");
    await ensureMonthPacked(user.id);
    const recaps = await testDb.inboxMessage.findMany({ where: { userId: user.id, kind: "monthly_review" } });
    expect(recaps).toHaveLength(1);
    expect(recaps[0].title).toMatch(/^Your \w+ \d{4} recap$/);
    expect(recaps[0].body).toContain("₦200,000");
    expect(recaps[0].body).toContain("₦50,000");
    expect(recaps[0].body).toContain("You kept ₦150,000");
  });

  it("is skipped for a month with nothing recorded", async () => {
    const user = await createUser({ onboarding: "completed" });
    await seedPlan(user.id);
    await ensureMonthPacked(user.id);
    expect(await testDb.inboxMessage.count({ where: { userId: user.id, kind: "monthly_review" } })).toBe(0);
  });
});
