/**
 * FINANCIAL INTEGRITY SUITE
 *
 * A long, seeded, random run of real operations (income, expenses, transfers
 * with fees, adjustments, deletions) through the same services the app uses,
 * for two users at once. After EVERY operation the books are checked against
 * independent arithmetic done here straight from the raw rows:
 *
 *   1. Every account balance equals opening + income - expenses + transfers in
 *      - transfers out + adjustments, in whole kobo.
 *   2. Moving money between accounts never changes the total across them: the
 *      accounts as a whole change only by income, expenses and adjustments.
 *   3. The month's income and expenses (the performance figures) equal the sum
 *      of the transaction rows: transfers never leak into them.
 *   4. No bucket is ever below zero: the zero-block held for every operation.
 *   5. Every transfer fee is exactly one expense transaction of the same amount.
 *   6. One user's activity never changes anything about the other user.
 * At the end: the export agrees with the books, and Reset leaves no money data.
 *
 * Deterministic (fixed seed), so a failure reproduces exactly.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", async () => ({ prisma: (await import("@/test/db")).testDb }));

import { allTimeBucketStates, MONEY_EPSILON, movedByBucket, type MoneyTx } from "@fintrack/domain";
import { reallocationTxs } from "@/lib/reallocations";
import { adjustBalance, createAccount, listAccounts } from "@/lib/accounts";
import { buildExport } from "@/lib/export";
import { getPerformance } from "@/lib/performance";
import { parsePlan } from "@/lib/plan";
import { parseFx } from "@/lib/money";
import { resetFinancialData } from "@/lib/reset";
import { createTransaction, deleteTransaction } from "@/lib/transactions";
import { createTransfer, deleteTransfer } from "@/lib/transfers";
import { cleanup, createUser, seedPlan, seedTx, testDb } from "@/test/harness";

afterEach(cleanup);

/** mulberry32: a tiny seeded random generator */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const BUCKETS = ["tithe", "emergency", "invest", "give", "save", "spend"];
const minor = (n: number) => Math.round(n * 100);

type Actor = { id: string; session: { id: string; baseCurrency: string; fxRates: string }; accountIds: string[] };

async function newActor(openings: number[]): Promise<Actor> {
  const user = await createUser();
  await seedPlan(user.id);
  // ₦1,000,000 of income this month so buckets have real room
  await seedTx(user.id, { type: "i", amount: 1_000_000, date: new Date() });
  const session = { id: user.id, baseCurrency: user.baseCurrency, fxRates: user.fxRates };
  const accountIds: string[] = [];
  for (let i = 0; i < openings.length; i++) {
    const made = await createAccount(user.id, {
      name: `Account ${i + 1}`,
      type: i === openings.length - 1 ? "credit_card" : "bank",
      currency: "NGN",
      openingBalance: openings[i],
      openingDate: "2026-01-01",
    });
    if (made.status !== "ok") throw new Error("setup failed");
    accountIds.push(made.account.id);
  }
  return { id: user.id, session, accountIds };
}

/** Everything the books should say, worked out from raw rows with no help from the app's own balance code */
async function oracle(actor: Actor) {
  const [accounts, txs, transfers, adjustments] = await Promise.all([
    testDb.account.findMany({ where: { userId: actor.id } }),
    testDb.transaction.findMany({ where: { userId: actor.id } }),
    testDb.transfer.findMany({ where: { userId: actor.id } }),
    testDb.accountAdjustment.findMany({ where: { userId: actor.id } }),
  ]);
  const balances = new Map<string, number>();
  for (const a of accounts) {
    let m = Number(a.openingBalanceMinor);
    for (const t of txs.filter((x) => x.accountId === a.id)) m += t.type === "i" ? minor(t.amount) : -minor(t.amount);
    for (const t of transfers) {
      if (t.toAccountId === a.id) m += Number(t.toAmountMinor);
      if (t.fromAccountId === a.id) m -= Number(t.fromAmountMinor);
    }
    for (const j of adjustments.filter((x) => x.accountId === a.id)) m += Number(j.amountMinor);
    balances.set(a.id, m);
  }
  const income = txs.filter((t) => t.type === "i").reduce((s, t) => s + minor(t.amount), 0);
  const expenses = txs.filter((t) => t.type === "e").reduce((s, t) => s + minor(t.amount), 0);
  const assignedNet = txs
    .filter((t) => t.accountId)
    .reduce((s, t) => s + (t.type === "i" ? minor(t.amount) : -minor(t.amount)), 0);
  const adjustmentTotal = adjustments.reduce((s, j) => s + Number(j.amountMinor), 0);
  const openingTotal = accounts.reduce((s, a) => s + Number(a.openingBalanceMinor), 0);
  return { accounts, txs, transfers, balances, income, expenses, assignedNet, adjustmentTotal, openingTotal };
}

async function checkBooks(actor: Actor, label: string) {
  const o = await oracle(actor);
  const { accounts } = await listAccounts(actor.id);

  // 1. Every balance, exactly
  for (const a of accounts) {
    expect(Math.round(a.balance * 100), `${label}: balance of ${a.name}`).toBe(o.balances.get(a.id));
  }

  // 2. Transfers cancel out across the accounts as a whole
  const totalNow = [...o.balances.values()].reduce((s, v) => s + v, 0);
  expect(totalNow - o.openingTotal, `${label}: accounts changed by something other than income, expenses and adjustments`).toBe(
    o.assignedNet + o.adjustmentTotal
  );

  // 3. The month's income and expenses are exactly the transaction rows (transfers never leak in)
  const perf = await getPerformance({ id: actor.id, baseCurrency: "NGN", fxRates: actor.session.fxRates });
  const month = perf.months[perf.months.length - 1];
  expect(Math.round(month.income * 100), `${label}: income`).toBe(o.income);
  expect(Math.round(month.expenses * 100), `${label}: expenses`).toBe(o.expenses);

  // 4. No bucket is below zero
  const planRow = await testDb.budgetPlan.findUnique({ where: { userId: actor.id } });
  const moneyTxs: MoneyTx[] = [
    ...o.txs.map((t) => ({ type: t.type as "i" | "e", amount: t.amount, currency: t.currency, bucketId: t.bucketId, sourceId: t.sourceId, date: t.date })),
    ...(await reallocationTxs(actor.id)),
  ];
  for (const b of allTimeBucketStates(moneyTxs, parsePlan(planRow!), "NGN", parseFx(actor.session.fxRates))) {
    expect(b.closing, `${label}: bucket ${b.bucketId} went below zero`).toBeGreaterThanOrEqual(-MONEY_EPSILON);
  }

  // 4b. Approved exceptions: each is tied to a real expense in the receiving bucket, funds no more
  //     than that expense, and moves money without creating or destroying any (they net to zero)
  const moves = await testDb.reallocation.findMany({ where: { userId: actor.id } });
  for (const r of moves) {
    const tx = o.txs.find((t) => t.id === r.transactionId);
    expect(tx, `${label}: an exception with no expense`).toBeDefined();
    expect(tx!.type).toBe("e");
    expect(tx!.bucketId).toBe(r.toBucketId);
    expect(Number(r.amountMinor), `${label}: an exception larger than its expense`).toBeLessThanOrEqual(minor(tx!.amount));
    expect(r.fromBucketId).not.toBe(r.toBucketId);
    expect(r.reason.trim().length).toBeGreaterThan(0);
  }
  const netMoved = Object.values(movedByBucket(await reallocationTxs(actor.id), "NGN", parseFx(actor.session.fxRates))).reduce((a, b) => a + b, 0);
  expect(Math.abs(netMoved), `${label}: exceptions created or destroyed money`).toBeLessThan(0.005);

  // 5. Every fee is exactly one expense of the same amount, and nothing else points at a transfer
  for (const t of o.transfers) {
    const fees = o.txs.filter((x) => x.transferId === t.id);
    if (Number(t.feeMinor) === 0) expect(fees, `${label}: a fee that should not exist`).toHaveLength(0);
    else {
      expect(fees, `${label}: fee transaction`).toHaveLength(1);
      expect(minor(fees[0].amount)).toBe(Number(t.feeMinor));
      expect(fees[0].type).toBe("e");
    }
  }
  for (const x of o.txs.filter((t) => t.transferId)) {
    expect(o.transfers.some((t) => t.id === x.transferId), `${label}: orphaned fee`).toBe(true);
  }
}

/** Everything about one user, as a comparable fingerprint */
async function fingerprint(actor: Actor) {
  const o = await oracle(actor);
  return JSON.stringify({
    balances: [...o.balances.entries()].sort(),
    txs: o.txs.length,
    transfers: o.transfers.length,
    income: o.income,
    expenses: o.expenses,
  });
}

describe("financial integrity under a long random run", () => {
  it("keeps every book exactly right after every operation, for two users, without leaking between them", async () => {
    const random = rng(20261027);
    const pick = <T,>(xs: T[]) => xs[Math.floor(random() * xs.length)];
    const amount = () => Math.round((random() * 40_000 + 1) * 100) / 100; // ₦0.01 .. ₦40,000 with kobo

    const a = await newActor([250_000, 80_000.5, 0, 12_000]);
    const b = await newActor([40_000, 0]);
    const bBefore = await fingerprint(b);

    const operate = async (actor: Actor) => {
      const roll = random();
      if (roll < 0.25) {
        await createTransaction(actor.session, { type: "i", amount: amount(), currency: "NGN", accountId: random() < 0.9 ? pick(actor.accountIds) : null });
      } else if (roll < 0.55) {
        const input = {
          // No category: a category that does not match its bucket is a different rule (cross-bucket) with its own tests
          type: "e" as const,
          // Now and then a big one, so some expenses exceed their bucket and need an approved exception
          amount: random() < 0.2 ? Math.round((60_000 + random() * 90_000) * 100) / 100 : amount(),
          currency: "NGN" as const,
          bucketId: pick(BUCKETS),
          category: null,
          accountId: random() < 0.9 ? pick(actor.accountIds) : null,
        };
        const first = await createTransaction(actor.session, input);
        if (first.status === "blocked" && first.shortfall.options.length > 0 && random() < 0.7) {
          await createTransaction(actor.session, {
            ...input,
            fundFrom: { bucketId: pick(first.shortfall.options).bucketId, reason: "integrity run" },
          });
        }
      } else if (roll < 0.75 && actor.accountIds.length > 1) {
        const from = pick(actor.accountIds);
        const to = pick(actor.accountIds.filter((x) => x !== from));
        await createTransfer(actor.session, {
          fromAccountId: from, toAccountId: to, amount: amount(),
          fee: random() < 0.4 ? Math.round(random() * 5_000) / 100 + 0.01 : null,
          feeBucketId: pick(BUCKETS),
        });
      } else if (roll < 0.83) {
        await adjustBalance(actor.id, pick(actor.accountIds), { actualBalance: Math.round(random() * 300_000 * 100) / 100 });
      } else if (roll < 0.92) {
        const own = await testDb.transaction.findMany({ where: { userId: actor.id, transferId: null } });
        // keep the seeded income that gives the buckets room
        const spare = own.filter((t) => !(t.type === "i" && t.amount === 1_000_000));
        if (spare.length) await deleteTransaction(actor.session, pick(spare).id);
      } else {
        const own = await testDb.transfer.findMany({ where: { userId: actor.id } });
        if (own.length) await deleteTransfer(actor.id, pick(own).id);
      }
    };

    // Phase 1: only user A acts. User B must not change at all.
    for (let i = 0; i < 70; i++) {
      await operate(a);
      await checkBooks(a, `A op ${i}`);
    }
    expect(await fingerprint(b), "user B changed while only user A acted").toBe(bBefore);
    await checkBooks(b, "B untouched");

    // Phase 2: both act, interleaved
    for (let i = 0; i < 50; i++) {
      await operate(i % 2 ? a : b);
      await checkBooks(a, `A mixed ${i}`);
      await checkBooks(b, `B mixed ${i}`);
    }

    // The run really did things (a test that quietly refuses every operation would prove nothing)
    const [txCount, transferCount, adjustmentCount, feeCount, expenseCount] = await Promise.all([
      testDb.transaction.count({ where: { userId: a.id } }),
      testDb.transfer.count({ where: { userId: a.id } }),
      testDb.accountAdjustment.count({ where: { userId: a.id } }),
      testDb.transaction.count({ where: { userId: a.id, transferId: { not: null } } }),
      testDb.transaction.count({ where: { userId: a.id, type: "e", transferId: null } }),
    ]);
    expect(txCount).toBeGreaterThan(15);
    expect(transferCount).toBeGreaterThan(3);
    expect(adjustmentCount).toBeGreaterThan(0);
    expect(feeCount).toBeGreaterThan(0);
    expect(expenseCount).toBeGreaterThan(5);
    expect(await testDb.reallocation.count({ where: { userId: a.id } }), "no exception was ever approved in the run").toBeGreaterThan(0);

    // The export agrees with the books
    for (const actor of [a, b]) {
      const o = await oracle(actor);
      const bundle = await buildExport(actor.id);
      expect(bundle.transactions).toHaveLength(o.txs.length);
      expect(bundle.transfers).toHaveLength(o.transfers.length);
      const exportedIncome = bundle.transactions.filter((t) => t.type === "income").reduce((s, t) => s + Math.round(Number(t.amount) * 100), 0);
      expect(exportedIncome).toBe(o.income);
    }

    // Reset leaves no money data for that user, and does not touch the other user
    const bBeforeReset = await fingerprint(b);
    await resetFinancialData(a.id);
    const left = await Promise.all([
      testDb.transaction.count({ where: { userId: a.id } }),
      testDb.transfer.count({ where: { userId: a.id } }),
      testDb.account.count({ where: { userId: a.id } }),
      testDb.accountAdjustment.count({ where: { userId: a.id } }),
      testDb.reallocation.count({ where: { userId: a.id } }),
    ]);
    expect(left).toEqual([0, 0, 0, 0, 0]);
    expect(await testDb.user.findUnique({ where: { id: a.id } })).not.toBeNull();
    expect(await fingerprint(b)).toBe(bBeforeReset);
  }, 120_000);

  it("a transfer between a naira and a dollar account moves exactly the stated amounts and changes no spending", async () => {
    const user = await createUser();
    await seedPlan(user.id);
    await seedTx(user.id, { type: "i", amount: 100_000, date: new Date() });
    const session = { id: user.id, baseCurrency: user.baseCurrency, fxRates: user.fxRates };
    const ngn = await createAccount(user.id, { name: "Naira", type: "bank", currency: "NGN", openingBalance: 500_000, openingDate: "2026-01-01" });
    const usd = await createAccount(user.id, { name: "Dollars", type: "bank", currency: "USD", openingBalance: 0, openingDate: "2026-01-01" });
    if (ngn.status !== "ok" || usd.status !== "ok") throw new Error("setup failed");
    const before = await getPerformance({ id: user.id, baseCurrency: "NGN", fxRates: user.fxRates });

    const res = await createTransfer(session, { fromAccountId: ngn.account.id, toAccountId: usd.account.id, amount: 158_000, toAmount: 98.5 });
    expect(res.status).toBe("ok");

    const { accounts } = await listAccounts(user.id);
    expect(accounts.find((x) => x.name === "Naira")!.balance).toBe(342_000);
    expect(accounts.find((x) => x.name === "Dollars")!.balance).toBe(98.5);
    const after = await getPerformance({ id: user.id, baseCurrency: "NGN", fxRates: user.fxRates });
    expect(after.months).toEqual(before.months);
  });
});
