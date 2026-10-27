/**
 * Accounts, transfers and account-aware transactions, end to end through the
 * route handlers: balances are derived, transfers are neutral, and nobody can
 * reach anyone else's accounts.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", async () => ({ prisma: (await import("@/test/db")).testDb }));
vi.mock("@/lib/auth", async () => ({
  getSessionUser: (await import("@/test/harness")).sessionUser,
}));

import { runDueRecurring } from "@/lib/recurring";
import { fakeDb, usingPostgres } from "@/test/db";
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
import { GET as listAccounts, POST as createAccountRoute } from "./route";
import { PATCH as patchAccount } from "./[id]/route";
import { POST as adjustRoute } from "./[id]/adjust/route";
import { POST as assignRoute } from "./[id]/assign/route";
import { GET as historyRoute } from "./[id]/history/route";
import { GET as listTransfers, POST as createTransferRoute } from "../transfers/route";
import { DELETE as deleteTransfer } from "../transfers/[id]/route";
import { POST as postTransaction } from "../transactions/route";
import { DELETE as deleteTransactionRoute, PATCH as patchTransactionRoute } from "../transactions/[id]/route";
import { GET as dashboard } from "../dashboard/route";

afterEach(cleanup);

const OPENED = "2026-01-01";

const newAccount = (body: Record<string, unknown>) =>
  createAccountRoute(jsonRequest("POST", { type: "bank", currency: "NGN", openingBalance: 0, openingDate: OPENED, ...body }));
const patch = (id: string, body: unknown) => patchAccount(jsonRequest("PATCH", body), params(id));
const adjust = (id: string, body: unknown) => adjustRoute(jsonRequest("POST", body), params(id));
const assign = (id: string, body: unknown = { confirm: true }) => assignRoute(jsonRequest("POST", body), params(id));
const transfer = (body: Record<string, unknown>) => createTransferRoute(jsonRequest("POST", body));
const removeTransfer = (id: string) => deleteTransfer(jsonRequest("DELETE"), params(id));
const patchTx = (id: string, body: unknown) => patchTransactionRoute(jsonRequest("PATCH", body), params(id));
const deleteTx = (id: string) => deleteTransactionRoute(jsonRequest("DELETE"), params(id));
const history = (id: string) => historyRoute(jsonRequest("GET"), params(id));
const logTx = (body: Record<string, unknown>) =>
  postTransaction(jsonRequest("POST", { currency: "NGN", ...body }));

async function accountsNow() {
  const body = await (await listAccounts()).json();
  const byName = (name: string) => body.accounts.find((a: { name: string }) => a.name === name);
  return { ...body, byName };
}

async function create(body: Record<string, unknown>) {
  const res = await newAccount(body);
  expect(res.status).toBe(200);
  return (await res.json()).account as { id: string; name: string };
}

async function signedIn() {
  const user = await createUser();
  signIn(user);
  return user;
}

/** Tithe-first plan and ₦100,000 income this month (Spend holds ₦8,100) */
async function withPlanAndIncome(userId: string) {
  await seedPlan(userId);
  await seedTx(userId, { type: "i", amount: 100_000 });
}

describe("creating accounts", () => {
  it("an asset account starts at its opening balance", async () => {
    await signedIn();
    const account = await create({ name: "GTBank Savings", type: "savings", openingBalance: 250_000.5, institution: "GTBank" });
    const { byName } = await accountsNow();
    expect(byName(account.name)).toMatchObject({
      kind: "asset", type: "savings", institution: "GTBank", currency: "NGN",
      openingBalance: 250_000.5, balance: 250_000.5, owed: 0, status: "active", openingDate: OPENED,
    });
  });

  it("a card or loan is typed as the amount owed, and reported as a debt", async () => {
    await signedIn();
    await create({ name: "Visa", type: "credit_card", openingBalance: 20_000 });
    const { byName } = await accountsNow();
    expect(byName("Visa")).toMatchObject({ kind: "liability", openingBalance: 20_000, balance: -20_000, owed: 20_000 });
  });

  it("rejects what can not be stored", async () => {
    await signedIn();
    await create({ name: "Main" });
    const cases: [string, Record<string, unknown>][] = [
      ["a duplicate name", { name: "Main" }],
      ["an empty name", { name: "   " }],
      ["an unknown type", { name: "x", type: "piggy" }],
      ["a future opening date", { name: "x", openingDate: "2999-01-01" }],
      ["a negative amount owed", { name: "x", type: "loan", openingBalance: -5 }],
      ["sub-kobo precision", { name: "x", openingBalance: 10.005 }],
      ["an unknown field", { name: "x", balance: 5 }],
    ];
    for (const [label, body] of cases) {
      const res = await newAccount(body);
      expect(res.status, label).toBe(400);
    }
  });

  it("needs sign-in", async () => {
    signIn(null);
    expect((await newAccount({ name: "x" })).status).toBe(401);
    expect((await listAccounts()).status).toBe(401);
  });
});

describe("privacy between users", () => {
  it("lists only your own accounts", async () => {
    const other = await createUser();
    await testDb.account.create({ data: { userId: other.id, name: "Theirs", kind: "asset", type: "bank", openingDate: new Date() } });
    await signedIn();
    await create({ name: "Mine" });
    const { accounts } = await accountsNow();
    expect(accounts.map((a: { name: string }) => a.name)).toEqual(["Mine"]);
  });

  it("another user's account can not be changed, adjusted, assigned, used or transferred to", async () => {
    const other = await createUser();
    const theirs = await testDb.account.create({
      data: { userId: other.id, name: "Theirs", kind: "asset", type: "bank", openingBalanceMinor: BigInt(100), openingDate: new Date("2026-01-01T12:00:00Z") },
    });
    const user = await signedIn();
    const mine = await create({ name: "Mine" });
    await withPlanAndIncome(user.id);

    expect((await patch(theirs.id, { name: "Hacked" })).status).toBe(404);
    expect((await adjust(theirs.id, { actualBalance: 1 })).status).toBe(404);
    expect((await assign(theirs.id)).status).toBe(404);
    const spend = await logTx({ type: "i", amount: 10, accountId: theirs.id });
    expect(spend.status).toBe(400);
    expect((await spend.json()).error).toMatch(/Pick one of your accounts/);
    expect((await transfer({ fromAccountId: mine.id, toAccountId: theirs.id, amount: 5 })).status).toBe(400);
    expect((await transfer({ fromAccountId: theirs.id, toAccountId: mine.id, amount: 5 })).status).toBe(400);

    const untouched = await testDb.account.findUnique({ where: { id: theirs.id } });
    expect(untouched).toMatchObject({ name: "Theirs", userId: other.id });
    expect(await testDb.transfer.count({})).toBe(0);
  });
});

describe("renaming, archiving and the opening balance", () => {
  it("renames, and refuses a name already in use", async () => {
    await signedIn();
    const a = await create({ name: "A" });
    await create({ name: "B" });
    expect((await (await patch(a.id, { name: "A2" })).json()).account.name).toBe("A2");
    expect((await patch(a.id, { name: "B" })).status).toBe(400);
  });

  it("an archived account keeps its balance but takes nothing new", async () => {
    const user = await signedIn();
    await withPlanAndIncome(user.id);
    const a = await create({ name: "Old", openingBalance: 500 });
    const b = await create({ name: "New" });
    expect((await (await patch(a.id, { status: "archived" })).json()).account).toMatchObject({ status: "archived", balance: 500 });

    expect((await logTx({ type: "i", amount: 10, accountId: a.id })).status).toBe(400);
    expect((await transfer({ fromAccountId: b.id, toAccountId: a.id, amount: 5 })).status).toBe(400);
    // …and can come back
    expect((await patch(a.id, { status: "active" })).status).toBe(200);
    expect((await logTx({ type: "i", amount: 10, accountId: a.id })).status).toBe(200);
  });

  it("the opening balance is editable until there is activity, then only an adjustment can change it", async () => {
    const user = await signedIn();
    await withPlanAndIncome(user.id);
    const a = await create({ name: "Main", openingBalance: 1000 });
    expect((await (await patch(a.id, { openingBalance: 1200 })).json()).account.balance).toBe(1200);

    await logTx({ type: "i", amount: 50, accountId: a.id });
    const locked = await patch(a.id, { openingBalance: 9999 });
    expect(locked.status).toBe(400);
    expect((await locked.json()).error).toMatch(/adjustment/);
  });
});

describe("income and expenses against an account", () => {
  it("income adds, expenses subtract, and the balance is derived", async () => {
    const user = await signedIn();
    await withPlanAndIncome(user.id);
    const a = await create({ name: "Main", openingBalance: 10_000 });

    expect((await logTx({ type: "i", amount: 5_000, accountId: a.id })).status).toBe(200);
    expect((await logTx({ type: "e", amount: 1_250.75, accountId: a.id, bucketId: "spend", category: "food" })).status).toBe(200);

    const { byName } = await accountsNow();
    expect(byName("Main")).toMatchObject({ balance: 13_749.25, income: 5_000, expenses: 1_250.75 });
  });

  it("is optional: a transaction with no account is simply unassigned", async () => {
    const user = await signedIn();
    await withPlanAndIncome(user.id);
    await create({ name: "Main", openingBalance: 100 });
    expect((await logTx({ type: "i", amount: 5_000 })).status).toBe(200);
    const body = await accountsNow();
    expect(body.byName("Main").balance).toBe(100);
    expect(body.unassignedCount).toBe(2); // the seeded income and this one
  });

  it("refuses the wrong currency, and a date before the account opened", async () => {
    const user = await signedIn();
    await withPlanAndIncome(user.id);
    const a = await create({ name: "Main", openingDate: "2026-06-01" });

    const usd = await logTx({ type: "i", amount: 10, currency: "USD", accountId: a.id });
    expect(usd.status).toBe(400);
    expect((await usd.json()).error).toMatch(/holds NGN, but this is in USD/);

    const early = await logTx({ type: "i", amount: 10, accountId: a.id, date: "2026-05-31" });
    expect(early.status).toBe(400);
    expect((await early.json()).error).toMatch(/opened on 2026-06-01/);
  });

  it("an expense from an account still obeys the bucket block, and saves nothing", async () => {
    const user = await signedIn();
    await withPlanAndIncome(user.id); // Spend holds ₦8,100
    const a = await create({ name: "Main", openingBalance: 1_000_000 });
    const res = await logTx({ type: "e", amount: 9_000, accountId: a.id, bucketId: "spend", category: "food" });
    expect(res.status).toBe(422);
    expect((await accountsNow()).byName("Main").balance).toBe(1_000_000);
  });
});

describe("transfers", () => {
  async function twoAccounts() {
    const user = await signedIn();
    await withPlanAndIncome(user.id);
    const bank = await create({ name: "Bank", openingBalance: 100_000 });
    const cash = await create({ name: "Cash" });
    return { user, bank, cash };
  }

  it("moves money from one account to the other as a single record", async () => {
    const { bank, cash } = await twoAccounts();
    const res = await transfer({ fromAccountId: bank.id, toAccountId: cash.id, amount: 30_000, fee: 50, feeBucketId: "spend", note: "ATM", reference: "REF1" });
    expect(res.status).toBe(200);
    expect((await res.json()).transfer).toMatchObject({ fromAmount: 30_000, toAmount: 30_000, fee: 50, note: "ATM", reference: "REF1" });

    const { byName } = await accountsNow();
    expect(byName("Bank")).toMatchObject({ balance: 69_950, transfersOut: 30_000, expenses: 50 });
    expect(byName("Cash")).toMatchObject({ balance: 30_000, transfersIn: 30_000 });
    expect(await testDb.transfer.count({})).toBe(1);
  });

  it("is neither income nor spending: the month's income and expenses do not move", async () => {
    const { bank, cash } = await twoAccounts();
    const before = (await (await dashboard()).json()).snapshot;
    await transfer({ fromAccountId: bank.id, toAccountId: cash.id, amount: 30_000 });
    const after = (await (await dashboard()).json()).snapshot;
    expect(after.income).toBe(before.income);
    expect(after.expenses).toBe(before.expenses);
    expect(after.net).toBe(before.net);
  });

  it("rejects the same account, bad amounts, and an unknown account", async () => {
    const { bank, cash } = await twoAccounts();
    for (const body of [
      { fromAccountId: bank.id, toAccountId: bank.id, amount: 5 },
      { fromAccountId: bank.id, toAccountId: cash.id, amount: 0 },
      { fromAccountId: bank.id, toAccountId: cash.id, amount: -5 },
      { fromAccountId: bank.id, toAccountId: cash.id, amount: 5.001 },
      { fromAccountId: bank.id, toAccountId: "nope", amount: 5 },
      { fromAccountId: bank.id, toAccountId: cash.id, amount: 5, fee: -1 },
      { fromAccountId: bank.id, toAccountId: cash.id, amount: 5, balance: 1 },
    ]) {
      expect((await transfer(body)).status).toBe(400);
    }
    expect(await testDb.transfer.count({})).toBe(0);
  });

  it("across currencies needs the amount that arrived, and never assumes one", async () => {
    const user = await signedIn();
    const ngn = await create({ name: "Naira", openingBalance: 500_000 });
    const usd = await create({ name: "Dollars", currency: "USD" });
    const assumed = await transfer({ fromAccountId: ngn.id, toAccountId: usd.id, amount: 158_000 });
    expect(assumed.status).toBe(400);
    expect((await assumed.json()).error).toMatch(/different currencies/);

    const ok = await transfer({ fromAccountId: ngn.id, toAccountId: usd.id, amount: 158_000, toAmount: 98.5, exchangeRate: 0.000623 });
    expect(ok.status).toBe(200);
    const { byName } = await accountsNow();
    expect(byName("Naira").balance).toBe(342_000);
    expect(byName("Dollars")).toMatchObject({ balance: 98.5, currency: "USD" });
    expect(user.id).toBeTruthy();
  });

  it("a mistaken transfer can be deleted during the edit window, not after", async () => {
    const { bank, cash } = await twoAccounts();
    const first = (await (await transfer({ fromAccountId: bank.id, toAccountId: cash.id, amount: 10 })).json()).transfer;
    expect((await removeTransfer(first.id)).status).toBe(200);
    expect((await accountsNow()).byName("Bank").balance).toBe(100_000);

    const old = (await (await transfer({ fromAccountId: bank.id, toAccountId: cash.id, amount: 10 })).json()).transfer;
    await testDb.transfer.update({ where: { id: old.id }, data: { createdAt: new Date(Date.now() - 49 * 3_600_000) } });
    const locked = await removeTransfer(old.id);
    expect(locked.status).toBe(423);
    expect(await testDb.transfer.count({})).toBe(1);
  });

  it("lists only your transfers, and can filter by account", async () => {
    const { bank, cash } = await twoAccounts();
    const other = await createUser();
    const theirA = await testDb.account.create({ data: { userId: other.id, name: "T1", kind: "asset", type: "bank", openingDate: new Date() } });
    const theirB = await testDb.account.create({ data: { userId: other.id, name: "T2", kind: "asset", type: "bank", openingDate: new Date() } });
    await testDb.transfer.create({ data: { userId: other.id, fromAccountId: theirA.id, toAccountId: theirB.id, fromAmountMinor: BigInt(1), toAmountMinor: BigInt(1), date: new Date() } });
    await transfer({ fromAccountId: bank.id, toAccountId: cash.id, amount: 10 });

    const all = await (await listTransfers(new Request("http://localhost/api/transfers"))).json();
    expect(all.transfers).toHaveLength(1);
    const filtered = await (await listTransfers(new Request(`http://localhost/api/transfers?accountId=${theirA.id}`))).json();
    expect(filtered.transfers).toHaveLength(0);
  });

  it.skipIf(usingPostgres)("a failure while saving leaves no half-moved money", async () => {
    const { bank, cash } = await twoAccounts();
    fakeDb!.__failNext("transfer.create");
    const res = await transfer({ fromAccountId: bank.id, toAccountId: cash.id, amount: 10 }).catch(() => null);
    expect(res === null || res.status === 500).toBe(true);
    const { byName } = await accountsNow();
    expect(byName("Bank").balance).toBe(100_000);
    expect(byName("Cash").balance).toBe(0);
  });

  it("the database refuses a transfer to the same account or a non-positive amount", async () => {
    if (!usingPostgres) return; // CHECK constraints exist only in real PostgreSQL
    const { user, bank, cash } = await twoAccounts();
    const base = { userId: user.id, date: new Date() };
    await expect(
      testDb.transfer.create({ data: { ...base, fromAccountId: bank.id, toAccountId: bank.id, fromAmountMinor: BigInt(1), toAmountMinor: BigInt(1) } })
    ).rejects.toThrow();
    await expect(
      testDb.transfer.create({ data: { ...base, fromAccountId: bank.id, toAccountId: cash.id, fromAmountMinor: BigInt(0), toAmountMinor: BigInt(0) } })
    ).rejects.toThrow();
  });
});

describe("credit cards and loans", () => {
  it("a card purchase counts once as spending, and paying the card does not count it again", async () => {
    const user = await signedIn();
    await withPlanAndIncome(user.id);
    const bank = await create({ name: "Bank", openingBalance: 100_000 });
    const card = await create({ name: "Visa", type: "credit_card" });
    const before = (await (await dashboard()).json()).snapshot.expenses;

    await logTx({ type: "e", amount: 5_000, accountId: card.id, bucketId: "spend", category: "food" });
    expect((await accountsNow()).byName("Visa")).toMatchObject({ owed: 5_000, balance: -5_000 });

    await transfer({ fromAccountId: bank.id, toAccountId: card.id, amount: 5_000, note: "Card payment" });
    const { byName } = await accountsNow();
    expect(byName("Visa")).toMatchObject({ owed: 0 });
    expect(byName("Bank").balance).toBe(95_000);

    const after = (await (await dashboard()).json()).snapshot.expenses;
    expect(after - before).toBe(5_000); // exactly once
  });

  it("loan proceeds are a debt, not income; principal repaid is not an expense", async () => {
    const user = await signedIn();
    await withPlanAndIncome(user.id);
    const bank = await create({ name: "Bank", openingBalance: 10_000 });
    const loan = await create({ name: "Bank loan", type: "loan" });
    const snap = async () => (await (await dashboard()).json()).snapshot;
    const before = await snap();

    await transfer({ fromAccountId: loan.id, toAccountId: bank.id, amount: 200_000, note: "Loan proceeds" });
    let { byName } = await accountsNow();
    expect(byName("Bank loan")).toMatchObject({ owed: 200_000 });
    expect(byName("Bank").balance).toBe(210_000);

    await transfer({ fromAccountId: bank.id, toAccountId: loan.id, amount: 50_000, note: "Principal" });
    ({ byName } = await accountsNow());
    expect(byName("Bank loan").owed).toBe(150_000);

    const after = await snap();
    expect(after.income).toBe(before.income);
    expect(after.expenses).toBe(before.expenses);
  });
});

describe("adjustments", () => {
  it("record a difference to reality without becoming income or spending", async () => {
    const user = await signedIn();
    await withPlanAndIncome(user.id);
    const a = await create({ name: "Main", openingBalance: 10_000 });
    const before = (await (await dashboard()).json()).snapshot;

    const res = await adjust(a.id, { actualBalance: 9_400, note: "bank charges I missed" });
    expect(res.status).toBe(200);
    expect((await res.json()).account).toMatchObject({ balance: 9_400, adjustments: -600 });
    expect((await accountsNow()).byName("Main")).toMatchObject({ income: 0, expenses: 0 });

    const after = (await (await dashboard()).json()).snapshot;
    expect(after.income).toBe(before.income);
    expect(after.expenses).toBe(before.expenses);
    expect(await testDb.accountAdjustment.count({})).toBe(1);
  });

  it("refuses when the balance already matches", async () => {
    await signedIn();
    const a = await create({ name: "Main", openingBalance: 100 });
    const res = await adjust(a.id, { actualBalance: 100 });
    expect(res.status).toBe(400);
    expect(await testDb.accountAdjustment.count({})).toBe(0);
  });

  it("for a debt, 'actual' means what is really owed", async () => {
    await signedIn();
    const card = await create({ name: "Visa", type: "credit_card", openingBalance: 20_000 });
    const res = await adjust(card.id, { actualBalance: 18_000 });
    expect((await res.json()).account).toMatchObject({ owed: 18_000, balance: -18_000 });
  });
});

describe("existing transactions are never assigned behind the user's back", () => {
  it("creating an account leaves all existing transactions unassigned", async () => {
    const user = await signedIn();
    await withPlanAndIncome(user.id);
    await create({ name: "Main", openingBalance: 5_000 });
    expect((await testDb.transaction.findMany({ where: { userId: user.id } })).every((t) => t.accountId === null)).toBe(true);
    expect((await accountsNow()).byName("Main").balance).toBe(5_000);
  });

  it("assigning is deliberate: it needs confirm:true, and touches only the account", async () => {
    const user = await signedIn();
    await seedTx(user.id, { type: "i", amount: 1_000, date: new Date("2026-03-01T12:00:00Z") });
    await seedTx(user.id, { type: "i", amount: 99, date: new Date("2025-12-31T12:00:00Z") }); // before opening
    await seedTx(user.id, { type: "i", amount: 7, currency: "USD", date: new Date("2026-03-01T12:00:00Z") });
    const a = await create({ name: "Main", openingBalance: 500 });
    const original = await testDb.transaction.findMany({ where: { userId: user.id }, orderBy: { amount: "asc" } });

    expect((await assign(a.id, {})).status).toBe(400);
    expect((await assign(a.id, { confirm: false })).status).toBe(400);
    expect(await testDb.transaction.count({ where: { userId: user.id, accountId: a.id } })).toBe(0);

    const res = await assign(a.id);
    expect(await res.json()).toMatchObject({ ok: true, assigned: 1, skipped: 2 });
    expect((await accountsNow()).byName("Main")).toMatchObject({ balance: 1_500, income: 1_000 });

    const after = await testDb.transaction.findMany({ where: { userId: user.id }, orderBy: { amount: "asc" } });
    for (const t of after) {
      const was = original.find((o) => o.id === t.id)!;
      expect({ ...t, accountId: null }).toEqual({ ...was, accountId: null }); // nothing but the account changed
    }
  });

  it("assigning never touches another user's transactions", async () => {
    const other = await createUser();
    await seedTx(other.id, { type: "i", amount: 5, date: new Date("2026-03-01T12:00:00Z") });
    const user = await signedIn();
    const a = await create({ name: "Main" });
    await assign(a.id);
    expect((await testDb.transaction.findMany({ where: { userId: other.id } }))[0].accountId).toBeNull();
  });
});

describe("recurring rules and accounts", () => {
  it("a rule records into its account; if the account has since been archived, that occurrence is skipped and the user is told", async () => {
    const user = await signedIn();
    await withPlanAndIncome(user.id);
    const a = await create({ name: "Main", openingBalance: 100 });
    const rule = await testDb.recurringRule.create({
      data: { userId: user.id, type: "i", amount: 50, cadence: "daily", accountId: a.id, nextRunAt: new Date(Date.now() - 2 * 86_400_000) },
    });

    await runDueRecurring();
    const made = await testDb.transaction.findMany({ where: { recurringRuleId: rule.id } });
    expect(made.length).toBeGreaterThan(0);
    expect(made.every((t) => t.accountId === a.id)).toBe(true);

    await patch(a.id, { status: "archived" });
    const later = await testDb.recurringRule.create({
      data: { userId: user.id, type: "i", amount: 50, cadence: "daily", accountId: a.id, nextRunAt: new Date(Date.now() - 86_400_000) },
    });
    const summary = await runDueRecurring();
    expect(summary.skipped).toBeGreaterThan(0);
    expect(await testDb.transaction.count({ where: { recurringRuleId: later.id } })).toBe(0);
    expect((await testDb.inboxMessage.findMany({ where: { userId: user.id } })).some((m) => /skipped/i.test(m.title))).toBe(true);
  });
});

describe("account history: where the money came from and where it went", () => {
  it("lists every movement newest first, with a running balance that ends at the real balance", async () => {
    const user = await signedIn();
    await withPlanAndIncome(user.id);
    const bank = await create({ name: "Bank", openingBalance: 10_000 });
    const cash = await create({ name: "Cash" });
    await logTx({ type: "i", amount: 100_000, accountId: bank.id, date: "2026-02-01", note: "salary" });
    await logTx({ type: "e", amount: 1_250.5, accountId: bank.id, bucketId: "spend", category: "food", date: "2026-02-03" });
    await transfer({ fromAccountId: bank.id, toAccountId: cash.id, amount: 2_000, date: "2026-02-05", note: "ATM" });
    await adjust(bank.id, { actualBalance: 107_000, note: "reconciled" });

    const body = await (await history(bank.id)).json();
    expect(body.events.map((e: { kind: string }) => e.kind)).toEqual(["adjustment", "transfer_out", "expense", "income"]);
    const out = body.events.find((e: { kind: string }) => e.kind === "transfer_out");
    expect(out).toMatchObject({ amount: -2_000, counterparty: "Cash", note: "ATM" });
    // the balance after the newest event is the balance the account reports
    expect(body.events[0].balanceAfter).toBe(107_000);
    expect((await accountsNow()).byName("Bank").balance).toBe(107_000);
    // and each step adds up: 10,000 + 100,000 − 1,250.50 − 2,000
    expect(out.balanceAfter).toBe(106_749.5);
    expect(body.total).toBe(4);

    const cashBody = await (await history(cash.id)).json();
    expect(cashBody.events).toMatchObject([{ kind: "transfer_in", amount: 2_000, counterparty: "Bank", balanceAfter: 2_000 }]);
  });

  it("leaves out anything dated before the account opened", async () => {
    const user = await signedIn();
    await seedTx(user.id, { type: "i", amount: 99, date: new Date("2025-06-01T12:00:00Z") });
    const a = await create({ name: "Main", openingBalance: 100 });
    // assigned directly to prove the filter, though the app would refuse to record it
    await testDb.transaction.updateMany({ where: { userId: user.id }, data: { accountId: a.id } });
    expect((await (await history(a.id)).json()).events).toEqual([]);
  });

  it("is private to its owner", async () => {
    const other = await createUser();
    const theirs = await testDb.account.create({ data: { userId: other.id, name: "Theirs", kind: "asset", type: "bank", openingDate: new Date("2026-01-01T12:00:00Z") } });
    await signedIn();
    expect((await history(theirs.id)).status).toBe(404);
    signIn(null);
    expect((await history(theirs.id)).status).toBe(401);
  });
});

describe("a transfer fee is a real expense", () => {
  async function setup() {
    const user = await signedIn();
    await withPlanAndIncome(user.id); // Spend holds ₦8,100
    const bank = await create({ name: "Bank", openingBalance: 100_000 });
    const cash = await create({ name: "Cash" });
    const snap = async () => (await (await dashboard()).json()).snapshot;
    return { user, bank, cash, snap };
  }

  it("is recorded once as an expense on the sending account, from the chosen bucket", async () => {
    const { user, bank, cash, snap } = await setup();
    const before = await snap();
    const res = await transfer({ fromAccountId: bank.id, toAccountId: cash.id, amount: 10_000, fee: 50, feeBucketId: "spend", note: "ATM" });
    expect(res.status).toBe(200);

    const fees = await testDb.transaction.findMany({ where: { userId: user.id, transferId: { not: null } } });
    expect(fees).toHaveLength(1);
    expect(fees[0]).toMatchObject({ type: "e", amount: 50, currency: "NGN", bucketId: "spend", accountId: bank.id });
    expect(fees[0].note).toMatch(/Transfer fee: Bank to Cash/);

    const { byName } = await accountsNow();
    expect(byName("Bank")).toMatchObject({ balance: 89_950, expenses: 50, transfersOut: 10_000 }); // 100,000 − 10,000 − 50, once
    expect(byName("Cash").balance).toBe(10_000); // what arrived is unaffected by the fee

    const after = await snap();
    expect(after.expenses - before.expenses).toBe(50); // spending counts it once
    expect(after.income).toBe(before.income); // and the transfer itself is still neutral
    const spend = after.buckets.find((b: { bucketId: string }) => b.bucketId === "spend");
    const spendBefore = before.buckets.find((b: { bucketId: string }) => b.bucketId === "spend");
    expect(spendBefore.closing - spend.closing).toBe(50);
  });

  it("needs a bucket when there is a plan, and saves nothing without one", async () => {
    const { user, bank, cash } = await setup();
    const res = await transfer({ fromAccountId: bank.id, toAccountId: cash.id, amount: 100, fee: 5 });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/bucket the transfer fee/);
    expect(await testDb.transfer.count({})).toBe(0);
    expect(await testDb.transaction.count({ where: { userId: user.id, type: "e" } })).toBe(0);
  });

  it("is blocked at zero like any expense: the whole transfer is refused and nothing is saved", async () => {
    const { user, bank, cash } = await setup(); // Spend holds ₦8,100
    const res = await transfer({ fromAccountId: bank.id, toAccountId: cash.id, amount: 100, fee: 9_000, feeBucketId: "spend" });
    expect(res.status).toBe(422);
    const data = await res.json();
    expect(data.blocked).toBe(true);
    expect(data.shortfall).toMatchObject({ bucketId: "spend", available: 8_100, requested: 9_000 });
    expect(data.error).toMatch(/The transfer was not made/);
    expect(await testDb.transfer.count({})).toBe(0);
    expect(await testDb.transaction.count({ where: { userId: user.id, type: "e" } })).toBe(0);
    expect((await accountsNow()).byName("Bank").balance).toBe(100_000);
  });

  it("with no plan yet, the fee is still an expense, just in no bucket", async () => {
    const user = await signedIn();
    const bank = await create({ name: "Bank", openingBalance: 1_000 });
    const cash = await create({ name: "Cash" });
    expect((await transfer({ fromAccountId: bank.id, toAccountId: cash.id, amount: 100, fee: 10 })).status).toBe(200);
    const fee = (await testDb.transaction.findMany({ where: { userId: user.id } }))[0];
    expect(fee).toMatchObject({ type: "e", amount: 10, bucketId: null });
    expect((await accountsNow()).byName("Bank").balance).toBe(890);
  });

  it("deleting the transfer removes its fee too, and the numbers return", async () => {
    const { user, bank, cash, snap } = await setup();
    const before = await snap();
    const made = (await (await transfer({ fromAccountId: bank.id, toAccountId: cash.id, amount: 10_000, fee: 50, feeBucketId: "spend" })).json()).transfer;

    expect((await removeTransfer(made.id)).status).toBe(200);
    expect(await testDb.transaction.count({ where: { userId: user.id, transferId: { not: null } } })).toBe(0);
    expect((await accountsNow()).byName("Bank").balance).toBe(100_000);
    expect((await snap()).expenses).toBe(before.expenses);
  });

  it("the fee can not be edited or deleted on its own", async () => {
    const { user, bank, cash } = await setup();
    await transfer({ fromAccountId: bank.id, toAccountId: cash.id, amount: 100, fee: 5, feeBucketId: "spend" });
    const fee = (await testDb.transaction.findMany({ where: { userId: user.id, transferId: { not: null } } }))[0];

    const edit = await patchTx(fee.id, { amount: 1 });
    expect(edit.status).toBe(400);
    expect((await edit.json()).error).toMatch(/deleting the transfer/);
    expect((await deleteTx(fee.id)).status).toBe(400);
    expect(await testDb.transaction.count({ where: { id: fee.id } })).toBe(1);
  });

  it("a transfer with no fee records no expense at all", async () => {
    const { user, bank, cash } = await setup();
    await transfer({ fromAccountId: bank.id, toAccountId: cash.id, amount: 1_000 });
    expect(await testDb.transaction.count({ where: { userId: user.id, type: "e" } })).toBe(0);
  });

  it.skipIf(usingPostgres)("if saving the fee fails, the transfer is not left behind either", async () => {
    const { user, bank, cash } = await setup();
    fakeDb!.__failNext("transaction.create");
    const res = await transfer({ fromAccountId: bank.id, toAccountId: cash.id, amount: 1_000, fee: 5, feeBucketId: "spend" }).catch(() => null);
    expect(res === null || res.status === 500).toBe(true);
    expect(await testDb.transfer.count({})).toBe(0);
    expect(await testDb.transaction.count({ where: { userId: user.id, type: "e" } })).toBe(0);
  });
});
