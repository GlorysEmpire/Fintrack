/**
 * GET /api/performance: the numbers come only from the signed-in user's own
 * records, and moving money between accounts never changes them.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", async () => ({ prisma: (await import("@/test/db")).testDb }));
vi.mock("@/lib/auth", async () => ({
  getSessionUser: (await import("@/test/harness")).sessionUser,
}));

import { cleanup, createUser, jsonRequest, midMonth, seedPlan, seedTx, signIn, testDb } from "@/test/harness";
import { POST as createAccount } from "../accounts/route";
import { POST as createTransfer } from "../transfers/route";
import { GET } from "./route";

afterEach(cleanup);

const get = async () => (await GET()).json();
const OPEN = "2026-01-01";

describe("GET /api/performance", () => {
  it("needs sign-in", async () => {
    signIn(null);
    expect((await GET()).status).toBe(401);
  });

  it("an empty account has an empty, honest answer", async () => {
    const user = await createUser();
    signIn(user);
    const body = await get();
    expect(body).toMatchObject({ ok: true, months: [], unassignedCount: 0 });
    expect(body.trend.status).toBe("insufficient_data");
  });

  it("reports last month in full and this month so far, from the user's own records only", async () => {
    const user = await createUser();
    const other = await createUser();
    signIn(user);
    await seedPlan(user.id);
    await seedTx(user.id, { type: "i", amount: 100_000, date: midMonth(-1) });
    await seedTx(user.id, { type: "e", amount: 5_000, bucketId: "spend", date: midMonth(-1) });
    // Someone else's huge numbers must not leak in
    await seedTx(other.id, { type: "i", amount: 9_999_999, date: midMonth(-1) });

    const body = await get();
    const last = body.months.find((m: { inProgress: boolean }) => !m.inProgress);
    expect(last).toMatchObject({ income: 100_000, expenses: 5_000, expenseRate: 5, surplus: 95_000, rateNote: "ok" });
    const now = body.months.find((m: { inProgress: boolean }) => m.inProgress);
    expect(now).toMatchObject({ hasRecords: false, expenseRate: null, rateNote: "no_records" });
    expect(body.comparison.previousFull).toMatchObject({ income: 100_000, expenses: 5_000 });
    expect(body.unassignedCount).toBe(2);
  });

  it("a transfer between accounts changes no income, expense, rate or surplus", async () => {
    const user = await createUser();
    signIn(user);
    await seedPlan(user.id);
    await seedTx(user.id, { type: "i", amount: 100_000, date: midMonth(0, new Date(), 1) });
    const make = async (name: string, openingBalance: number) =>
      (await (await createAccount(jsonRequest("POST", { name, type: "bank", openingBalance, openingDate: OPEN }))).json()).account.id;
    const bank = await make("Bank", 50_000);
    const cash = await make("Cash", 0);

    const before = (await get()).months;
    const res = await createTransfer(jsonRequest("POST", { fromAccountId: bank, toAccountId: cash, amount: 20_000, fee: 50 }));
    expect(res.status).toBe(200);
    const body = await get();

    expect(body.months).toEqual(before);
    // …but the movement of the accounts themselves does show it
    const thisMonth = body.accountMovement[1].accounts;
    const b = thisMonth.find((a: { name: string }) => a.name === "Bank");
    const c = thisMonth.find((a: { name: string }) => a.name === "Cash");
    expect(b).toMatchObject({ transfersOut: 20_000, fees: 50, net: -20_050 });
    expect(c).toMatchObject({ transfersIn: 20_000, net: 20_000 });
  });

  it("another user's accounts never appear in account movement", async () => {
    const other = await createUser();
    await testDb.account.create({
      data: { userId: other.id, name: "Theirs", kind: "asset", type: "bank", openingDate: new Date("2026-01-01T12:00:00Z") },
    });
    const user = await createUser();
    signIn(user);
    await seedTx(user.id, { type: "i", amount: 10, date: midMonth(-1) });
    const body = await get();
    expect(body.accountMovement).toEqual([]);
  });

  it("money moved into a savings account shows as 'moved to savings', and is not spending", async () => {
    const user = await createUser();
    signIn(user);
    await seedPlan(user.id);
    await seedTx(user.id, { type: "i", amount: 100_000, date: midMonth(0, new Date(), 1) });
    const make = async (name: string, type: string, openingBalance = 0) =>
      (await (await createAccount(jsonRequest("POST", { name, type, openingBalance, openingDate: OPEN }))).json()).account.id;
    const bank = await make("Bank", "bank", 80_000);
    const vault = await make("Vault", "savings");
    const before = (await get()).months.at(-1);

    await createTransfer(jsonRequest("POST", { fromAccountId: bank, toAccountId: vault, amount: 25_000 }));
    const after = (await get()).months.at(-1);

    expect(after.movedToSavings).toBe(25_000);
    expect(after.movedFromSavings).toBe(0);
    expect(after.expenses).toBe(before.expenses);
    expect(after.expenseRate).toBe(before.expenseRate);
  });
});

