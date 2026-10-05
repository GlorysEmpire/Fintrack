/**
 * Transaction lifecycle on the server: Created → Editable window → Locked.
 *
 * While editable a transaction can be changed or deleted with the normal
 * checks. Once the window has closed, both are refused — whatever the client
 * sends — and nothing about the row changes.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", async () => ({ prisma: (await import("@/test/db")).testDb }));
vi.mock("@/lib/auth", async () => ({
  getSessionUser: (await import("@/test/harness")).sessionUser,
}));

import { TRANSACTION_EDIT_WINDOW_HOURS } from "@fintrack/domain";
import { toDateInputValue } from "@/lib/format-date";
import { deleteTransaction, updateTransaction } from "@/lib/transactions";
import {
  HOUR,
  cleanup,
  createUser,
  jsonRequest,
  midMonth,
  params,
  seedPlan,
  seedTx,
  signIn,
  testDb,
} from "@/test/harness";
import { DELETE, PATCH } from "./route";

afterEach(cleanup);

const patch = (id: string, body: unknown) => PATCH(jsonRequest("PATCH", body), params(id));
const del = (id: string) => DELETE(jsonRequest("DELETE"), params(id));
const row = (id: string) => testDb.transaction.findUnique({ where: { id } });
const hoursAgo = (h: number) => new Date(Date.now() - h * HOUR);

/** Signed-in user, tithe-first plan, ₦100,000 income this month (Spend = ₦8,100) */
async function funded() {
  const user = await createUser();
  await seedPlan(user.id);
  await seedTx(user.id, { type: "i", amount: 100_000 });
  signIn(user);
  return user;
}

describe("editing while the window is open", () => {
  it("changes the allowed fields and leaves the recorded time alone", async () => {
    const user = await funded();
    const tx = await seedTx(user.id, {
      type: "e",
      amount: 1_000,
      bucketId: "spend",
      note: "lunch",
      createdAt: hoursAgo(2),
    });

    const res = await patch(tx.id, {
      amount: 1_250,
      note: "lunch + drink",
      bucketId: "save",
      category: "bills",
    });
    expect(res.status).toBe(200);

    const after = await row(tx.id);
    expect(after?.amount).toBe(1_250);
    expect(after?.note).toBe("lunch + drink");
    expect(after?.bucketId).toBe("save");
    expect(after?.category).toBe("bills");
    // Editing never restarts the edit window
    expect(after?.createdAt.getTime()).toBe(tx.createdAt.getTime());
    // Nothing else was sent, so the moment it happened is unchanged
    expect(after?.date.getTime()).toBe(tx.date.getTime());
  });

  it("can move a transaction to an earlier day, but not into the future", async () => {
    const user = await funded();
    await seedTx(user.id, { type: "i", amount: 100_000, date: midMonth(-1) });
    const tx = await seedTx(user.id, { type: "e", amount: 500, bucketId: "spend" });

    const day = toDateInputValue(midMonth(-1));
    const moved = await patch(tx.id, { date: day });
    expect(moved.status).toBe(200);
    expect((await row(tx.id))?.date.toISOString()).toBe(`${day}T12:00:00.000Z`);

    const tomorrow = toDateInputValue(new Date(Date.now() + 36 * HOUR));
    const future = await patch(tx.id, { date: tomorrow });
    expect(future.status).toBe(400);
    expect((await row(tx.id))?.date.toISOString()).toBe(`${day}T12:00:00.000Z`);
  });

  it("keeps the exact moment when the day sent is the day it already has", async () => {
    const user = await funded();
    const tx = await seedTx(user.id, { type: "e", amount: 500, bucketId: "spend" });
    const res = await patch(tx.id, { date: toDateInputValue(tx.date), note: "same day" });
    expect(res.status).toBe(200);
    expect((await row(tx.id))?.date.getTime()).toBe(tx.date.getTime());
  });

  it("applies the normal checks: bucket, category, amount, cross-bucket reason", async () => {
    const user = await funded();
    const tx = await seedTx(user.id, { type: "e", amount: 500, bucketId: "spend", note: "" });

    expect((await patch(tx.id, { bucketId: "not_a_bucket" })).status).toBe(400);
    expect((await patch(tx.id, { amount: 0 })).status).toBe(400);
    expect((await patch(tx.id, { category: "made_up" })).status).toBe(400);
    // Tithe payment drawn from Spend with no reason
    expect((await patch(tx.id, { category: "tithe_payment", note: "" })).status).toBe(400);

    const after = await row(tx.id);
    expect(after?.amount).toBe(500);
    expect(after?.bucketId).toBe("spend");
  });

  it("does not let the kind of transaction change", async () => {
    const user = await funded();
    const tx = await seedTx(user.id, { type: "e", amount: 500, bucketId: "spend" });
    const res = await patch(tx.id, { type: "i" });
    expect(res.status).toBe(400);
    expect((await row(tx.id))?.type).toBe("e");
  });

  it("edits income too, and only against the user's own sources", async () => {
    const user = await createUser();
    const other = await createUser();
    const mine = await testDb.incomeSource.create({ data: { userId: user.id, name: "Salary" } });
    const theirs = await testDb.incomeSource.create({ data: { userId: other.id, name: "Theirs" } });
    const tx = await seedTx(user.id, { type: "i", amount: 40_000 });
    signIn(user);

    expect((await patch(tx.id, { amount: 45_000, sourceId: mine.id })).status).toBe(200);
    expect((await row(tx.id))?.amount).toBe(45_000);
    expect((await patch(tx.id, { sourceId: theirs.id })).status).toBe(400);
    expect((await row(tx.id))?.sourceId).toBe(mine.id);
  });

  it("can not see or change another user's transaction", async () => {
    const owner = await createUser();
    const tx = await seedTx(owner.id, { type: "e", amount: 500 });
    const intruder = await createUser();
    signIn(intruder);

    expect((await patch(tx.id, { amount: 1 })).status).toBe(404);
    expect((await del(tx.id)).status).toBe(404);
    expect((await row(tx.id))?.amount).toBe(500);
  });

  it("rejects a signed-out request", async () => {
    const owner = await createUser();
    const tx = await seedTx(owner.id, { type: "e", amount: 500 });
    signIn(null);
    expect((await patch(tx.id, { amount: 1 })).status).toBe(401);
    expect((await del(tx.id)).status).toBe(401);
    expect((await row(tx.id))?.amount).toBe(500);
  });
});

describe("editing and the bucket limit", () => {
  it("refuses an edit the bucket can not cover, and changes nothing", async () => {
    const user = await funded();
    const tx = await seedTx(user.id, { type: "e", amount: 8_000, bucketId: "spend" });

    // Its own ₦8,000 is being replaced, so ₦8,100 is available: 9,000 is too much
    const res = await patch(tx.id, { amount: 9_000 });
    expect(res.status).toBe(422);
    const data = await res.json();
    expect(data.blocked).toBe(true);
    expect(data.shortfall).toEqual({
      bucketId: "spend",
      bucketName: "Spend",
      available: 8_100,
      requested: 9_000,
    });
    expect(data.error).toBe(
      "Spend has ₦8,100 available. That does not cover ₦9,000. Nothing was changed."
    );
    expect((await row(tx.id))?.amount).toBe(8_000);
    expect(await testDb.inboxMessage.count({ where: { userId: user.id } })).toBe(0);
  });

  it("allows an edit up to exactly what the bucket holds", async () => {
    const user = await funded();
    const tx = await seedTx(user.id, { type: "e", amount: 8_000, bucketId: "spend" });
    expect((await patch(tx.id, { amount: 8_100 })).status).toBe(200);
    expect((await row(tx.id))?.amount).toBe(8_100);
  });

  it("refuses moving an expense to a bucket that can not cover it", async () => {
    const user = await funded();
    // Give gets ₦8,100 too; ₦8,000 of it is already spent
    await seedTx(user.id, { type: "e", amount: 8_000, bucketId: "give" });
    const tx = await seedTx(user.id, { type: "e", amount: 500, bucketId: "spend" });

    const res = await patch(tx.id, { bucketId: "give", category: "charity" });
    expect(res.status).toBe(422);
    expect((await res.json()).shortfall.available).toBe(100);
    expect((await row(tx.id))?.bucketId).toBe("spend");
  });

  it("refuses moving an expense to an earlier month whose bucket could not cover it", async () => {
    const user = await funded(); // no income last month, so Spend held nothing then
    const tx = await seedTx(user.id, { type: "e", amount: 500, bucketId: "spend" });
    const res = await patch(tx.id, { date: toDateInputValue(midMonth(-1)) });
    expect(res.status).toBe(422);
    expect((await row(tx.id))?.date.getTime()).toBe(tx.date.getTime());
  });

  it("a note-only edit is never re-checked against the balance", async () => {
    const user = await funded();
    // A bucket already below zero (possible after a plan change): 10,000 against 8,100
    const tx = await seedTx(user.id, { type: "e", amount: 10_000, bucketId: "spend" });
    const res = await patch(tx.id, { note: "typo fixed" });
    expect(res.status).toBe(200);
    expect((await row(tx.id))?.note).toBe("typo fixed");
  });

  it("lowering an expense is always allowed, even while the bucket is below zero", async () => {
    const user = await funded();
    const tx = await seedTx(user.id, { type: "e", amount: 10_000, bucketId: "spend" });

    // 9,000 is still more than 8,100, but it takes less than before
    expect((await patch(tx.id, { amount: 9_000 })).status).toBe(200);
    expect((await row(tx.id))?.amount).toBe(9_000);
    // Raising it again is refused
    expect((await patch(tx.id, { amount: 9_500 })).status).toBe(422);
    expect((await row(tx.id))?.amount).toBe(9_000);
  });
});

describe("locked: the edit window has closed", () => {
  it("refuses to edit, says why, and changes nothing", async () => {
    const user = await funded();
    const tx = await seedTx(user.id, {
      type: "e",
      amount: 500,
      bucketId: "spend",
      note: "old",
      createdAt: hoursAgo(TRANSACTION_EDIT_WINDOW_HOURS + 1),
    });

    const res = await patch(tx.id, { amount: 1, note: "rewritten" });
    expect(res.status).toBe(423);
    const data = await res.json();
    expect(data.locked).toBe(true);
    expect(data.error).toMatch(/locked/);
    expect(data.error).toMatch(new RegExp(`${TRANSACTION_EDIT_WINDOW_HOURS} hours`));

    const after = await row(tx.id);
    expect(after?.amount).toBe(500);
    expect(after?.note).toBe("old");
  });

  it("refuses to delete, and the transaction stays", async () => {
    const user = await funded();
    const tx = await seedTx(user.id, {
      type: "e",
      amount: 500,
      bucketId: "spend",
      createdAt: hoursAgo(TRANSACTION_EDIT_WINDOW_HOURS + 1),
    });
    const res = await del(tx.id);
    expect(res.status).toBe(423);
    expect((await res.json()).locked).toBe(true);
    expect(await row(tx.id)).not.toBeNull();
  });

  it("the window runs from when it was recorded, not from the date it carries", async () => {
    const user = await funded();
    // Recorded just now, filed under last month: still editable
    const fresh = await seedTx(user.id, { type: "e", amount: 500, bucketId: "spend", date: midMonth(-1) });
    expect((await patch(fresh.id, { note: "ok" })).status).toBe(200);

    // Recorded long ago, carrying today's date: locked
    const old = await seedTx(user.id, {
      type: "e",
      amount: 500,
      bucketId: "spend",
      date: new Date(),
      createdAt: hoursAgo(TRANSACTION_EDIT_WINDOW_HOURS + 5),
    });
    expect((await patch(old.id, { note: "no" })).status).toBe(423);
    // …and changing the date can not buy more time
    expect((await patch(old.id, { date: toDateInputValue(new Date()) })).status).toBe(423);
  });

  it("locks at exactly the end of the window", async () => {
    const user = await funded();
    const recorded = new Date("2026-10-01T09:00:00.000Z");
    const tx = await seedTx(user.id, {
      type: "e",
      amount: 500,
      bucketId: "spend",
      date: recorded,
      createdAt: recorded,
    });
    const windowEnd = recorded.getTime() + TRANSACTION_EDIT_WINDOW_HOURS * HOUR;

    const justInside = await updateTransaction(user, tx.id, { note: "in time" }, new Date(windowEnd - 1));
    expect(justInside.status).toBe("ok");

    const atTheEnd = await updateTransaction(user, tx.id, { note: "too late" }, new Date(windowEnd));
    expect(atTheEnd.status).toBe("locked");
    const deleteAtTheEnd = await deleteTransaction(user, tx.id, new Date(windowEnd));
    expect(deleteAtTheEnd.status).toBe("locked");

    expect((await row(tx.id))?.note).toBe("in time");
  });
});

describe("deleting while the window is open", () => {
  it("removes the transaction and the Inbox notes about it, and nothing else", async () => {
    const user = await funded();
    const keep = await seedTx(user.id, { type: "e", amount: 300, bucketId: "spend" });
    const gone = await seedTx(user.id, { type: "e", amount: 500, bucketId: "spend" });
    await testDb.inboxMessage.create({
      data: { userId: user.id, kind: "override_coach", title: "a", body: "b", relatedTxId: gone.id },
    });
    await testDb.inboxMessage.create({
      data: { userId: user.id, kind: "override_coach", title: "c", body: "d", relatedTxId: keep.id },
    });

    const res = await del(gone.id);
    expect(res.status).toBe(200);
    expect(await row(gone.id)).toBeNull();
    expect(await row(keep.id)).not.toBeNull();

    const notes = await testDb.inboxMessage.findMany({ where: { userId: user.id } });
    expect(notes.map((n) => n.relatedTxId)).toEqual([keep.id]);
  });

  it("answers 404 for a transaction that does not exist", async () => {
    const user = await funded();
    void user;
    expect((await del("does-not-exist")).status).toBe(404);
  });
});
