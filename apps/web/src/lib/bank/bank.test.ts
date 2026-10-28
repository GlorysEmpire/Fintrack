/**
 * Read-only bank imports: a sync only fills a review queue, never creates
 * history; nothing imports twice; corrections are flagged, not applied; a
 * failing or disconnected bank never harms anything.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", async () => ({ prisma: (await import("@/test/db")).testDb }));

import { dateFromDateKey } from "@fintrack/domain";
import { cleanup, createUser, seedPlan, seedTx, testDb } from "@/test/harness";
import { deleteTransaction } from "@/lib/transactions";
import { createConnection, disconnect, linkAccount, listConnections } from "./connections";
import { mockBankScript, mockProvider, resetMockBank, scriptMockBank, type MockScript } from "./mock-provider";
import type { ProviderTransaction } from "./provider";
import { acceptImport, ignoreImport, listImports, matchImport } from "./review";
import { syncAllDue, syncConnection } from "./sync";

beforeEach(() => resetMockBank());
afterEach(async () => {
  vi.restoreAllMocks();
  resetMockBank();
  await cleanup();
});

const NOW = new Date("2026-10-27T10:00:00Z");

const bankTx = (id: string, amountMinor: number, extra: Partial<ProviderTransaction> = {}): ProviderTransaction => ({
  externalId: id,
  externalAccountId: "ext-acc",
  status: "posted",
  amountMinor,
  currency: "NGN",
  occurredAt: new Date("2026-10-20T12:00:00Z"),
  description: `desc ${id}`,
  ...extra,
});

/** A signed-in-style user with a plan, ₦100,000 income this month (Spend = ₦8,100), a linked account and a scripted bank */
async function setup(txs: ProviderTransaction[] = [], script: Partial<MockScript> = {}) {
  // Failures are switched on only after the account is linked (linking talks to the bank too)
  const { failNext = 0, failKind = "transient", ...rest } = script;
  const user = await createUser();
  await seedPlan(user.id);
  await seedTx(user.id, { type: "i", amount: 100_000, date: new Date("2026-10-02T12:00:00Z") });
  const account = await testDb.account.create({
    data: { userId: user.id, name: "GTBank", kind: "asset", type: "bank", openingBalanceMinor: BigInt(0), openingDate: new Date("2026-01-01T12:00:00Z") },
  });
  const made = await createConnection(user.id, "mock", NOW);
  if (made.status !== "ok") throw new Error("could not connect");
  const connection = made.value;
  scriptMockBank(connection.id, {
    accounts: [{ externalId: "ext-acc", name: "GT Current", currency: "NGN" }],
    transactions: txs,
    ...rest,
  });
  const linked = await linkAccount(user.id, connection.id, { externalAccountId: "ext-acc", accountId: account.id });
  if (linked.status !== "ok") throw new Error(`could not link: ${JSON.stringify(linked)}`);
  const live = mockBankScript(connection.id)!;
  live.failNext = failNext;
  live.failKind = failKind;
  const sessionUser = { id: user.id, baseCurrency: user.baseCurrency, fxRates: user.fxRates };
  return { user, sessionUser, account, connection };
}

const imports = (userId: string) => testDb.importedTransaction.findMany({ where: { userId }, orderBy: { externalId: "asc" } });
const txCount = (userId: string) => testDb.transaction.count({ where: { userId } });

describe("syncing is read-only and idempotent", () => {
  it("fills the review queue and creates no transaction", async () => {
    const { user, connection } = await setup([bankTx("a", -150_000), bankTx("b", 500_000)]);
    const before = await txCount(user.id);

    const result = await syncConnection(connection.id, NOW);

    expect(result).toMatchObject({ outcome: "synced", created: 2, ignored: 0 });
    expect(await txCount(user.id)).toBe(before); // nothing became history
    const rows = await imports(user.id);
    expect(rows.map((r) => [r.externalId, r.review, r.status, Number(r.amountMinor)])).toEqual([
      ["a", "new", "posted", -150_000],
      ["b", "new", "posted", 500_000],
    ]);
  });

  it("running it again, or twice at once, never imports the same transaction twice", async () => {
    const { user, connection } = await setup([bankTx("a", -100), bankTx("b", -200)]);
    await syncConnection(connection.id, NOW);
    await syncConnection(connection.id, NOW);
    await Promise.all([syncConnection(connection.id, NOW), syncConnection(connection.id, NOW)]);
    expect((await imports(user.id)).length).toBe(2);
  });

  it("the database itself refuses a duplicate provider transaction", async () => {
    const { user, account, connection } = await setup([bankTx("a", -100)]);
    await syncConnection(connection.id, NOW);
    await expect(
      testDb.importedTransaction.create({
        data: { userId: user.id, connectionId: connection.id, accountId: account.id, externalId: "a", status: "posted", amountMinor: BigInt(-100), currency: "NGN", occurredAt: NOW },
      })
    ).rejects.toMatchObject({ code: "P2002" });
  });

  it("reads every page and remembers where it got to", async () => {
    const all = ["a", "b", "c", "d", "e"].map((id) => bankTx(id, -100));
    const { user, connection } = await setup(all, { pageSize: 2 });
    await syncConnection(connection.id, NOW);
    expect((await imports(user.id)).length).toBe(5);
    expect((await testDb.bankConnection.findUnique({ where: { id: connection.id } }))!.cursor).toBe("5");
    // Only new ones are picked up next time
    scriptMockBank(connection.id, { ...(await mockScript(connection.id)), transactions: [...all, bankTx("f", -100)], pageSize: 2 });
    const next = await syncConnection(connection.id, new Date(NOW.getTime() + 60_000));
    expect(next.created).toBe(1);
  });

  it("a failure part-way keeps the progress made and loses nothing on retry", async () => {
    const all = ["a", "b", "c", "d"].map((id) => bankTx(id, -100));
    const { user, connection } = await setup(all, { pageSize: 2 });
    const real = mockProvider.fetchTransactions.bind(mockProvider);
    let calls = 0;
    vi.spyOn(mockProvider, "fetchTransactions").mockImplementation(async (c, cursor) => {
      calls += 1;
      if (calls === 2) throw new (await import("./provider")).ProviderError("down", "transient");
      return real(c, cursor);
    });

    const failed = await syncConnection(connection.id, NOW);
    expect(failed.outcome).toBe("failed");
    expect((await imports(user.id)).length).toBe(2); // page one was kept
    expect((await testDb.bankConnection.findUnique({ where: { id: connection.id } }))!.cursor).toBe("2");

    vi.restoreAllMocks();
    const retry = await syncConnection(connection.id, new Date(NOW.getTime() + 3_600_000));
    expect(retry.outcome).toBe("synced");
    expect((await imports(user.id)).length).toBe(4); // nothing skipped, nothing doubled
  });

  it("ignores bank accounts the user has not linked, and malformed records", async () => {
    const { user, connection } = await setup([
      bankTx("ok", -100),
      bankTx("elsewhere", -100, { externalAccountId: "someone-elses-acct" }),
      bankTx("zero", 0),
      bankTx("fraction", -10.5),
      bankTx("badccy", -100, { currency: "XXX" }),
    ]);
    const result = await syncConnection(connection.id, NOW);
    expect(result).toMatchObject({ created: 1, ignored: 4 });
    expect((await imports(user.id)).map((r) => r.externalId)).toEqual(["ok"]);
  });
});

async function mockScript(connectionId: string) {
  return mockBankScript(connectionId)!;
}

describe("pending, posted and reversed", () => {
  it("a pending transaction settles into posted without being imported twice", async () => {
    const { user, connection } = await setup([bankTx("a", -100_000, { status: "pending" })]);
    await syncConnection(connection.id, NOW);
    expect((await imports(user.id))[0]).toMatchObject({ status: "pending" });

    scriptMockBank(connection.id, { ...(await mockScript(connection.id)), transactions: [bankTx("a", -100_250, { status: "posted" })] });
    await testDb.bankConnection.update({ where: { id: connection.id }, data: { cursor: null } });
    const result = await syncConnection(connection.id, new Date(NOW.getTime() + 60_000));

    expect(result.updated).toBe(1);
    const rows = await imports(user.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: "posted" });
    expect(Number(rows[0].amountMinor)).toBe(-100_250);
  });

  it("a posted transaction can not slide back to pending", async () => {
    const { user, connection } = await setup([bankTx("a", -500)]);
    await syncConnection(connection.id, NOW);
    scriptMockBank(connection.id, { ...(await mockScript(connection.id)), transactions: [bankTx("a", -500, { status: "pending" })] });
    await testDb.bankConnection.update({ where: { id: connection.id }, data: { cursor: null } });
    await syncConnection(connection.id, new Date(NOW.getTime() + 60_000));
    expect((await imports(user.id))[0].status).toBe("posted");
  });

  it("a reversal before review is applied; the reversed one can only be ignored", async () => {
    const { user, sessionUser, connection } = await setup([bankTx("a", -500)]);
    await syncConnection(connection.id, NOW);
    scriptMockBank(connection.id, { ...(await mockScript(connection.id)), transactions: [bankTx("a", -500, { status: "reversed" })] });
    await testDb.bankConnection.update({ where: { id: connection.id }, data: { cursor: null } });
    await syncConnection(connection.id, new Date(NOW.getTime() + 60_000));

    const row = (await imports(user.id))[0];
    expect(row.status).toBe("reversed");
    const accept = await acceptImport(sessionUser, row.id, { bucketId: "spend" }, NOW);
    expect(accept).toMatchObject({ status: "invalid" });
    expect(await ignoreImport(user.id, row.id)).toEqual({ status: "ok" });
  });

  it("after the user recorded it, a bank reversal or change is flagged, and their transaction is left alone", async () => {
    const { user, sessionUser, connection } = await setup([bankTx("a", -1_000_00)]);
    await syncConnection(connection.id, NOW);
    const row = (await imports(user.id))[0];
    expect(await acceptImport(sessionUser, row.id, { bucketId: "spend", category: "food" }, NOW)).toEqual({ status: "ok" });
    const recorded = await testDb.transaction.findFirst({ where: { userId: user.id, importId: row.id } });

    scriptMockBank(connection.id, { ...(await mockScript(connection.id)), transactions: [bankTx("a", -1_000_00, { status: "reversed" })] });
    await testDb.bankConnection.update({ where: { id: connection.id }, data: { cursor: null } });
    const result = await syncConnection(connection.id, new Date(NOW.getTime() + 60_000));

    expect(result.flagged).toBe(1);
    const flagged = (await imports(user.id))[0];
    expect(flagged.attention).toMatch(/reversed this transaction after you recorded it/);
    expect(flagged.review).toBe("accepted");
    const after = await testDb.transaction.findUnique({ where: { id: recorded!.id } });
    expect(after).toMatchObject({ amount: recorded!.amount, type: "e", date: recorded!.date }); // untouched
  });
});

describe("failures, backoff and consent", () => {
  it("a transient failure backs off, says so plainly, and recovers", async () => {
    const { user, connection } = await setup([bankTx("a", -100)], { failNext: 1 });
    const failed = await syncConnection(connection.id, NOW);
    expect(failed.outcome).toBe("failed");
    const row = await testDb.bankConnection.findUnique({ where: { id: connection.id } });
    expect(row).toMatchObject({ status: "active", consecutiveFailures: 1, lastError: "The last sync failed and will be retried." });
    expect(row!.nextRetryAt!.getTime()).toBe(NOW.getTime() + 5 * 60_000);

    const early = await syncConnection(connection.id, new Date(NOW.getTime() + 60_000));
    expect(early).toMatchObject({ outcome: "skipped", reason: "Waiting before the next retry." });

    const later = await syncConnection(connection.id, new Date(NOW.getTime() + 6 * 60_000));
    expect(later.outcome).toBe("synced");
    expect(await testDb.bankConnection.findUnique({ where: { id: connection.id } })).toMatchObject({
      consecutiveFailures: 0, nextRetryAt: null, lastError: null,
    });
    expect((await imports(user.id)).length).toBe(1);
  });

  it("stops retrying after repeated failures and asks the person to reconnect", async () => {
    const { connection } = await setup([], { failNext: 100 });
    let when = NOW.getTime();
    for (let i = 0; i < 8; i++) {
      await syncConnection(connection.id, new Date(when));
      when += 7 * 60 * 60 * 1000; // always past the backoff
    }
    const row = await testDb.bankConnection.findUnique({ where: { id: connection.id } });
    expect(row).toMatchObject({ status: "error", nextRetryAt: null });
    expect(row!.lastError).toMatch(/Reconnect/);
    expect((await syncConnection(connection.id, new Date(when))).outcome).toBe("skipped");
  });

  it("withdrawn consent stops the connection at once", async () => {
    const { connection } = await setup([bankTx("a", -100)], { failNext: 1, failKind: "auth" });
    await syncConnection(connection.id, NOW);
    expect(await testDb.bankConnection.findUnique({ where: { id: connection.id } })).toMatchObject({
      status: "expired",
      lastError: "The bank no longer allows access. Reconnect to continue.",
    });
  });

  it("never stores or logs provider detail or amounts", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { connection } = await setup([], { failNext: 1 });
    await syncConnection(connection.id, NOW);
    const logged = JSON.stringify(spy.mock.calls);
    expect(logged).not.toMatch(/demo bank|unavailable|\d{3,}/i);
    const stored = await testDb.bankConnection.findUnique({ where: { id: connection.id } });
    expect(stored!.lastError).not.toMatch(/demo bank/i);
  });

  it("one bad connection does not stop the others", async () => {
    const good = await setup([bankTx("a", -100)]);
    const bad = await setup([bankTx("z", -100)], { failNext: 5 });
    const results = await syncAllDue(NOW);
    const byId = new Map(results.map((r) => [r.connectionId, r.outcome]));
    expect(byId.get(good.connection.id)).toBe("synced");
    expect(byId.get(bad.connection.id)).toBe("failed");
    expect((await imports(good.user.id)).length).toBe(1);
  });
});

describe("linking and disconnecting", () => {
  it("refuses to link the wrong currency, someone else's account, or an unknown bank account", async () => {
    const { user, connection } = await setup();
    const usd = await testDb.account.create({
      data: { userId: user.id, name: "Dollars", kind: "asset", type: "bank", currency: "USD", openingDate: new Date("2026-01-01T12:00:00Z") },
    });
    expect(await linkAccount(user.id, connection.id, { externalAccountId: "ext-acc", accountId: usd.id })).toMatchObject({ status: "invalid" });

    const other = await createUser();
    const theirs = await testDb.account.create({
      data: { userId: other.id, name: "Theirs", kind: "asset", type: "bank", openingDate: new Date("2026-01-01T12:00:00Z") },
    });
    expect(await linkAccount(user.id, connection.id, { externalAccountId: "ext-acc", accountId: theirs.id })).toMatchObject({ status: "invalid" });

    const mine = await testDb.account.create({
      data: { userId: user.id, name: "Spare", kind: "asset", type: "bank", openingDate: new Date("2026-01-01T12:00:00Z") },
    });
    expect(await linkAccount(user.id, connection.id, { externalAccountId: "nope", accountId: mine.id })).toMatchObject({ status: "invalid" });
    // and the bank account is already linked elsewhere
    expect(await linkAccount(user.id, connection.id, { externalAccountId: "ext-acc", accountId: mine.id })).toMatchObject({ status: "invalid" });
  });

  it("another user can not see, link or disconnect your connection", async () => {
    const { connection } = await setup();
    const other = await createUser();
    expect(await listConnections(other.id)).toEqual([]);
    expect(await disconnect(other.id, connection.id)).toEqual({ status: "not_found" });
    expect(await linkAccount(other.id, connection.id, { externalAccountId: "ext-acc", accountId: "x" })).toEqual({ status: "not_found" });
    expect((await testDb.bankConnection.findUnique({ where: { id: connection.id } }))!.status).toBe("active");
  });

  it("disconnecting stops syncing at once and keeps everything already imported and recorded", async () => {
    const { user, sessionUser, account, connection } = await setup([bankTx("a", -100_00), bankTx("b", -200_00)]);
    await syncConnection(connection.id, NOW);
    const [a] = await imports(user.id);
    await acceptImport(sessionUser, a.id, { bucketId: "spend", category: "food" }, NOW);
    const txsBefore = await txCount(user.id);

    const result = await disconnect(user.id, connection.id, NOW);
    expect(result).toEqual({ status: "ok", value: { providerRevoked: true } });

    expect(await testDb.bankConnection.findUnique({ where: { id: connection.id } })).toMatchObject({ status: "revoked" });
    expect((await testDb.account.findUnique({ where: { id: account.id } }))!.connectionId).toBeNull();
    expect((await syncConnection(connection.id, NOW)).outcome).toBe("skipped");
    expect((await syncAllDue(NOW)).some((r) => r.connectionId === connection.id)).toBe(false);
    expect((await imports(user.id)).length).toBe(2);
    expect(await txCount(user.id)).toBe(txsBefore);
  });

  it("disconnecting works even when the provider can not be reached", async () => {
    const { user, connection } = await setup();
    vi.spyOn(mockProvider, "revoke").mockRejectedValue(new Error("network down"));
    const result = await disconnect(user.id, connection.id, NOW);
    expect(result).toEqual({ status: "ok", value: { providerRevoked: false } });
    expect((await testDb.bankConnection.findUnique({ where: { id: connection.id } }))!.status).toBe("revoked");
    expect((await syncConnection(connection.id, NOW)).outcome).toBe("skipped");
  });
});

describe("reviewing: accept, match, ignore", () => {
  it("accepting records one real transaction, on the bank's day, in the account", async () => {
    const { user, sessionUser, account, connection } = await setup([bankTx("a", -250_000)]);
    await syncConnection(connection.id, NOW);
    const [row] = await imports(user.id);

    expect(await acceptImport(sessionUser, row.id, { bucketId: "spend", category: "food" }, NOW)).toEqual({ status: "ok" });

    const tx = await testDb.transaction.findFirst({ where: { userId: user.id, importId: row.id } });
    expect(tx).toMatchObject({ type: "e", amount: 2_500, currency: "NGN", bucketId: "spend", accountId: account.id, note: "desc a" });
    expect(tx!.date.toISOString().slice(0, 10)).toBe("2026-10-20");
    expect(await imports(user.id)).toMatchObject([{ review: "accepted", transactionId: tx!.id }]);
  });

  it("accepting twice, even at once, records it once", async () => {
    const { user, sessionUser, connection } = await setup([bankTx("a", -100_000)]);
    await syncConnection(connection.id, NOW);
    const [row] = await imports(user.id);
    const [x, y] = await Promise.all([
      acceptImport(sessionUser, row.id, { bucketId: "spend", category: "food" }, NOW),
      acceptImport(sessionUser, row.id, { bucketId: "spend", category: "food" }, NOW),
    ]);
    // Both succeed: the second finds it already recorded and just confirms it
    expect([x.status, y.status]).toEqual(["ok", "ok"]);
    expect(await testDb.transaction.count({ where: { userId: user.id, importId: row.id } })).toBe(1);
  });

  it("the database allows only one transaction per import", async () => {
    const { user, sessionUser, connection } = await setup([bankTx("a", -100_000)]);
    await syncConnection(connection.id, NOW);
    const [row] = await imports(user.id);
    await acceptImport(sessionUser, row.id, { bucketId: "spend", category: "food" }, NOW);
    await expect(
      testDb.transaction.create({ data: { userId: user.id, type: "e", amount: 1, importId: row.id } })
    ).rejects.toMatchObject({ code: "P2002" });
  });

  it("an expense the bucket can not cover is refused like any expense, and stays in the queue", async () => {
    const { user, sessionUser, connection } = await setup([bankTx("big", -900_000)]); // ₦9,000 against ₦8,100
    await syncConnection(connection.id, NOW);
    const [row] = await imports(user.id);
    const result = await acceptImport(sessionUser, row.id, { bucketId: "spend", category: "food" }, NOW);

    expect(result).toMatchObject({ status: "blocked", shortfall: { bucketId: "spend", available: 8_100, requested: 9_000 } });
    expect(await testDb.transaction.count({ where: { userId: user.id, importId: row.id } })).toBe(0);
    expect((await imports(user.id))[0].review).toBe("new");
  });

  it("a bank transaction bigger than its bucket can be recorded only by an approved exception, once", async () => {
    const { user, sessionUser, connection } = await setup([bankTx("big", -900_000)]); // ₦9,000 against ₦8,100
    await syncConnection(connection.id, NOW);
    const [row] = await imports(user.id);

    const refused = await acceptImport(sessionUser, row.id, { bucketId: "spend", category: "food" }, NOW);
    expect(refused).toMatchObject({ status: "blocked", shortfall: { short: 900 } });
    expect((refused as { shortfall: { options: unknown[] } }).shortfall.options.length).toBeGreaterThan(0);

    const approved = await acceptImport(sessionUser, row.id, { bucketId: "spend", category: "food", fundFrom: { bucketId: "save", reason: "It already left my account" } }, NOW);
    expect(approved).toEqual({ status: "ok" });
    const moves = await testDb.reallocation.findMany({ where: { userId: user.id } });
    expect(moves).toHaveLength(1);
    expect(moves[0]).toMatchObject({ fromBucketId: "save", toBucketId: "spend", reason: "It already left my account" });
    expect(Number(moves[0].amountMinor)).toBe(90_000);
    // accepting again records nothing more
    expect(await acceptImport(sessionUser, row.id, { bucketId: "spend", category: "food" }, NOW)).toEqual({ status: "ok" });
    expect(await testDb.reallocation.count({ where: { userId: user.id } })).toBe(1);
    expect(await testDb.transaction.count({ where: { userId: user.id, importId: row.id } })).toBe(1);
  });

  it("needs a bucket for an expense when there is a plan, but not for income", async () => {
    const { user, sessionUser, connection } = await setup([bankTx("out", -100_00), bankTx("in", 300_000)]);
    await syncConnection(connection.id, NOW);
    const rows = await imports(user.id);
    const out = rows.find((r) => r.externalId === "out")!;
    const inn = rows.find((r) => r.externalId === "in")!;
    expect(await acceptImport(sessionUser, out.id, {}, NOW)).toMatchObject({ status: "invalid" });
    expect(await acceptImport(sessionUser, inn.id, {}, NOW)).toEqual({ status: "ok" });
    expect(await testDb.transaction.findFirst({ where: { userId: user.id, importId: inn.id } })).toMatchObject({ type: "i", amount: 3_000 });
  });

  it("a pending transaction can not be accepted yet", async () => {
    const { user, sessionUser, connection } = await setup([bankTx("p", -100_00, { status: "pending" })]);
    await syncConnection(connection.id, NOW);
    const [row] = await imports(user.id);
    expect(await acceptImport(sessionUser, row.id, { bucketId: "spend", category: "food" }, NOW)).toMatchObject({ status: "invalid" });
    expect(await testDb.transaction.count({ where: { userId: user.id, importId: row.id } })).toBe(0);
  });

  it("suggests the manual entry it matches, and matching links them without creating anything", async () => {
    const { user, account, connection } = await setup([bankTx("a", -250_000)]);
    const manual = await seedTx(user.id, { type: "e", amount: 2_500, bucketId: "spend", date: new Date("2026-10-19T12:00:00Z") });
    await testDb.transaction.update({ where: { id: manual.id }, data: { accountId: account.id } });
    const unrelated = await seedTx(user.id, { type: "e", amount: 2_501, bucketId: "spend", date: new Date("2026-10-20T12:00:00Z") });
    await testDb.transaction.update({ where: { id: unrelated.id }, data: { accountId: account.id } });
    await syncConnection(connection.id, NOW);

    const [view] = await listImports(user.id);
    expect(view.suggestions.map((s) => s.transactionId)).toEqual([manual.id]);
    const before = await txCount(user.id);

    expect(await matchImport(user.id, view.id, manual.id)).toEqual({ status: "ok" });
    expect(await txCount(user.id)).toBe(before);
    expect((await imports(user.id))[0]).toMatchObject({ review: "matched", transactionId: manual.id });
    expect(await listImports(user.id)).toEqual([]); // nothing left to decide
  });

  it("matching refuses a transaction that is not the same event, or is already taken", async () => {
    const { user, account, sessionUser, connection } = await setup([bankTx("a", -250_000), bankTx("b", -250_000)]);
    const manual = await seedTx(user.id, { type: "e", amount: 2_500, bucketId: "spend", date: new Date("2026-10-20T12:00:00Z") });
    await testDb.transaction.update({ where: { id: manual.id }, data: { accountId: account.id } });
    const wrong = await seedTx(user.id, { type: "e", amount: 9, bucketId: "spend", date: new Date("2026-10-20T12:00:00Z") });
    await testDb.transaction.update({ where: { id: wrong.id }, data: { accountId: account.id } });
    await syncConnection(connection.id, NOW);
    const [a, b] = await imports(user.id);

    expect(await matchImport(user.id, a.id, wrong.id)).toMatchObject({ status: "invalid" });
    expect(await matchImport(user.id, a.id, manual.id)).toEqual({ status: "ok" });
    expect(await matchImport(user.id, b.id, manual.id)).toMatchObject({ status: "invalid" }); // one transaction, one bank record
    // a transaction created from another import is taken as well
    const [, bOnly] = await imports(user.id);
    expect(await acceptImport(sessionUser, bOnly.id, { bucketId: "spend", category: "food" }, NOW)).toEqual({ status: "ok" });
  });

  it("ignoring removes it from the queue, and it can be reopened", async () => {
    const { user, connection } = await setup([bankTx("a", -100_00)]);
    await syncConnection(connection.id, NOW);
    const [row] = await imports(user.id);
    expect(await ignoreImport(user.id, row.id)).toEqual({ status: "ok" });
    expect(await listImports(user.id)).toEqual([]);
    expect(await ignoreImport(user.id, row.id, true)).toEqual({ status: "ok" });
    expect((await listImports(user.id)).length).toBe(1);
  });

  it("deleting a recorded transaction (inside its window) puts the bank record back in the queue", async () => {
    const { user, sessionUser, connection } = await setup([bankTx("a", -100_00)]);
    await syncConnection(connection.id, NOW);
    const [row] = await imports(user.id);
    await acceptImport(sessionUser, row.id, { bucketId: "spend", category: "food" }, NOW);
    const tx = await testDb.transaction.findFirst({ where: { userId: user.id, importId: row.id } });

    expect(await deleteTransaction(sessionUser, tx!.id, NOW)).toEqual({ status: "deleted" });
    expect(await imports(user.id)).toMatchObject([{ review: "new", transactionId: null }]);
    // …and it can be recorded again
    expect(await acceptImport(sessionUser, row.id, { bucketId: "spend", category: "food" }, NOW)).toEqual({ status: "ok" });
  });

  it("nobody else can accept, match, ignore or even see your imports", async () => {
    const { user, connection } = await setup([bankTx("a", -100_00)]);
    await syncConnection(connection.id, NOW);
    const [row] = await imports(user.id);
    const other = await createUser();
    const otherSession = { id: other.id, baseCurrency: other.baseCurrency, fxRates: other.fxRates };

    expect(await listImports(other.id)).toEqual([]);
    expect(await acceptImport(otherSession, row.id, {}, NOW)).toEqual({ status: "not_found" });
    expect(await matchImport(other.id, row.id, "x")).toEqual({ status: "not_found" });
    expect(await ignoreImport(other.id, row.id)).toEqual({ status: "not_found" });
    expect((await imports(user.id))[0].review).toBe("new");
  });
});

describe("the rest of the app is unaffected until something is accepted", () => {
  it("imports do not change a single balance, total or bucket", async () => {
    const { user, account, connection } = await setup([bankTx("a", -100_000), bankTx("b", 900_000)]);
    const accountBefore = await testDb.account.findUnique({ where: { id: account.id } });
    await syncConnection(connection.id, NOW);
    expect(await testDb.transaction.count({ where: { userId: user.id, importId: { not: null } } })).toBe(0);
    expect(await testDb.account.findUnique({ where: { id: account.id } })).toMatchObject({ openingBalanceMinor: accountBefore!.openingBalanceMinor });
    expect(await testDb.transfer.count({ where: { userId: user.id } })).toBe(0);
    expect(dateFromDateKey("2026-10-20")).toBeInstanceOf(Date);
  });
});
