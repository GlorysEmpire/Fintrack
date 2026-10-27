/**
 * Recurring rules API: create, change, pause, resume, delete, and who can
 * touch which rule.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", async () => ({ prisma: (await import("@/test/db")).testDb }));
vi.mock("@/lib/auth", async () => ({
  getSessionUser: (await import("@/test/harness")).sessionUser,
}));

import { toDateInputValue } from "@/lib/format-date";
import {
  cleanup,
  createUser,
  jsonRequest,
  params,
  seedPlan,
  seedTx,
  signIn,
  testDb,
} from "@/test/harness";
import { GET, POST } from "./route";
import { DELETE, PATCH } from "./[id]/route";

afterEach(cleanup);

const today = () => toDateInputValue(new Date());
const daysFromToday = (n: number) =>
  new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

const create = (body: unknown) => POST(jsonRequest("POST", body));
const patch = (id: string, body: unknown) => PATCH(jsonRequest("PATCH", body), params(id));
const remove = (id: string) => DELETE(jsonRequest("DELETE"), params(id));

const rent = (extra: Record<string, unknown> = {}) => ({
  type: "e",
  amount: 5_000,
  currency: "NGN",
  bucketId: "spend",
  note: "Data bundle",
  cadence: "monthly",
  dayOfMonth: 28,
  ...extra,
});

async function signedInWithPlan() {
  const user = await createUser();
  await seedPlan(user.id);
  signIn(user);
  return user;
}

describe("POST /api/recurring", () => {
  it("creates a rule that first fires on the next matching day, and records nothing yet", async () => {
    const user = await signedInWithPlan();
    const res = await create(rent({ startDate: today() }));
    expect(res.status).toBe(200);
    const { rule } = await res.json();
    expect(rule).toMatchObject({ type: "e", amount: 5_000, cadence: "monthly", dayOfMonth: 28, active: true });
    expect(rule.nextDate >= today()).toBe(true);
    expect(rule.nextDate.slice(8)).toBe("28");
    expect(await testDb.transaction.count({ where: { userId: user.id } })).toBe(0);
  });

  it("refuses a start date in the past", async () => {
    await signedInWithPlan();
    const res = await create(rent({ startDate: "2020-01-01" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/start date can not be in the past/i);
  });

  it("refuses a bucket that is not in the user's plan, and a missing bucket", async () => {
    await signedInWithPlan();
    expect((await create(rent({ bucketId: "nope" }))).status).toBe(400);
    expect((await create(rent({ bucketId: null }))).status).toBe(400);
  });

  it("refuses someone else's income source", async () => {
    const other = await createUser();
    const source = await testDb.incomeSource.create({ data: { userId: other.id, name: "Theirs" } });
    await signedInWithPlan();
    const res = await create({ type: "i", amount: 10, cadence: "daily", sourceId: source.id });
    expect(res.status).toBe(400);
  });

  it("rejects unknown fields and bad numbers", async () => {
    await signedInWithPlan();
    expect((await create(rent({ nextRunAt: "2020-01-01" }))).status).toBe(400);
    expect((await create(rent({ amount: -5 }))).status).toBe(400);
    expect((await create(rent({ dayOfMonth: 40 }))).status).toBe(400);
    expect((await create(rent({ cadence: "yearly" }))).status).toBe(400);
  });

  it("needs sign-in", async () => {
    signIn(null);
    expect((await create(rent())).status).toBe(401);
    expect((await GET()).status).toBe(401);
  });
});

describe("GET /api/recurring", () => {
  it("lists only the signed-in user's rules", async () => {
    const mine = await signedInWithPlan();
    const other = await createUser();
    await testDb.recurringRule.create({
      data: { userId: mine.id, type: "i", amount: 1, cadence: "daily", nextRunAt: new Date() },
    });
    await testDb.recurringRule.create({
      data: { userId: other.id, type: "i", amount: 2, cadence: "daily", nextRunAt: new Date() },
    });
    const body = await (await GET()).json();
    expect(body.rules).toHaveLength(1);
    expect(body.rules[0].amount).toBe(1);
  });
});

describe("PATCH /api/recurring/[id]", () => {
  it("pauses and resumes; resuming skips what was missed while paused", async () => {
    await signedInWithPlan();
    const { rule } = await (await create(rent({ cadence: "daily", dayOfMonth: null, startDate: today() }))).json();

    const paused = await (await patch(rule.id, { active: false })).json();
    expect(paused.rule.active).toBe(false);

    // A week "passes" while it is paused
    await testDb.recurringRule.update({
      where: { id: rule.id },
      data: { nextRunAt: new Date(Date.now() - 7 * 86_400_000) },
    });

    const resumed = await (await patch(rule.id, { active: true })).json();
    expect(resumed.rule.active).toBe(true);
    expect(resumed.rule.nextDate).toBe(today());
  });

  it("changing the schedule restarts it from today", async () => {
    await signedInWithPlan();
    const { rule } = await (await create(rent({ cadence: "daily", dayOfMonth: null }))).json();
    const res = await patch(rule.id, { cadence: "weekly", startDate: daysFromToday(3) });
    expect((await res.json()).rule.nextDate).toBe(daysFromToday(3));
  });

  it("changes the amount without touching the schedule", async () => {
    await signedInWithPlan();
    const { rule } = await (await create(rent())).json();
    const res = await (await patch(rule.id, { amount: 7_500 })).json();
    expect(res.rule.amount).toBe(7_500);
    expect(res.rule.nextDate).toBe(rule.nextDate);
  });

  it("can not move a rule onto a bucket outside the plan", async () => {
    await signedInWithPlan();
    const { rule } = await (await create(rent())).json();
    expect((await patch(rule.id, { bucketId: "nope" })).status).toBe(400);
  });

  it("another user's rule looks like it does not exist, and is left alone", async () => {
    const owner = await createUser();
    const mine = await signedInWithPlan();
    const theirs = await testDb.recurringRule.create({
      data: { userId: owner.id, type: "i", amount: 9, cadence: "daily", nextRunAt: new Date() },
    });
    expect((await patch(theirs.id, { active: false })).status).toBe(404);
    expect((await remove(theirs.id)).status).toBe(404);
    const still = await testDb.recurringRule.findUnique({ where: { id: theirs.id } });
    expect(still).toMatchObject({ active: true, amount: 9, userId: owner.id });
    expect(mine.id).not.toBe(owner.id);
  });
});

describe("DELETE /api/recurring/[id]", () => {
  it("removes the rule and keeps the transactions it already made", async () => {
    const user = await signedInWithPlan();
    const { rule } = await (await create(rent())).json();
    const made = await seedTx(user.id, { type: "e", amount: 5_000, bucketId: "spend" });
    await testDb.transaction.update({ where: { id: made.id }, data: { recurringRuleId: rule.id } });

    expect((await remove(rule.id)).status).toBe(200);

    expect(await testDb.recurringRule.findUnique({ where: { id: rule.id } })).toBeNull();
    expect(await testDb.transaction.count({ where: { userId: user.id } })).toBe(1);
  });
});
