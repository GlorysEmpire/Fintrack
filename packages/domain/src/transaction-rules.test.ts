/**
 * Transaction lifecycle (Created → Editable window → Locked), transaction dates,
 * and the rule that a bucket is blocked at zero.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  EARLIEST_TRANSACTION_DATE_KEY,
  EDIT_WINDOW_RULE,
  LOCKED_EXPLANATION,
  TRANSACTION_EDIT_WINDOW_HOURS,
  dateFromDateKey,
  dateKeyInTimeZone,
  editWindowRemainingLabel,
  isDateKey,
  isDayOnlyDate,
  isTransactionLocked,
  resolveTransactionDate,
  transactionLockState,
} from "./transaction-rules";
import {
  allTimeBucketStates,
  bucketAvailableOn,
  bucketStatesForMonth,
  expenseFriction,
  monthKeyOf,
  openingBalancesForMonth,
  transactionTotals,
  type MoneyTx,
} from "./money";
import { nextOpeningBalances } from "./carryover";
import { TITHE_FIRST_TEMPLATE } from "./templates";
import type { BudgetPlan } from "./types";

const HOUR = 60 * 60 * 1000;
const LAGOS = "Africa/Lagos";
const fx = { NGN: 1, USD: 1580, GBP: 1990, EUR: 1710 };

const plan: BudgetPlan = {
  id: "p1",
  name: "Tithe-first waterfall",
  templateId: "tithe_first",
  emergencyCarryOverDefault: true,
  buckets: TITHE_FIRST_TEMPLATE.plan.buckets.map((b) => ({ ...b })),
};

function tx(type: "i" | "e", amount: number, date: Date, bucketId?: string): MoneyTx {
  return { type, amount, currency: "NGN", date, ...(bucketId ? { bucketId } : {}) };
}

const SEP = new Date(2026, 8, 12);
const OCT_NOW = new Date(2026, 9, 5, 10, 0, 0);

describe("edit window: Created → Editable → Locked", () => {
  const created = new Date("2026-10-01T09:00:00.000Z");
  const at = (hours: number) => new Date(created.getTime() + hours * HOUR);

  it("a transaction is editable from the moment it is recorded", () => {
    const state = transactionLockState(created, created);
    assert.equal(state.locked, false);
    assert.equal(state.msRemaining, TRANSACTION_EDIT_WINDOW_HOURS * HOUR);
    assert.equal(state.editableUntil.toISOString(), at(TRANSACTION_EDIT_WINDOW_HOURS).toISOString());
  });

  it("stays editable right up to the end of the window", () => {
    const state = transactionLockState(created, new Date(at(TRANSACTION_EDIT_WINDOW_HOURS).getTime() - 1));
    assert.equal(state.locked, false);
    assert.equal(state.msRemaining, 1);
  });

  it("locks exactly when the window closes, and stays locked", () => {
    assert.equal(isTransactionLocked(created, at(TRANSACTION_EDIT_WINDOW_HOURS)), true);
    assert.equal(isTransactionLocked(created, at(TRANSACTION_EDIT_WINDOW_HOURS + 1)), true);
    assert.equal(isTransactionLocked(created, at(24 * 365)), true);
    assert.equal(transactionLockState(created, at(500)).msRemaining, 0);
  });

  it("the window is finite: nothing stays editable forever", () => {
    assert.ok(Number.isFinite(TRANSACTION_EDIT_WINDOW_HOURS));
    assert.ok(TRANSACTION_EDIT_WINDOW_HOURS > 0);
  });

  it("accepts an ISO string and fails closed on an unreadable timestamp", () => {
    assert.equal(isTransactionLocked(created.toISOString(), at(1)), false);
    assert.equal(isTransactionLocked("not a date", at(1)), true);
    assert.equal(isTransactionLocked(new Date(Number.NaN), at(1)), true);
  });

  it("runs from when it was recorded, not from the date the transaction is filed under", () => {
    // A transaction recorded now but dated last month is editable now…
    assert.equal(isTransactionLocked(OCT_NOW, OCT_NOW), false);
    // …and one recorded long ago is locked whatever date it carries.
    assert.equal(isTransactionLocked(SEP, OCT_NOW), true);
  });

  it("explains the rule and the lock in plain words", () => {
    assert.match(EDIT_WINDOW_RULE, new RegExp(`${TRANSACTION_EDIT_WINDOW_HOURS} hours`));
    assert.match(LOCKED_EXPLANATION, /locked/);
    assert.match(LOCKED_EXPLANATION, new RegExp(`${TRANSACTION_EDIT_WINDOW_HOURS} hours`));
    assert.equal(editWindowRemainingLabel(47.5 * HOUR), "47 hours");
    assert.equal(editWindowRemainingLabel(1 * HOUR), "1 hour");
    assert.equal(editWindowRemainingLabel(35 * 60_000), "35 minutes");
    assert.equal(editWindowRemainingLabel(20_000), "less than a minute");
  });
});

describe("transaction dates", () => {
  it("recognises real calendar days only", () => {
    assert.equal(isDateKey("2026-10-05"), true);
    assert.equal(isDateKey("2024-02-29"), true);
    for (const bad of ["2026-02-30", "2026-13-01", "2026-1-5", "05/10/2026", "", null, 20261005]) {
      assert.equal(isDateKey(bad), false, String(bad));
    }
  });

  it("works out the calendar day in the app's time zone, not the server's", () => {
    const lateEvening = new Date("2026-09-30T23:30:00.000Z"); // 00:30 on 1 Oct in Lagos
    assert.equal(dateKeyInTimeZone(lateEvening, LAGOS), "2026-10-01");
    assert.equal(dateKeyInTimeZone(lateEvening, "UTC"), "2026-09-30");
  });

  it("files a chosen day at noon UTC so it lands in the right month", () => {
    const first = dateFromDateKey("2026-10-01");
    assert.equal(first.toISOString(), "2026-10-01T12:00:00.000Z");
    assert.equal(monthKeyOf(first), "2026-10");
    assert.equal(dateKeyInTimeZone(first, LAGOS), "2026-10-01");
    assert.equal(dateKeyInTimeZone(first, "UTC"), "2026-10-01");
    assert.equal(isDayOnlyDate(first), true);
    assert.equal(isDayOnlyDate(new Date("2026-10-01T14:23:11.456Z")), false);
  });

  it("with no day chosen, or today chosen, uses the real current moment", () => {
    const none = resolveTransactionDate({ timeZone: LAGOS, now: OCT_NOW });
    assert.deepEqual(none, { ok: true, date: OCT_NOW, dateKey: dateKeyInTimeZone(OCT_NOW, LAGOS), backdated: false });

    const today = resolveTransactionDate({ dateKey: dateKeyInTimeZone(OCT_NOW, LAGOS), timeZone: LAGOS, now: OCT_NOW });
    assert.equal(today.ok && today.date.getTime(), OCT_NOW.getTime());
    assert.equal(today.ok && today.backdated, false);
  });

  it("files an earlier day under that day", () => {
    const result = resolveTransactionDate({ dateKey: "2026-09-29", timeZone: LAGOS, now: OCT_NOW });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.backdated, true);
    assert.equal(result.date.toISOString(), "2026-09-29T12:00:00.000Z");
    assert.equal(monthKeyOf(result.date), "2026-09");
  });

  it("refuses a future day: a transaction records something that already happened", () => {
    const result = resolveTransactionDate({ dateKey: "2026-10-06", timeZone: LAGOS, now: OCT_NOW });
    assert.equal(result.ok, false);
    assert.match((result as { error: string }).error, /future/);
  });

  it("judges 'today' in the app's time zone", () => {
    const now = new Date("2026-09-30T23:30:00.000Z"); // already 1 Oct in Lagos
    assert.equal(resolveTransactionDate({ dateKey: "2026-10-01", timeZone: LAGOS, now }).ok, true);
    assert.equal(resolveTransactionDate({ dateKey: "2026-10-02", timeZone: LAGOS, now }).ok, false);
  });

  it("refuses nonsense and dates that can only be typing mistakes", () => {
    assert.equal(resolveTransactionDate({ dateKey: "2026-02-30", timeZone: LAGOS, now: OCT_NOW }).ok, false);
    assert.equal(resolveTransactionDate({ dateKey: "0026-10-05", timeZone: LAGOS, now: OCT_NOW }).ok, false);
    assert.equal(resolveTransactionDate({ dateKey: EARLIEST_TRANSACTION_DATE_KEY, timeZone: LAGOS, now: OCT_NOW }).ok, true);
  });

  it("a past-dated transaction changes history exactly as if it had been recorded then", () => {
    const dated = resolveTransactionDate({ dateKey: "2026-09-20", timeZone: LAGOS, now: OCT_NOW });
    assert.equal(dated.ok, true);
    if (!dated.ok) return;

    const recordedLate = [tx("i", 34_000, SEP), tx("e", 2_400, dated.date, "tithe")];
    const recordedThen = [tx("i", 34_000, SEP), tx("e", 2_400, new Date(2026, 8, 20), "tithe")];
    assert.deepEqual(
      openingBalancesForMonth(recordedLate, plan, "NGN", fx, OCT_NOW),
      openingBalancesForMonth(recordedThen, plan, "NGN", fx, OCT_NOW)
    );
    assert.equal(openingBalancesForMonth(recordedLate, plan, "NGN", fx, OCT_NOW).tithe, 1_000);
  });
});

describe("a bucket is blocked at zero", () => {
  const thisMonthIncome = [tx("i", 100_000, new Date(2026, 9, 2))]; // Spend gets 8,100
  const check = (amountBase: number, txs: MoneyTx[] = thisMonthIncome, bucketId = "spend", date = OCT_NOW) =>
    expenseFriction({ amountBase, bucketId, plan, txs, base: "NGN", fx, date, now: OCT_NOW });

  it("an expense that fits is allowed, right down to zero", () => {
    assert.equal(check(1_000).blocked, false);
    const all = check(8_100);
    assert.equal(all.blocked, false);
    assert.equal(all.wouldOverspend, false);
    assert.equal(all.remaining, 8_100);
    assert.equal(all.overBy, 0);
  });

  it("an expense over the balance is blocked, and says what is available against what was asked", () => {
    const f = check(10_000);
    assert.equal(f.blocked, true);
    assert.equal(f.wouldOverspend, true);
    assert.equal(f.remaining, 8_100);
    assert.equal(f.overBy, 1_900);
    assert.equal(f.message, "Spend has ₦8,100 available. That does not cover ₦10,000.");
  });

  it("a bucket at zero blocks any amount", () => {
    const spentOut = [...thisMonthIncome, tx("e", 8_100, new Date(2026, 9, 3), "spend")];
    for (const amount of [1, 500, 10_000]) {
      const f = check(amount, spentOut);
      assert.equal(f.blocked, true, String(amount));
      assert.equal(f.emptyBucket, true);
    }
    assert.equal(check(500, spentOut).message, "Spend has nothing available. That does not cover ₦500.");
  });

  it("a bucket that never received money (no income yet) is blocked too", () => {
    const f = check(500, []);
    assert.equal(f.blocked, true);
    assert.equal(f.remaining, 0);
    assert.equal(f.message, "Spend has nothing available. That does not cover ₦500.");
  });

  it("the message never suggests taking the money from another bucket", () => {
    const suggestion = /another|other bucket|different bucket|instead|split|move|transfer|withdraw|choose|pick/i;
    const messages = [
      check(10_000).message,
      check(500, []).message,
      check(3_000, [tx("i", 34_000, SEP), ...thisMonthIncome], "spend", new Date(2026, 8, 25)).message,
      check(100).message,
    ];
    for (const message of messages) {
      assert.equal(suggestion.test(message), false, message);
    }
  });

  it("shows decimals when whole numbers would hide the difference", () => {
    const f = check(8_100.4);
    assert.equal(f.blocked, true);
    assert.equal(f.message, "Spend has ₦8100.00 available. That does not cover ₦8100.40.");
  });

  it("with no plan there are no buckets, so nothing is blocked", () => {
    const f = expenseFriction({ amountBase: 500, bucketId: "spend", plan: null, txs: [], base: "NGN", fx, now: OCT_NOW });
    assert.equal(f.blocked, false);
  });

  it("carried-over money counts as available", () => {
    // September left ₦1,000 in Tithe; October has no income yet.
    const history = [tx("i", 34_000, SEP), tx("e", 2_400, SEP, "tithe")];
    assert.equal(check(600, history, "tithe").blocked, false);
    assert.equal(check(1_000, history, "tithe").blocked, false);
    const over = check(1_500, history, "tithe");
    assert.equal(over.blocked, true);
    assert.equal(over.remaining, 1_000);
    assert.equal(over.overBy, 500);
  });

  it("a past-dated expense is checked against that month's balance", () => {
    const history = [tx("i", 34_000, SEP), tx("i", 100_000, new Date(2026, 9, 2))];
    // September's Spend was 10% of the life plan = 2,754; October's is 8,100.
    const inSeptember = check(3_000, history, "spend", new Date(2026, 8, 25));
    assert.equal(inSeptember.remaining, 2_754);
    assert.equal(inSeptember.blocked, true);
    assert.equal(
      inSeptember.message,
      "Spend has ₦2,754 available for that date. That does not cover ₦3,000."
    );
    assert.equal(check(3_000, history, "spend", OCT_NOW).blocked, false);
  });

  it("a past-dated expense from a carry-over bucket has to fit every month since", () => {
    // Tithe had ₦1,000 left in September; it rolled into October and was spent there.
    const spentSince = [
      tx("i", 34_000, SEP),
      tx("e", 2_400, SEP, "tithe"),
      tx("e", 1_000, new Date(2026, 9, 3), "tithe"),
    ];
    const f = check(500, spentSince, "tithe", new Date(2026, 8, 25));
    assert.equal(f.remaining, 0); // September had 1,000, but none of it is left today
    assert.equal(f.blocked, true);
  });

  it("…including a month in between, even if the bucket has recovered since", () => {
    // Aug: Tithe 1,000 left. Sep: all of it spent. Oct: new income brings 5,000.
    const history = [
      tx("i", 10_000, new Date(2026, 7, 12)),
      tx("e", 1_000, SEP, "tithe"),
      tx("i", 50_000, new Date(2026, 9, 2)),
    ];
    // August shows 1,000 and today shows 5,000, but spending in August would
    // have left September short. The lowest point since August is 0.
    assert.equal(bucketAvailableOn(history, plan, "NGN", fx, "tithe", new Date(2026, 7, 20), OCT_NOW), 0);
    assert.equal(check(500, history, "tithe", new Date(2026, 7, 20)).blocked, true);
    // Today the bucket really does have 5,000
    assert.equal(bucketAvailableOn(history, plan, "NGN", fx, "tithe", OCT_NOW, OCT_NOW), 5_000);
  });

  it("when editing, the transaction being edited is left out of the check", () => {
    const original = tx("e", 8_000, new Date(2026, 9, 3), "spend");
    const withOriginal = [...thisMonthIncome, original];
    // Checked against everything (wrong): 8,000 already spent, so 8,100 looks too much.
    assert.equal(check(8_100, withOriginal).blocked, true);
    // Checked the right way: without the transaction being replaced, 8,100 fits.
    assert.equal(check(8_100, thisMonthIncome).blocked, false);
  });

  it("checks in the user's base currency", () => {
    // $10 at 1,580 = ₦15,800 against ₦8,100 available
    const f = check(10 * 1580);
    assert.equal(f.blocked, true);
    assert.equal(f.overBy, 7_700);
  });
});

describe("bucketAvailableOn", () => {
  const history = [tx("i", 34_000, SEP), tx("e", 2_400, SEP, "tithe")];
  const available = (bucketId: string, date: Date, txs: MoneyTx[] = history) =>
    bucketAvailableOn(txs, plan, "NGN", fx, bucketId, date, OCT_NOW);

  it("is zero with no history, before the first transaction, and for a bucket not in the plan", () => {
    assert.equal(available("spend", OCT_NOW, []), 0);
    assert.equal(available("tithe", new Date(2026, 6, 10)), 0); // July, before any income
    assert.equal(available("not_a_bucket", OCT_NOW), 0);
    assert.equal(bucketAvailableOn(history, null, "NGN", fx, "tithe", OCT_NOW, OCT_NOW), 0);
  });

  it("for a bucket that resets, is what was left in that month only", () => {
    assert.equal(available("spend", SEP), 2_754);
    assert.equal(available("spend", OCT_NOW), 0); // reset: nothing carried into October
  });

  it("for a bucket that carries over, is the lowest balance from that month to now", () => {
    assert.equal(available("tithe", SEP), 1_000);
    assert.equal(available("tithe", OCT_NOW), 1_000);
    assert.equal(available("emergency", SEP), 3_060);
  });

  it("an archived bucket has nothing available", () => {
    const archived: BudgetPlan = {
      ...plan,
      buckets: plan.buckets.map((b) => (b.id === "tithe" ? { ...b, archived: true } : b)),
    };
    assert.equal(bucketAvailableOn(history, archived, "NGN", fx, "tithe", SEP, OCT_NOW), 0);
  });
});

describe("a bucket can still end up below zero without a new expense", () => {
  // No expense is ever accepted past a bucket's balance. But history is rebuilt
  // with the current plan, so lowering a bucket's share (or correcting an income)
  // can leave past spending larger than what the bucket now receives. These rows
  // stand for that situation: the engine has to stay consistent through it.
  const txs = [
    tx("i", 100_000, new Date(2026, 9, 2)),
    tx("e", 10_000, new Date(2026, 9, 3), "spend"), // 1,900 more than Spend receives
    tx("e", 12_000, new Date(2026, 9, 3), "emergency"), // 3,000 more, carry-over bucket
  ];

  it("the bucket shows the shortfall, and the month still adds up", () => {
    const states = bucketStatesForMonth(txs, plan, "NGN", fx, OCT_NOW);
    const spend = states.find((s) => s.bucketId === "spend")!;
    assert.equal(spend.closing, -1_900);
    for (const s of states) {
      assert.equal(s.closing, s.opening + s.allocated - s.spent);
    }
    // TOTAL view shows the same thing
    assert.deepEqual(allTimeBucketStates(txs, plan, "NGN", fx, {}, OCT_NOW), states);
  });

  it("what actually happened is still counted in full", () => {
    assert.deepEqual(transactionTotals(txs, "NGN", fx), {
      income: 100_000,
      expenses: 22_000,
      net: 78_000,
    });
  });

  it("a bucket below zero has nothing available, so nothing more can be spent from it", () => {
    const f = expenseFriction({ amountBase: 1, bucketId: "spend", plan, txs, base: "NGN", fx, date: OCT_NOW, now: OCT_NOW });
    assert.equal(f.remaining, -1_900);
    assert.equal(f.blocked, true);
    assert.equal(f.message, "Spend has nothing available. That does not cover ₦1.");
  });

  it("a shortfall is not carried into the next month", () => {
    const next = nextOpeningBalances(bucketStatesForMonth(txs, plan, "NGN", fx, OCT_NOW));
    // Emergency carries over, but it ended ₦3,000 short: November opens at 0, not −3,000.
    assert.equal(next.emergency, undefined);
    // Spend resets every month anyway.
    assert.equal(next.spend, undefined);
    // Buckets with money left carry it as before.
    assert.equal(next.tithe, 10_000);

    const november = bucketStatesForMonth(txs, plan, "NGN", fx, new Date(2026, 10, 5));
    assert.equal(november.find((s) => s.bucketId === "emergency")!.opening, 0);
    assert.equal(november.find((s) => s.bucketId === "tithe")!.opening, 10_000);
  });
});
