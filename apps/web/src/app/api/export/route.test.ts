/**
 * The data export: only the signed-in user's data, no secrets, safe CSV.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", async () => ({ prisma: (await import("@/test/db")).testDb }));
vi.mock("@/lib/auth", async () => ({
  getSessionUser: (await import("@/test/harness")).sessionUser,
}));

import { cleanup, createUser, seedPlan, seedTx, signIn, testDb } from "@/test/harness";
import { GET } from "./route";

afterEach(cleanup);

const get = (query = "") => GET(new Request(`http://localhost/api/export${query}`));

async function withEverything() {
  const user = await createUser({ passwordHash: "$argon2id$SECRET-HASH" });
  signIn(user);
  await seedPlan(user.id);
  const source = await testDb.incomeSource.create({ data: { userId: user.id, name: "Salary" } });
  const bank = await testDb.account.create({
    data: { userId: user.id, name: "GTBank", kind: "asset", type: "bank", openingBalanceMinor: BigInt(100_050), openingDate: new Date("2026-01-01T12:00:00Z") },
  });
  const cash = await testDb.account.create({
    data: { userId: user.id, name: "Cash", kind: "asset", type: "cash", openingDate: new Date("2026-01-01T12:00:00Z") },
  });
  await seedTx(user.id, { type: "i", amount: 100_000, sourceId: source.id, date: new Date("2026-10-02T12:00:00Z") });
  const spend = await seedTx(user.id, { type: "e", amount: 1_250.5, bucketId: "spend", date: new Date("2026-10-05T12:00:00Z"), note: "=HYPERLINK(\"http://evil\",\"x\")" });
  await testDb.transaction.update({ where: { id: spend.id }, data: { accountId: bank.id, category: "food" } });
  await testDb.transfer.create({
    data: { userId: user.id, fromAccountId: bank.id, toAccountId: cash.id, fromAmountMinor: BigInt(500_000), toAmountMinor: BigInt(500_000), feeMinor: BigInt(5_000), date: new Date("2026-10-06T12:00:00Z"), note: "ATM, \"cash\"" },
  });
  await testDb.session.create({ data: { userId: user.id, token: "SECRET-SESSION-TOKEN", expiresAt: new Date(Date.now() + 86_400_000) } });
  await testDb.aiMessage.create({ data: { userId: user.id, role: "user", content: "private chat" } });
  return { user, bank, cash };
}

describe("GET /api/export", () => {
  it("needs sign-in", async () => {
    signIn(null);
    expect((await get()).status).toBe(401);
  });

  it("returns everything the user has, exactly, as a download that is never cached", async () => {
    await withEverything();
    const res = await get();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toMatch(/^attachment; filename="fintrack-export-\d{4}-\d{2}-\d{2}\.json"$/);
    expect(res.headers.get("cache-control")).toBe("no-store");

    const data = await res.json();
    expect(data.schemaVersion).toBe(1);
    expect(data.accounts).toHaveLength(2);
    expect(data.accounts.find((a: { name: string }) => a.name === "GTBank")).toMatchObject({ openingBalance: "1000.50", openingDate: "2026-01-01" });
    expect(data.transactions).toHaveLength(2);
    const expense = data.transactions.find((t: { type: string }) => t.type === "expense");
    expect(expense).toMatchObject({ amount: "1250.50", date: "2026-10-05", bucket: "Spend", account: "GTBank", category: "food" });
    expect(data.transfers[0]).toMatchObject({ fromAccount: "GTBank", toAccount: "Cash", amountSent: "5000.00", amountReceived: "5000.00", fee: "50.00" });
    expect(data.plan.buckets.length).toBeGreaterThan(0);
  });

  it("never includes secrets: password hash, session tokens, or the private chat", async () => {
    await withEverything();
    const text = await (await get()).text();
    expect(text).not.toContain("SECRET-HASH");
    expect(text).not.toContain("argon2");
    expect(text).not.toContain("SECRET-SESSION-TOKEN");
    expect(text).not.toContain("private chat");
    expect(text).not.toMatch(/passwordHash|token/i);
  });

  it("never includes another user's data", async () => {
    const other = await createUser();
    await seedTx(other.id, { type: "i", amount: 7_777_777 });
    await testDb.account.create({ data: { userId: other.id, name: "SecretVault", kind: "asset", type: "savings", openingDate: new Date("2026-01-01T12:00:00Z") } });
    await withEverything();
    const text = await (await get()).text();
    expect(text).not.toContain("7777777");
    expect(text).not.toContain("SecretVault");
    for (const kind of ["transactions", "transfers", "accounts"]) {
      const csv = await (await get(`?type=${kind}`)).text();
      expect(csv).not.toContain("SecretVault");
      expect(csv).not.toContain("7777777");
    }
  });

  it("exports transactions as CSV with the money exact and formulas defused", async () => {
    await withEverything();
    const res = await get("?type=transactions");
    expect(res.headers.get("content-type")).toMatch(/^text\/csv/);
    expect(res.headers.get("content-disposition")).toMatch(/fintrack-transactions-/);
    const csv = await res.text();
    const [header, ...rows] = csv.trim().split("\r\n");
    expect(header.startsWith("date,recorded_at,type,amount,currency,account,bucket")).toBe(true);
    expect(rows).toHaveLength(2);
    const expenseRow = rows.find((r) => r.includes("expense"))!;
    expect(expenseRow).toContain(",1250.50,NGN,GTBank,Spend,food,");
    // the note starts with "=", so it is stored as text and can not run as a formula
    expect(expenseRow).toContain("\"'=HYPERLINK(");
    expect(expenseRow).not.toMatch(/,=HYPERLINK/);
  });

  it("exports transfers and accounts as CSV", async () => {
    await withEverything();
    const transfers = (await (await get("?type=transfers")).text()).trim().split("\r\n");
    expect(transfers[0]).toBe("date,recorded_at,from_account,to_account,amount_sent,amount_received,fee,exchange_rate,note,reference,id");
    expect(transfers[1]).toContain(",GTBank,Cash,5000.00,5000.00,50.00,");
    expect(transfers[1]).toContain('"ATM, ""cash"""');
    const accounts = (await (await get("?type=accounts")).text()).trim().split("\r\n");
    expect(accounts).toHaveLength(3);
    expect(accounts[1]).toMatch(/^Cash,asset,cash,,NGN,active,0\.00,2026-01-01,/);
  });

  it("rejects an unknown type", async () => {
    await withEverything();
    expect((await get("?type=passwords")).status).toBe(400);
  });

  it("is limited to 10 a hour per user", async () => {
    await withEverything();
    let last = 200;
    for (let i = 0; i < 12; i++) last = (await get()).status;
    expect(last).toBe(429);
  });
});
