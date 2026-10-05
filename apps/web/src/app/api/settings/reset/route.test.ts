/**
 * Reset FinTrack: a deliberate, confirmed, all-or-nothing erase of ONE user's
 * financial data that leaves their account, their sign-in and every other
 * user untouched, and sends them back to setup.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", async () => ({ prisma: (await import("@/test/db")).testDb }));
vi.mock("@/lib/auth", async () => ({
  getSessionUser: (await import("@/test/harness")).sessionUser,
}));

import type { User } from "@prisma/client";
import { getUserPlan } from "@/lib/plan";
import { ensureMonthPacked } from "@/lib/month-close";
import { getResetPreview, resetFinancialData } from "@/lib/reset";
import { RESET_CONFIRMATION_PHRASE, isResetConfirmed } from "@/lib/reset-confirmation";
import { fakeDb, usingPostgres } from "@/test/db";
import {
  cleanup,
  createUser,
  jsonRequest,
  midMonth,
  seedPlan,
  seedTx,
  signIn,
  testDb,
} from "@/test/harness";
import { POST as onboard } from "@/app/api/onboarding/route";
import { POST } from "./route";

afterEach(cleanup);

const reset = (body: unknown) => POST(jsonRequest("POST", body));

/** A user with one of everything FinTrack stores about their finances */
async function userWithEverything(extra: Partial<User> = {}) {
  const user = await createUser({
    passwordHash: "$argon2id$not-a-real-hash",
    name: "Test User",
    baseCurrency: "USD",
    theme: "dark",
    dashboardLayoutJson: '{"order":["metrics"],"hidden":[]}',
    ...extra,
  });
  const plan = await seedPlan(user.id);
  await testDb.budgetPlan.update({
    where: { id: plan.id },
    data: { openingBalancesJson: '{"tithe":1000}', lastMonthClosed: "2026-09" },
  });
  const source = await testDb.incomeSource.create({ data: { userId: user.id, name: "Salary" } });
  const rule = await testDb.recurringRule.create({
    data: {
      userId: user.id,
      type: "e",
      amount: 5_000,
      bucketId: "save",
      cadence: "monthly",
      nextRunAt: new Date(Date.now() + 86_400_000),
    },
  });
  await seedTx(user.id, { type: "i", amount: 34_000, date: midMonth(-1), sourceId: source.id });
  const spent = await seedTx(user.id, { type: "e", amount: 2_400, date: midMonth(-1), bucketId: "tithe" });
  await testDb.transaction.create({
    data: { userId: user.id, type: "e", amount: 5_000, bucketId: "save", recurringRuleId: rule.id },
  });
  await testDb.inboxMessage.create({
    data: { userId: user.id, kind: "override_coach", title: "t", body: "b", relatedTxId: spent.id },
  });
  await testDb.aiMessage.create({ data: { userId: user.id, role: "user", content: "am I on track?" } });
  await testDb.session.create({
    data: { userId: user.id, token: `tok-${user.id}`, expiresAt: new Date(Date.now() + 86_400_000) },
  });
  return user;
}

async function snapshot(userId: string) {
  const where = { userId };
  const [user, transactions, plans, sources, rules, inbox, ai, sessions] = await Promise.all([
    testDb.user.findUnique({ where: { id: userId } }),
    testDb.transaction.count({ where }),
    testDb.budgetPlan.count({ where }),
    testDb.incomeSource.count({ where }),
    testDb.recurringRule.count({ where }),
    testDb.inboxMessage.count({ where }),
    testDb.aiMessage.count({ where }),
    testDb.session.findMany({ where }),
  ]);
  return {
    user,
    counts: { transactions, plans, sources, rules, inbox, ai },
    sessions: sessions.map((s) => s.token),
  };
}

const EVERYTHING = { transactions: 3, plans: 1, sources: 1, rules: 1, inbox: 1, ai: 1 };
const NOTHING = { transactions: 0, plans: 0, sources: 0, rules: 0, inbox: 0, ai: 0 };

describe("the confirmation words", () => {
  it("accepts the phrase, forgiving case and stray spaces, and nothing else", () => {
    expect(isResetConfirmed(RESET_CONFIRMATION_PHRASE)).toBe(true);
    expect(isResetConfirmed("  reset   fintrack ")).toBe(true);
    for (const wrong of ["", "reset", "RESET", "yes", "RESET FINTRAK", "RESETFINTRACK", null, true, 1]) {
      expect(isResetConfirmed(wrong)).toBe(false);
    }
  });
});

describe("POST /api/settings/reset — what stops a reset", () => {
  it("does nothing for a signed-out request", async () => {
    const user = await userWithEverything();
    signIn(null);
    const res = await reset({ confirmation: RESET_CONFIRMATION_PHRASE });
    expect(res.status).toBe(401);
    expect((await snapshot(user.id)).counts).toEqual(EVERYTHING);
  });

  it("does nothing without the typed confirmation", async () => {
    const user = await userWithEverything();
    signIn(user);
    for (const body of [{}, { confirmation: "" }, { confirmation: "yes" }, { confirmation: "RESET" }, { confirm: true }]) {
      const res = await reset(body);
      expect(res.status).toBe(400);
    }
    const after = await snapshot(user.id);
    expect(after.counts).toEqual(EVERYTHING);
    expect(after.user?.onboarding).toBe("completed");
  });

  it("can not be pointed at another user: the id comes from the session only", async () => {
    const victim = await userWithEverything();
    const attacker = await createUser();
    signIn(attacker);
    const res = await reset({ confirmation: RESET_CONFIRMATION_PHRASE, userId: victim.id });
    expect(res.status).toBe(400); // unknown field is rejected outright
    expect((await snapshot(victim.id)).counts).toEqual(EVERYTHING);
  });

  it("stops after too many attempts", async () => {
    const user = await userWithEverything();
    signIn(user);
    for (let i = 0; i < 5; i++) {
      expect((await reset({ confirmation: "no" })).status).toBe(400);
    }
    const limited = await reset({ confirmation: RESET_CONFIRMATION_PHRASE });
    expect(limited.status).toBe(429);
    expect((await snapshot(user.id)).counts).toEqual(EVERYTHING);
  });
});

describe("POST /api/settings/reset — what a confirmed reset does", () => {
  it("erases the user's financial records and reports what it erased", async () => {
    const user = await userWithEverything();
    signIn(user);
    expect(await getResetPreview(user.id)).toEqual({
      transactions: 3,
      plans: 1,
      incomeSources: 1,
      recurringRules: 1,
      inboxMessages: 1,
      aiMessages: 1,
    });

    const res = await reset({ confirmation: RESET_CONFIRMATION_PHRASE });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.onboarding).toBe("pending");
    expect(data.deleted).toEqual({
      transactions: 3,
      plans: 1,
      incomeSources: 1,
      recurringRules: 1,
      inboxMessages: 1,
      aiMessages: 1,
    });

    expect((await snapshot(user.id)).counts).toEqual(NOTHING);
  });

  it("keeps the account, the password, the preferences and the sign-in", async () => {
    const user = await userWithEverything();
    signIn(user);
    const before = await snapshot(user.id);

    await reset({ confirmation: RESET_CONFIRMATION_PHRASE });

    const after = await snapshot(user.id);
    expect(after.user).not.toBeNull();
    expect(after.user?.id).toBe(user.id);
    expect(after.user?.email).toBe(user.email);
    expect(after.user?.passwordHash).toBe("$argon2id$not-a-real-hash");
    expect(after.user?.name).toBe("Test User");
    expect(after.user?.baseCurrency).toBe("USD");
    expect(after.user?.theme).toBe("dark");
    expect(after.user?.dashboardLayoutJson).toBe('{"order":["metrics"],"hidden":[]}');
    expect(after.user?.fxRates).toBe(before.user?.fxRates);
    // Still signed in: sessions are untouched
    expect(after.sessions).toEqual(before.sessions);
    expect(after.sessions).toHaveLength(1);
  });

  it("sends the user back to setup, and setup works again from scratch", async () => {
    const user = await userWithEverything();
    signIn(user);
    await reset({ confirmation: RESET_CONFIRMATION_PHRASE });

    expect((await testDb.user.findUnique({ where: { id: user.id } }))?.onboarding).toBe("pending");
    expect(await getUserPlan(user.id)).toBeNull();
    // No stale derived state: there is no plan row left to hold a cache
    expect(await ensureMonthPacked(user.id)).toEqual({ status: "skipped", reason: "no_plan" });

    const res = await onboard(jsonRequest("POST", { path: "template", templateId: "50_30_20" }));
    expect(res.status).toBe(200);
    const fresh = await testDb.budgetPlan.findUnique({ where: { userId: user.id } });
    expect(fresh?.templateId).toBe("50_30_20");
    expect(fresh?.openingBalancesJson).toBe("{}");
    expect(fresh?.lastMonthClosed).toBeNull();
    expect((await testDb.user.findUnique({ where: { id: user.id } }))?.onboarding).toBe("completed");
  });

  it("does not touch any other user's data", async () => {
    const me = await userWithEverything();
    const other = await userWithEverything({ baseCurrency: "NGN" });
    const otherBefore = await snapshot(other.id);

    signIn(me);
    await reset({ confirmation: RESET_CONFIRMATION_PHRASE });

    const otherAfter = await snapshot(other.id);
    expect(otherAfter.counts).toEqual(EVERYTHING);
    expect(otherAfter.user).toEqual(otherBefore.user);
    expect(otherAfter.sessions).toEqual(otherBefore.sessions);
    expect((await snapshot(me.id)).counts).toEqual(NOTHING);
  });

  it("is safe to run on an account with nothing in it", async () => {
    const user = await createUser();
    signIn(user);
    const res = await reset({ confirmation: RESET_CONFIRMATION_PHRASE });
    expect(res.status).toBe(200);
    expect((await testDb.user.findUnique({ where: { id: user.id } }))?.onboarding).toBe("pending");
  });
});

describe("resetFinancialData — safety", () => {
  it("refuses to run without a user id, instead of erasing everyone", async () => {
    const a = await userWithEverything();
    const b = await userWithEverything();

    for (const bad of [undefined, null, "", "   "]) {
      await expect(resetFinancialData(bad as unknown as string)).rejects.toThrow(/user id/);
      await expect(getResetPreview(bad as unknown as string)).rejects.toThrow(/user id/);
    }
    expect((await snapshot(a.id)).counts).toEqual(EVERYTHING);
    expect((await snapshot(b.id)).counts).toEqual(EVERYTHING);
  });

  it("an account that does not exist changes nothing and reports an error", async () => {
    const bystander = await userWithEverything();
    await expect(resetFinancialData("no-such-user")).rejects.toThrow();
    expect((await snapshot(bystander.id)).counts).toEqual(EVERYTHING);
  });

  // On a real database: make the LAST statement fail for this one user (a
  // temporary rule on the throwaway test database) and check that every delete
  // before it was rolled back.
  it.skipIf(!usingPostgres)("on PostgreSQL, a failing last step rolls back every delete", async () => {
    const user = await userWithEverything();
    expect(user.id).toMatch(/^[a-z0-9]+$/);
    const rule = `reset_fails_${user.id}`;
    await testDb.$executeRawUnsafe(
      `ALTER TABLE "User" ADD CONSTRAINT "${rule}" CHECK (NOT (id = '${user.id}' AND onboarding = 'pending')) NOT VALID`
    );
    try {
      await expect(resetFinancialData(user.id)).rejects.toThrow();
      const after = await snapshot(user.id);
      expect(after.counts).toEqual(EVERYTHING);
      expect(after.user?.onboarding).toBe("completed");
    } finally {
      await testDb.$executeRawUnsafe(`ALTER TABLE "User" DROP CONSTRAINT "${rule}"`);
    }
    // With the rule gone the same reset goes through
    await resetFinancialData(user.id);
    expect((await snapshot(user.id)).counts).toEqual(NOTHING);
  });

  // The in-memory database can be told to fail any one step.
  it.skipIf(!fakeDb)("is all-or-nothing: if any step fails, nothing is erased", async () => {
    for (const step of ["aiMessage.deleteMany", "budgetPlan.deleteMany", "user.update"]) {
      const user = await userWithEverything();
      fakeDb!.__failNext(step);
      await expect(resetFinancialData(user.id)).rejects.toThrow(/injected failure/);

      const after = await snapshot(user.id);
      expect(after.counts).toEqual(EVERYTHING);
      expect(after.user?.onboarding).toBe("completed");
    }
  });
});
