/**
 * Regression: an account opened today accepts what happened earlier today.
 * (An opening date used to be compared as the instant noon UTC, so anything
 * recorded before 12:00 UTC on the opening day was refused.)
 */
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", async () => ({ prisma: (await import("@/test/db")).testDb }));

import { createAccount, listAccounts } from "@/lib/accounts";
import { createTransaction } from "@/lib/transactions";
import { createTransfer } from "@/lib/transfers";
import { cleanup, createUser } from "@/test/harness";

afterEach(cleanup);

// 07:00 in Lagos, before the noon-UTC instant the opening date is stored at
const EARLY = new Date("2026-10-27T06:00:00Z");

describe("an account opened today accepts what happened earlier today", () => {
  it("takes an income and a transfer recorded this morning, and still refuses yesterday", async () => {
    const user = await createUser();
    const session = { id: user.id, baseCurrency: user.baseCurrency, fxRates: user.fxRates };

    const a = await createAccount(user.id, { name: "A", type: "bank", currency: "NGN", openingBalance: 1_000, openingDate: "2026-10-27" }, EARLY);
    const b = await createAccount(user.id, { name: "B", type: "bank", currency: "NGN", openingBalance: 0, openingDate: "2026-10-27" }, EARLY);
    if (a.status !== "ok" || b.status !== "ok") throw new Error("accounts not created");

    const income = await createTransaction(session, { type: "i", amount: 500, currency: "NGN", accountId: a.account.id }, EARLY);
    expect(income.status).toBe("ok");
    const sent = await createTransfer(session, { fromAccountId: a.account.id, toAccountId: b.account.id, amount: 200 }, EARLY);
    expect(sent.status).toBe("ok");

    const { accounts } = await listAccounts(user.id);
    expect(accounts.find((x) => x.name === "A")!.balance).toBe(1_300); // 1,000 + 500 − 200
    expect(accounts.find((x) => x.name === "B")!.balance).toBe(200);

    const yesterday = await createTransaction(session, { type: "i", amount: 5, currency: "NGN", accountId: a.account.id, date: "2026-10-26" }, EARLY);
    expect(yesterday.status).toBe("invalid");
  });
});
