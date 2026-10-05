/**
 * Recording transactions: dates, ownership, and the rule that a bucket is
 * blocked at zero (an expense it can not cover is refused and not saved).
 */
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", async () => ({ prisma: (await import("@/test/db")).testDb }));
vi.mock("@/lib/auth", async () => ({
  getSessionUser: (await import("@/test/harness")).sessionUser,
}));

import { monthKeyOf } from "@fintrack/domain";
import { toDateInputValue } from "@/lib/format-date";
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
} from "@/test/harness";
import { POST } from "./route";

afterEach(cleanup);

const post = (body: unknown) => POST(jsonRequest("POST", body));

/** Signed-in user with the tithe-first plan and ₦100,000 income this month (Spend = ₦8,100) */
async function funded() {
  const user = await createUser();
  await seedPlan(user.id);
  await seedTx(user.id, { type: "i", amount: 100_000 });
  signIn(user);
  return user;
}

const expense = (extra: Record<string, unknown> = {}) => ({
  type: "e",
  amount: 1_000,
  currency: "NGN",
  bucketId: "spend",
  category: "food",
  ...extra,
});

const expensesOf = (userId: string) =>
  testDb.transaction.findMany({ where: { userId, type: "e" } });

describe("POST /api/transactions — recording", () => {
  it("rejects unauthenticated requests", async () => {
    signIn(null);
    const res = await post({ type: "i", amount: 10, currency: "NGN" });
    expect(res.status).toBe(401);
  });

  it("creates an income row for the signed-in user, against their own source", async () => {
    const user = await createUser();
    const source = await testDb.incomeSource.create({
      data: { userId: user.id, name: "Salary" },
    });
    signIn(user);

    const res = await post({ type: "i", amount: 50_000, currency: "NGN", sourceId: source.id });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);

    const [row] = await testDb.transaction.findMany({ where: { userId: user.id } });
    expect(row.type).toBe("i");
    expect(row.amount).toBe(50_000);
    expect(row.sourceId).toBe(source.id);
  });

  it("will not attach income to somebody else's source", async () => {
    const other = await createUser();
    const theirs = await testDb.incomeSource.create({
      data: { userId: other.id, name: "Their salary" },
    });
    const user = await createUser();
    signIn(user);

    const res = await post({ type: "i", amount: 50_000, sourceId: theirs.id });
    expect(res.status).toBe(400);
    expect(await testDb.transaction.count({ where: { userId: user.id } })).toBe(0);
  });

  it("creates an expense against a bucket", async () => {
    const user = await funded();
    const res = await post(expense({ note: "coffee" }));
    expect(res.status).toBe(200);
    const [row] = await expensesOf(user.id);
    expect(row.bucketId).toBe("spend");
    expect(row.amount).toBe(1_000);
    expect(row.note).toBe("coffee");
  });

  it("logs an expense with no bucket when the user has no plan", async () => {
    const user = await createUser({ onboarding: "skipped" });
    signIn(user);
    const res = await post(expense({ bucketId: null }));
    expect(res.status).toBe(200);
    const [row] = await expensesOf(user.id);
    expect(row.bucketId).toBeNull();
  });

  it("only accepts a bucket that is an active bucket in the user's plan", async () => {
    const user = await createUser();
    await seedPlan(
      user.id,
      titheFirstBuckets().map((b) => (b.id === "give" ? { ...b, archived: true } : b))
    );
    await seedTx(user.id, { type: "i", amount: 100_000 });
    signIn(user);

    for (const bucketId of ["nope", "constructor", "__proto__", "give", null]) {
      const res = await post(expense({ bucketId, amount: 1 }));
      expect(res.status).toBe(400);
    }
    expect(await expensesOf(user.id)).toHaveLength(0);
  });

  it("rejects a field it does not know, and nonsense amounts", async () => {
    const user = await funded();
    expect((await post(expense({ createdAt: "2020-01-01T00:00:00.000Z" }))).status).toBe(400);
    // The old confirm-and-save switch no longer exists
    expect((await post(expense({ confirmOverspend: true }))).status).toBe(400);
    expect((await post(expense({ amount: 0 }))).status).toBe(400);
    expect((await post(expense({ amount: -5 }))).status).toBe(400);
    expect((await post(expense({ category: "made_up" }))).status).toBe(400);
    expect(await expensesOf(user.id)).toHaveLength(0);
  });

  it("still requires a reason for a cross-bucket spend, then records it as an override", async () => {
    const user = await funded();
    // Tithe payment category drawn from Spend
    const blocked = await post(expense({ category: "tithe_payment" }));
    expect(blocked.status).toBe(400);
    expect((await blocked.json()).crossBucket).toBe(true);

    const ok = await post(expense({ category: "tithe_payment", note: "paid from pocket" }));
    expect(ok.status).toBe(200);
    const [row] = await expensesOf(user.id);
    expect(row.override).toBe(true);
    expect(row.reason).toBe("paid from pocket");
    const notes = await testDb.inboxMessage.findMany({ where: { userId: user.id } });
    expect(notes).toHaveLength(1);
    expect(notes[0].kind).toBe("override_coach");
  });
});

describe("POST /api/transactions — dates", () => {
  it("with no date, records the moment it was logged", async () => {
    const user = await funded();
    const before = Date.now();
    await post(expense());
    const [row] = await expensesOf(user.id);
    expect(row.date.getTime()).toBeGreaterThanOrEqual(before - 1_000);
    expect(row.date.getTime()).toBeLessThanOrEqual(Date.now() + 1_000);
  });

  it("files a transaction under an earlier day the user picks", async () => {
    const user = await funded();
    // Last month needs money in the bucket too: Spend gets ₦8,100 of this
    await seedTx(user.id, { type: "i", amount: 100_000, date: midMonth(-1, undefined, 1) });
    const day = toDateInputValue(midMonth(-1));
    const res = await post(expense({ date: day }));
    expect(res.status).toBe(200);

    const [row] = await expensesOf(user.id);
    expect(row.date.toISOString()).toBe(`${day}T12:00:00.000Z`);
    expect(toDateInputValue(row.date)).toBe(day);
    expect(monthKeyOf(row.date)).toBe(day.slice(0, 7));
    // It was RECORDED now, whatever day it is filed under
    expect(Date.now() - row.createdAt.getTime()).toBeLessThan(60_000);
  });

  it("refuses a date in the future and a date that is not a date", async () => {
    const user = await funded();
    const tomorrow = toDateInputValue(new Date(Date.now() + 36 * 60 * 60 * 1000));
    const future = await post(expense({ date: tomorrow }));
    expect(future.status).toBe(400);
    expect((await future.json()).error).toMatch(/future/);

    expect((await post(expense({ date: "2026-02-30" }))).status).toBe(400);
    expect((await post(expense({ date: "yesterday" }))).status).toBe(400);
    expect(await expensesOf(user.id)).toHaveLength(0);
  });
});

describe("POST /api/transactions — a bucket is blocked at zero", () => {
  const suggestsAnotherBucket =
    /another|other bucket|different bucket|instead|split|move|transfer|withdraw|choose|pick/i;

  it("refuses an expense the bucket can not cover, and saves nothing", async () => {
    const user = await funded();
    const res = await post(expense({ amount: 10_000, note: "car repair" }));

    expect(res.status).toBe(422);
    const data = await res.json();
    expect(data.ok).toBe(false);
    expect(data.blocked).toBe(true);
    expect(data.shortfall).toEqual({
      bucketId: "spend",
      bucketName: "Spend",
      available: 8_100,
      requested: 10_000,
    });
    // It says what is available against what was asked for…
    expect(data.error).toBe(
      "Spend has ₦8,100 available. That does not cover ₦10,000. Nothing was recorded."
    );
    // …and never points at another bucket
    expect(suggestsAnotherBucket.test(data.error)).toBe(false);

    expect(await expensesOf(user.id)).toHaveLength(0);
    expect(await testDb.inboxMessage.count({ where: { userId: user.id } })).toBe(0);
  });

  it("there is no way to push it through", async () => {
    const user = await funded();
    for (const extra of [{ confirmOverspend: true }, { confirm: true }, { force: true }, { override: true }]) {
      const res = await post(expense({ amount: 10_000, ...extra }));
      expect([400, 422]).toContain(res.status);
    }
    expect(await expensesOf(user.id)).toHaveLength(0);
  });

  it("allows spending right down to zero, then blocks the next naira", async () => {
    const user = await funded();
    expect((await post(expense({ amount: 8_100 }))).status).toBe(200);

    const next = await post(expense({ amount: 1 }));
    expect(next.status).toBe(422);
    expect((await next.json()).error).toBe(
      "Spend has nothing available. That does not cover ₦1. Nothing was recorded."
    );
    expect(await expensesOf(user.id)).toHaveLength(1);
  });

  it("blocks spending from a bucket that has received nothing yet", async () => {
    const user = await createUser();
    await seedPlan(user.id);
    signIn(user);

    const res = await post(expense({ amount: 500 }));
    expect(res.status).toBe(422);
    const data = await res.json();
    expect(data.shortfall.available).toBe(0);
    expect(suggestsAnotherBucket.test(data.error)).toBe(false);
    expect(await expensesOf(user.id)).toHaveLength(0);
  });

  it("checks in the user's base currency", async () => {
    const user = await funded();
    // $10 at 1,580 = ₦15,800 against ₦8,100 available in Spend
    const res = await post(expense({ amount: 10, currency: "USD" }));
    expect(res.status).toBe(422);
    const data = await res.json();
    expect(data.shortfall.requested).toBe(15_800);
    expect(data.error).toContain("₦15,800");
    expect(await expensesOf(user.id)).toHaveLength(0);
  });

  it("counts money carried over from last month as available", async () => {
    const user = await createUser();
    await seedPlan(user.id);
    // Last month: Tithe got ₦3,400, ₦2,400 was paid → ₦1,000 carries into this month
    await seedTx(user.id, { type: "i", amount: 34_000, date: midMonth(-1) });
    await seedTx(user.id, { type: "e", amount: 2_400, date: midMonth(-1), bucketId: "tithe" });
    signIn(user);

    const fits = await post(expense({ amount: 600, bucketId: "tithe", category: "tithe_payment" }));
    expect(fits.status).toBe(200);

    const over = await post(expense({ amount: 500, bucketId: "tithe", category: "tithe_payment" }));
    expect(over.status).toBe(422);
    expect((await over.json()).shortfall.available).toBe(400);
  });

  it("checks a past-dated expense against what the bucket had on that date", async () => {
    const user = await createUser();
    await seedPlan(user.id);
    await seedTx(user.id, { type: "i", amount: 34_000, date: midMonth(-1, undefined, 1) }); // Spend last month: 2,754
    await seedTx(user.id, { type: "i", amount: 100_000 }); // Spend this month: 8,100
    signIn(user);

    const lastMonth = await post(expense({ amount: 3_000, date: toDateInputValue(midMonth(-1)) }));
    expect(lastMonth.status).toBe(422);
    const data = await lastMonth.json();
    expect(data.shortfall.available).toBe(2_754);
    expect(data.error).toBe(
      "Spend has ₦2,754 available for that date. That does not cover ₦3,000. Nothing was recorded."
    );

    const thisMonth = await post(expense({ amount: 3_000 }));
    expect(thisMonth.status).toBe(200);
  });

  it("a past-dated expense can not empty a carry-over bucket that was spent since", async () => {
    const user = await createUser();
    await seedPlan(user.id);
    // Last month Tithe had ₦1,000 left; it carried over and was spent this month.
    await seedTx(user.id, { type: "i", amount: 34_000, date: midMonth(-1, undefined, 1) });
    await seedTx(user.id, { type: "e", amount: 2_400, date: midMonth(-1, undefined, 2), bucketId: "tithe" });
    await seedTx(user.id, { type: "e", amount: 1_000, bucketId: "tithe" });
    signIn(user);

    const res = await post(
      expense({ amount: 500, bucketId: "tithe", category: "tithe_payment", date: toDateInputValue(midMonth(-1)) })
    );
    expect(res.status).toBe(422);
    expect((await res.json()).shortfall.available).toBe(0);
  });
});
