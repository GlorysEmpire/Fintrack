/**
 * Money in whole minor units, step 1: every write path stores the exact integer
 * amount next to the Float, and the two never disagree.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", async () => ({ prisma: (await import("@/test/db")).testDb }));

import { cleanup, createUser, seedPlan, testDb } from "@/test/harness";
import { createTransaction, updateTransaction } from "./transactions";
import { createTransfer } from "./transfers";
import { createAccount } from "./accounts";
import { ledgerDrift } from "./ledger";

afterEach(cleanup);

async function setup() {
  const user = await createUser({ onboarding: "completed" });
  await seedPlan(user.id);
  return { user, session: { id: user.id, baseCurrency: user.baseCurrency, fxRates: user.fxRates } };
}

describe("exact amounts (minor units)", () => {
  it("income and expense are stored in kobo exactly, and an edit updates both", async () => {
    const { user, session } = await setup();
    const inc = await createTransaction(session, { type: "i", amount: 100_000.1, currency: "NGN" });
    expect(inc.status).toBe("ok");
    const exp = await createTransaction(session, { type: "e", amount: 1234.56, currency: "NGN", bucketId: "spend" });
    expect(exp.status).toBe("ok");
    const rows = await testDb.transaction.findMany({ where: { userId: user.id }, orderBy: { amount: "desc" } });
    expect(rows.map((r) => Number(r.amountMinor))).toEqual([10_000_010, 123_456]);

    if (exp.status !== "ok") throw new Error("unreachable");
    const edited = await updateTransaction(session, exp.transaction.id, { amount: 999.99 });
    expect(edited.status).toBe("ok");
    const after = await testDb.transaction.findUnique({ where: { id: exp.transaction.id } });
    expect(after?.amount).toBe(999.99);
    expect(Number(after?.amountMinor)).toBe(99_999);
    expect(await ledgerDrift(user.id)).toEqual([]);
  });

  it("a transfer's fee is stored exactly too", async () => {
    const { user, session } = await setup();
    await createTransaction(session, { type: "i", amount: 100_000, currency: "NGN" }); // funds the buckets the fee draws on
    const a = await createAccount(user.id, { name: "A", type: "bank", currency: "NGN", openingBalance: 50_000, openingDate: "2026-01-01" });
    const b = await createAccount(user.id, { name: "B", type: "bank", currency: "NGN", openingBalance: 0, openingDate: "2026-01-01" });
    if (a.status !== "ok" || b.status !== "ok") throw new Error("accounts");
    const t = await createTransfer(session, { fromAccountId: a.account.id, toAccountId: b.account.id, amount: 10_000, fee: 52.5, feeBucketId: "spend" });
    expect(t.status).toBe("ok");
    const fee = await testDb.transaction.findFirst({ where: { userId: user.id, transferId: { not: null } } });
    expect(Number(fee?.amountMinor)).toBe(5250);
    expect(await ledgerDrift(user.id)).toEqual([]);
  });

  it("the whole point: floats drift, minor units do not", () => {
    expect(0.1 + 0.2).not.toBe(0.3);
    expect(10 + 20).toBe(30); // 0.10 + 0.20 in kobo
  });

  it("the drift check does catch a row that disagrees", async () => {
    const { user } = await setup();
    await testDb.transaction.create({ data: { userId: user.id, type: "i", amount: 5, amountMinor: BigInt(499) } });
    await testDb.transaction.create({ data: { userId: user.id, type: "i", amount: 7 } }); // no minor amount yet
    expect((await ledgerDrift(user.id)).length).toBe(2);
  });
});
