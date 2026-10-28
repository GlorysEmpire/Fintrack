import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { bucketHeadsUp, headsUpDraft, monthlyRecapDraft } from "./heads-up";

describe("bucketHeadsUp", () => {
  it("speaks when an expense takes a bucket to 15% or less", () => {
    assert.equal(bucketHeadsUp({ allocated: 1000, remainingBefore: 400, amount: 260 }), "low");
  });
  it("speaks once: not when the bucket was already low, nor while it is still comfortable", () => {
    assert.equal(bucketHeadsUp({ allocated: 1000, remainingBefore: 140, amount: 20 }), null);
    assert.equal(bucketHeadsUp({ allocated: 1000, remainingBefore: 900, amount: 100 }), null);
  });
  it("says empty when the expense uses up the rest", () => {
    assert.equal(bucketHeadsUp({ allocated: 1000, remainingBefore: 300, amount: 300 }), "empty");
    assert.equal(bucketHeadsUp({ allocated: 1000, remainingBefore: 100, amount: 100 }), "empty");
  });
  it("stays quiet with nothing allocated, nothing left, or no amount", () => {
    assert.equal(bucketHeadsUp({ allocated: 0, remainingBefore: 0, amount: 5 }), null);
    assert.equal(bucketHeadsUp({ allocated: 100, remainingBefore: 0, amount: 5 }), null);
    assert.equal(bucketHeadsUp({ allocated: 100, remainingBefore: 50, amount: 0 }), null);
  });
});

describe("drafts", () => {
  it("never suggests another bucket and states the pace", () => {
    const low = headsUpDraft("low", { bucketName: "Spend", leftLabel: "₦900", ofLabel: "₦6,000", daysLeft: 3, perDayLabel: "₦300" });
    assert.match(low.body, /₦300 a day for the 3 days left/);
    const empty = headsUpDraft("empty", { bucketName: "Spend", leftLabel: "₦0", ofLabel: "₦6,000", daysLeft: 3, perDayLabel: null });
    assert.doesNotMatch(low.body + empty.body, /another bucket|other bucket|take from|borrow/i);
  });
  it("recaps plainly, up or down", () => {
    const up = monthlyRecapDraft({ monthLabel: "September 2026", incomeLabel: "₦500,000", expensesLabel: "₦300,000", net: 200_000, netLabel: "₦200,000", expenseRate: 60 });
    assert.match(up.body, /You kept ₦200,000/);
    assert.match(up.body, /60% of your income/);
    const down = monthlyRecapDraft({ monthLabel: "September 2026", incomeLabel: "₦0", expensesLabel: "₦5,000", net: -5000, netLabel: "₦5,000", expenseRate: null });
    assert.match(down.body, /spent ₦5,000 more than you logged/);
    assert.doesNotMatch(down.body, /% of your income/);
  });
});
