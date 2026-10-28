import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { safeToSpend } from "./safe-to-spend";
import type { MonthBucketState } from "./carryover";

function bucket(id: string, p: Partial<MonthBucketState>): MonthBucketState {
  const b = { bucketId: id, opening: 0, allocated: 0, spent: 0, moved: 0, closing: 0, carryOver: false, ...p };
  return { ...b, closing: p.closing ?? b.opening + b.allocated + b.moved - b.spent };
}

describe("safeToSpend", () => {
  it("is what is left in the Spend bucket, spread over the days left", () => {
    const r = safeToSpend([bucket("save", { allocated: 900 }), bucket("spend", { allocated: 1000, spent: 400 })], 3);
    assert.equal(r.hasSpendBucket, true);
    assert.equal(r.amount, 600);
    assert.equal(r.total, 1000);
    assert.equal(r.fraction, 0.6);
    assert.equal(r.perDay, 200);
  });

  it("ignores every other bucket, however full", () => {
    const r = safeToSpend([bucket("save", { allocated: 5_000_000 }), bucket("spend", { allocated: 10 })], 1);
    assert.equal(r.amount, 10);
  });

  it("counts money carried in and money moved in by an approved exception", () => {
    const r = safeToSpend([bucket("spend", { opening: 200, allocated: 300, moved: 100, spent: 150 })], 10);
    assert.equal(r.amount, 450);
    assert.equal(r.total, 600);
  });

  it("is never negative, and has no per-day figure with no days left", () => {
    const r = safeToSpend([bucket("spend", { allocated: 100, spent: 160 })], 0);
    assert.equal(r.amount, 0);
    assert.equal(r.fraction, 0);
    assert.equal(r.perDay, 0);
  });

  it("reports a plan with no Spend bucket as such", () => {
    const r = safeToSpend([bucket("save", { allocated: 100 })], 5);
    assert.deepEqual(r, { hasSpendBucket: false, amount: 0, total: 0, fraction: 0, perDay: 0 });
  });
});
