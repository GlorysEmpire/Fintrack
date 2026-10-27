/**
 * Generating recurring transactions: exactly once, caught up, isolated per
 * rule, and never around the bucket rules.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", async () => ({ prisma: (await import("@/test/db")).testDb }));

import { dateFromDateKey } from "@fintrack/domain";
import { runDueRecurring } from "@/lib/recurring";
import { usingPostgres } from "@/test/db";
import { cleanup, createUser, seedPlan, seedTx, testDb } from "@/test/harness";

afterEach(cleanup);

/** 27 Oct 2026, 11:00 in Lagos */
const NOW = new Date("2026-10-27T10:00:00Z");

/** A user with the tithe-first plan and ₦100,000 in October (Spend holds ₦8,100) */
async function funded() {
  const user = await createUser();
  await seedPlan(user.id);
  await seedTx(user.id, { type: "i", amount: 100_000, date: new Date("2026-10-02T12:00:00Z") });
  return user;
}

async function addRule(
  userId: string,
  data: {
    type?: "i" | "e";
    amount?: number;
    bucketId?: string | null;
    nextKey: string;
    cadence?: "daily" | "weekly" | "monthly";
    dayOfMonth?: number | null;
    note?: string;
    active?: boolean;
  }
) {
  return testDb.recurringRule.create({
    data: {
      userId,
      type: data.type ?? "e",
      amount: data.amount ?? 1_000,
      bucketId: data.type === "i" ? null : data.bucketId === undefined ? "spend" : data.bucketId,
      cadence: data.cadence ?? "daily",
      dayOfMonth: data.dayOfMonth ?? null,
      note: data.note ?? "Rule",
      nextRunAt: dateFromDateKey(data.nextKey),
      active: data.active ?? true,
    },
  });
}

const generated = (ruleId: string) =>
  testDb.transaction.findMany({ where: { recurringRuleId: ruleId }, orderBy: { date: "asc" } });
const dayOf = (d: Date) => d.toISOString().slice(0, 10);

describe("runDueRecurring", () => {
  it("records a due occurrence under its own day and moves the rule on", async () => {
    const user = await funded();
    const rule = await addRule(user.id, { nextKey: "2026-10-27", amount: 1_500 });

    const summary = await runDueRecurring(NOW);

    expect(summary).toMatchObject({ rulesChecked: 1, created: 1, skipped: 0, failedRules: 0 });
    const txs = await generated(rule.id);
    expect(txs).toHaveLength(1);
    expect(txs[0]).toMatchObject({ userId: user.id, type: "e", amount: 1_500, bucketId: "spend", note: "Rule" });
    expect(dayOf(txs[0].occurrenceDate as Date)).toBe("2026-10-27");
    const after = await testDb.recurringRule.findUnique({ where: { id: rule.id } });
    expect(dayOf(after!.nextRunAt)).toBe("2026-10-28");
    expect(after!.lastError).toBeNull();
  });

  it("does nothing for a rule that is not due yet, or is paused", async () => {
    const user = await funded();
    const future = await addRule(user.id, { nextKey: "2026-10-28" });
    const paused = await addRule(user.id, { nextKey: "2026-10-27", active: false });

    const summary = await runDueRecurring(NOW);

    expect(summary.rulesChecked).toBe(0);
    expect(await generated(future.id)).toHaveLength(0);
    expect(await generated(paused.id)).toHaveLength(0);
  });

  it("catches up every missed day, each under its own date", async () => {
    const user = await funded();
    const rule = await addRule(user.id, { type: "i", amount: 500, nextKey: "2026-10-24" });

    const summary = await runDueRecurring(NOW);

    expect(summary.created).toBe(4);
    const txs = await generated(rule.id);
    expect(txs.map((t) => dayOf(t.occurrenceDate as Date))).toEqual([
      "2026-10-24",
      "2026-10-25",
      "2026-10-26",
      "2026-10-27",
    ]);
    // Filed under the occurrence day, not under the day the job happened to run
    expect(txs.slice(0, 3).map((t) => dayOf(t.date))).toEqual(["2026-10-24", "2026-10-25", "2026-10-26"]);
  });

  it("running again creates nothing more", async () => {
    const user = await funded();
    const rule = await addRule(user.id, { type: "i", nextKey: "2026-10-25" });

    await runDueRecurring(NOW);
    const again = await runDueRecurring(NOW);

    expect(again.created).toBe(0);
    expect(await generated(rule.id)).toHaveLength(3);
  });

  it("two runs at the same moment record each occurrence once", async () => {
    const user = await funded();
    const rule = await addRule(user.id, { type: "i", nextKey: "2026-10-24" });

    const [a, b] = await Promise.all([runDueRecurring(NOW), runDueRecurring(NOW)]);

    expect(a.created + b.created).toBe(4);
    expect(await generated(rule.id)).toHaveLength(4);
  });

  it("an occurrence already recorded by a run that crashed is not recorded again", async () => {
    const user = await funded();
    const rule = await addRule(user.id, { nextKey: "2026-10-27", amount: 700 });
    // The earlier run saved the transaction but died before moving the rule on
    await seedTx(user.id, { type: "e", amount: 700, bucketId: "spend", date: NOW });
    await testDb.transaction.updateMany({
      where: { userId: user.id, type: "e" },
      data: { recurringRuleId: rule.id, occurrenceDate: dateFromDateKey("2026-10-27") },
    });

    const summary = await runDueRecurring(NOW);

    expect(summary).toMatchObject({ created: 0, alreadyDone: 1 });
    expect(await generated(rule.id)).toHaveLength(1);
    const after = await testDb.recurringRule.findUnique({ where: { id: rule.id } });
    expect(dayOf(after!.nextRunAt)).toBe("2026-10-28");
  });

  it("the database itself refuses a second transaction for one occurrence", async () => {
    const user = await funded();
    const rule = await addRule(user.id, { nextKey: "2026-10-27" });
    const data = {
      userId: user.id,
      type: "e",
      amount: 1,
      recurringRuleId: rule.id,
      occurrenceDate: dateFromDateKey("2026-10-27"),
    };
    await testDb.transaction.create({ data });
    await expect(testDb.transaction.create({ data })).rejects.toMatchObject({ code: "P2002" });
  });

  it("skips an expense the bucket can not cover, tells the user, and moves on", async () => {
    const user = await funded(); // Spend holds ₦8,100
    const rule = await addRule(user.id, { nextKey: "2026-10-27", amount: 9_000, note: "Rent" });

    const summary = await runDueRecurring(NOW);

    expect(summary).toMatchObject({ created: 0, skipped: 1 });
    expect(await generated(rule.id)).toHaveLength(0);
    const after = await testDb.recurringRule.findUnique({ where: { id: rule.id } });
    expect(dayOf(after!.nextRunAt)).toBe("2026-10-28");
    expect(after!.lastError).toMatch(/Skipped 27 Oct 2026: the bucket could not cover it/);
    const inbox = await testDb.inboxMessage.findMany({ where: { userId: user.id } });
    expect(inbox).toHaveLength(1);
    expect(inbox[0].title).toBe("Recurring expense skipped");
    expect(inbox[0].body).toContain("Rent");
    expect(inbox[0].body).toMatch(/does not cover/);
    // And the bucket was never pushed below zero
    const spent = (await testDb.transaction.findMany({ where: { userId: user.id, type: "e" } })).length;
    expect(spent).toBe(0);
  });

  it("recurring expenses obey the bucket balance one occurrence at a time", async () => {
    const user = await funded(); // Spend holds ₦8,100
    const rule = await addRule(user.id, { nextKey: "2026-10-25", amount: 3_000 });

    const summary = await runDueRecurring(NOW); // 25th, 26th, 27th

    expect(summary).toMatchObject({ created: 2, skipped: 1 });
    expect(await generated(rule.id)).toHaveLength(2); // 6,000 of 8,100; the third 3,000 does not fit
  });

  it("each user's rules are checked against their own plan and balance", async () => {
    const rich = await funded();
    const poor = await createUser();
    await seedPlan(poor.id);
    const richRule = await addRule(rich.id, { nextKey: "2026-10-27", amount: 2_000 });
    const poorRule = await addRule(poor.id, { nextKey: "2026-10-27", amount: 2_000 });

    await runDueRecurring(NOW);

    expect(await generated(richRule.id)).toHaveLength(1);
    expect(await generated(poorRule.id)).toHaveLength(0);
  });

  it("limits a long gap to one batch and finishes it on the next run", async () => {
    const user = await funded();
    const rule = await addRule(user.id, { type: "i", amount: 1, nextKey: "2026-07-01" }); // 119 days

    const first = await runDueRecurring(NOW);
    expect(first.created).toBe(62);
    expect(first.moreToDo).toBe(true);

    const second = await runDueRecurring(NOW);
    expect(second.created).toBe(57);
    expect(second.moreToDo).toBe(false);
    expect(await generated(rule.id)).toHaveLength(119);
  });

  it("works for a rule saved with an arbitrary time of day (older rules)", async () => {
    const user = await funded();
    const rule = await testDb.recurringRule.create({
      data: {
        userId: user.id,
        type: "i",
        amount: 10,
        cadence: "daily",
        nextRunAt: new Date("2026-10-27T03:00:00Z"),
      },
    });
    const summary = await runDueRecurring(NOW);
    expect(summary.created).toBe(1);
    const after = await testDb.recurringRule.findUnique({ where: { id: rule.id } });
    expect(dayOf(after!.nextRunAt)).toBe("2026-10-28");
  });

  it.skipIf(usingPostgres)("one rule failing does not stop the others", async () => {
    const { fakeDb } = await import("@/test/db");
    const user = await funded();
    const bad = await addRule(user.id, { type: "i", nextKey: "2026-10-27", note: "first" });
    const good = await addRule(user.id, { type: "i", nextKey: "2026-10-27", note: "second" });
    fakeDb!.__failNext("transaction.create");

    const summary = await runDueRecurring(NOW);

    expect(summary.failedRules).toBe(1);
    expect(summary.created).toBe(1);
    const failed = await testDb.recurringRule.findUnique({ where: { id: bad.id } });
    expect(failed!.lastError).toMatch(/retried/);
    expect(dayOf(failed!.nextRunAt)).toBe("2026-10-27"); // not moved on: it will be retried
    expect(await generated(good.id)).toHaveLength(1);
  });
});
