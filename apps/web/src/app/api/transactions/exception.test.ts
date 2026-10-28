/**
 * The bucket exception: an expense bigger than its bucket may be funded from
 * another bucket, but only explicitly, for exactly the shortfall, with a
 * reason, and never silently or without a real expense behind it.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", async () => ({ prisma: (await import("@/test/db")).testDb }));
vi.mock("@/lib/auth", async () => ({
  getSessionUser: (await import("@/test/harness")).sessionUser,
}));

import { fakeDb, usingPostgres } from "@/test/db";
import { cleanup, createUser, jsonRequest, params, seedPlan, seedTx, signIn, testDb } from "@/test/harness";
import { POST } from "./route";
import { DELETE, PATCH } from "./[id]/route";
import { GET as dashboard } from "../dashboard/route";
import { buildExport } from "@/lib/export";
import { getPerformance } from "@/lib/performance";
import { getStewardView } from "@/lib/steward";

afterEach(cleanup);

const post = (body: unknown) => POST(jsonRequest("POST", body));
const expense = (extra: Record<string, unknown> = {}) => ({
  type: "e", amount: 9_000, currency: "NGN", bucketId: "spend", category: "food", ...extra,
});

/** Tithe-first plan with ₦100,000 this month: Spend holds ₦8,100, so ₦9,000 is ₦900 short */
async function funded() {
  const user = await createUser();
  await seedPlan(user.id);
  await seedTx(user.id, { type: "i", amount: 100_000 });
  signIn(user);
  return user;
}

const snapshot = async () => (await (await dashboard()).json()).snapshot;
const bucket = (snap: { buckets: { bucketId: string; closing: number; moved: number; spent: number }[] }, id: string) =>
  snap.buckets.find((b) => b.bucketId === id)!;

describe("the blocked answer offers a way forward, without pointing anywhere itself", () => {
  it("lists the buckets that could fund exactly the shortfall", async () => {
    await funded();
    const res = await post(expense());
    expect(res.status).toBe(422);
    const { shortfall } = await res.json();
    expect(shortfall.short).toBe(900);
    const ids = shortfall.options.map((o: { bucketId: string }) => o.bucketId);
    expect(ids).not.toContain("spend");
    expect(ids).toContain("save");
    const emergency = shortfall.options.find((o: { bucketId: string }) => o.bucketId === "emergency");
    if (emergency) expect(emergency.protected).toBe(true);
  });
});

describe("approving an exception", () => {
  it("records the expense in its own bucket and funds exactly the shortfall from the chosen one", async () => {
    const user = await funded();
    const before = await snapshot();
    const res = await post(expense({ fundFrom: { bucketId: "save", reason: "Car repair could not wait" } }));
    expect(res.status).toBe(200);

    const tx = (await testDb.transaction.findMany({ where: { userId: user.id, type: "e" } }))[0];
    expect(tx).toMatchObject({ amount: 9_000, bucketId: "spend" });
    const r = (await testDb.reallocation.findMany({ where: { userId: user.id } }))[0];
    expect(r).toMatchObject({ transactionId: tx.id, fromBucketId: "save", toBucketId: "spend", currency: "NGN", reason: "Car repair could not wait" });
    expect(Number(r.amountMinor)).toBe(90_000); // exactly ₦900

    const after = await snapshot();
    expect(bucket(after, "spend").closing).toBe(0); // 8,100 + 900 - 9,000
    expect(bucket(after, "spend").moved).toBe(900);
    expect(bucket(after, "save").moved).toBe(-900);
    expect(bucket(after, "save").closing).toBe(bucket(before, "save").closing - 900);
    // spending counts the expense once; the move is not spending and not income
    expect(after.expenses - before.expenses).toBe(9_000);
    expect(after.income).toBe(before.income);
  });

  it("needs a reason, a real source, and a source that can cover it; nothing is saved otherwise", async () => {
    const user = await funded();
    for (const [fundFrom, status] of [
      [{ bucketId: "save", reason: "  " }, 400],
      [{ bucketId: "nope", reason: "x reason" }, 400],
      [{ bucketId: "spend", reason: "same bucket" }, 400],
    ] as const) {
      expect((await post(expense({ fundFrom }))).status, JSON.stringify(fundFrom)).toBe(status);
    }
    // a source that holds less than the shortfall: ask for far more than any bucket has
    const tooBig = await post(expense({ amount: 90_000, fundFrom: { bucketId: "give", reason: "a real reason" } }));
    expect(tooBig.status).toBe(400);
    expect((await tooBig.json()).error).toMatch(/does not cover/);
    expect(await testDb.transaction.count({ where: { userId: user.id, type: "e" } })).toBe(0);
    expect(await testDb.reallocation.count({ where: { userId: user.id } })).toBe(0);
  });

  it("is never offered for an expense the bucket CAN cover: no reallocation without a real shortfall", async () => {
    const user = await funded();
    const res = await post(expense({ amount: 1_000, fundFrom: { bucketId: "save", reason: "unneeded" } }));
    expect(res.status).toBe(200);
    expect(await testDb.reallocation.count({ where: { userId: user.id } })).toBe(0);
  });

  it("can not be used to replenish a bucket for later: the next expense is blocked again", async () => {
    await funded();
    expect((await post(expense({ fundFrom: { bucketId: "save", reason: "needed it now" } }))).status).toBe(200);
    const next = await post(expense({ amount: 1 }));
    expect(next.status).toBe(422);
  });

  it("another user's bucket ids mean nothing: a bucket must be in your own plan", async () => {
    await funded();
    const res = await post(expense({ fundFrom: { bucketId: "someone-elses-bucket", reason: "a reason" } }));
    expect(res.status).toBe(400);
  });

  it("records that the source was a protected (carry-over) bucket", async () => {
    const user = await funded();
    const plan = JSON.parse((await testDb.budgetPlan.findUnique({ where: { userId: user.id } }))!.bucketsJson) as { id: string; carryOver: boolean }[];
    const protectedId = plan.find((b) => b.carryOver && b.id !== "spend")!.id;
    expect((await post(expense({ fundFrom: { bucketId: protectedId, reason: "emergency use" } }))).status).toBe(200);
    expect((await testDb.reallocation.findMany({ where: { userId: user.id } }))[0].fromProtected).toBe(true);
  });

  it("is saved together with the expense or not at all", async () => {
    if (usingPostgres) return; // failure injection exists only on the in-memory database
    const user = await funded();
    fakeDb!.__failNext("reallocation.create");
    const res = await post(expense({ fundFrom: { bucketId: "save", reason: "a reason" } })).catch(() => null);
    expect(res === null || res.status === 500).toBe(true);
    expect(await testDb.transaction.count({ where: { userId: user.id, type: "e" } })).toBe(0);
    expect(await testDb.reallocation.count({ where: { userId: user.id } })).toBe(0);
  });
});

describe("the audit trail and what follows from it", () => {
  async function withException() {
    const user = await funded();
    await post(expense({ note: "Car repair", fundFrom: { bucketId: "save", reason: "Car repair could not wait" } }));
    const tx = (await testDb.transaction.findMany({ where: { userId: user.id, type: "e" } }))[0];
    return { user, tx };
  }

  it("deleting the expense removes the exception, and the buckets return to how they were", async () => {
    const { user, tx } = await withException();
    const before = await snapshot();
    expect(bucket(before, "spend").moved).toBe(900);
    expect((await DELETE(jsonRequest("DELETE"), params(tx.id))).status).toBe(200);
    expect(await testDb.reallocation.count({ where: { userId: user.id } })).toBe(0);
    const after = await snapshot();
    expect(bucket(after, "spend").moved).toBe(0);
    expect(bucket(after, "spend").closing).toBe(8_100);
  });

  it("its amount, bucket and day are frozen (delete and re-record to change them); a note can still change", async () => {
    const { tx } = await withException();
    const edit = (body: unknown) => PATCH(jsonRequest("PATCH", body), params(tx.id));
    const blocked = await edit({ amount: 8_000 });
    expect(blocked.status).toBe(400);
    expect((await blocked.json()).error).toMatch(/approved exception/);
    expect((await edit({ bucketId: "save" })).status).toBe(400);
    expect((await edit({ note: "Car repair, garage receipt" })).status).toBe(200);
    // sending the unchanged values (as the edit form does) is fine
    expect((await edit({ amount: 9_000, bucketId: "spend", note: "ok" })).status).toBe(200);
  });

  it("does not change income, expenses or the expense rate on the Trends figures", async () => {
    const { user } = await withException();
    const perf = await getPerformance({ id: user.id, baseCurrency: "NGN", fxRates: user.fxRates });
    const month = perf.months[perf.months.length - 1];
    expect(month.income).toBe(100_000);
    expect(month.expenses).toBe(9_000);
    expect(month.expenseRate).toBe(9);
  });

  it("appears in the export so the decision can be traced", async () => {
    const { user } = await withException();
    const bundle = await buildExport(user.id);
    expect(bundle.reallocations).toHaveLength(1);
    expect(bundle.reallocations[0]).toMatchObject({ fromBucketId: "save", toBucketId: "spend", amount: "900.00", reason: "Car repair could not wait" });
  });

  it("the Steward sees the funded bucket as covered, not 111% spent", async () => {
    const { user } = await withException();
    const view = await getStewardView({ id: user.id, email: user.email, baseCurrency: "NGN", fxRates: user.fxRates });
    expect(view.context).toContain("An expense this month was funded from another bucket");
    // exactly used up (100%), not over-spent: the moved money counts as part of what Spend had
    expect(view.context).toContain("100% of Spend is spent");
    expect(view.context).not.toMatch(/111%/);
    expect(view.context).toContain("Spend: available ₦9,000, spent ₦9,000, left ₦0");
  });
});
