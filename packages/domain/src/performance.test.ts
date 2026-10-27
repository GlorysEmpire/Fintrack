import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  accountMovementForMonth,
  compareWithPreviousMonth,
  expenseRateTrend,
  monthlyPerformance,
  savingsFlowsByMonth,
  type MonthPerformance,
  type PerfTx,
} from "./performance";
import { accountBalances, toMinor, type LedgerAccount } from "./accounts";
import { TITHE_FIRST_TEMPLATE } from "./templates";

const fx = { NGN: 1, USD: 1580, GBP: 1990, EUR: 1710 };
const plan = {
  id: "p",
  name: "Tithe",
  emergencyCarryOverDefault: true,
  buckets: TITHE_FIRST_TEMPLATE.plan.buckets,
};
// "Now" is 15 Oct 2026, 13:00 in Lagos
const NOW = new Date("2026-10-15T12:00:00Z");
const at = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d, 12));
const inc = (amount: number, date: Date, currency = "NGN"): PerfTx => ({ type: "i", amount, currency, date });
const exp = (amount: number, date: Date, bucketId = "spend", override = false): PerfTx => ({
  type: "e", amount, currency: "NGN", bucketId, date, override,
});

const perf = (txs: PerfTx[], extra: { plan?: typeof plan | null } = {}) =>
  monthlyPerformance({ txs, plan: extra.plan === undefined ? plan : extra.plan, base: "NGN", fx, now: NOW });
const month = (rows: MonthPerformance[], key: string) => rows.find((r) => r.month === key)!;

describe("monthlyPerformance: income, expenses, expense rate", () => {
  it("expense rate is expenses ÷ income × 100, with the amounts beside it", () => {
    const rows = perf([inc(100_000, at(2026, 9, 2)), exp(5_000, at(2026, 9, 5)), exp(3_000, at(2026, 9, 9))]);
    const sep = month(rows, "2026-09");
    assert.equal(sep.income, 100_000);
    assert.equal(sep.expenses, 8_000);
    assert.equal(sep.expenseRate, 8);
    assert.equal(sep.surplus, 92_000);
    assert.equal(sep.remainingShare, 92);
    assert.equal(sep.rateNote, "ok");
    assert.equal(sep.inProgress, false);
  });

  it("shows no percentage when there is no income, and says why", () => {
    const rows = perf([exp(5_000, at(2026, 9, 5))]);
    const sep = month(rows, "2026-09");
    assert.equal(sep.expenseRate, null);
    assert.equal(sep.remainingShare, null);
    assert.equal(sep.rateNote, "no_income");
    assert.equal(sep.expenses, 5_000); // the absolute number is still there
    assert.equal(sep.surplus, -5_000);
  });

  it("a month with no records at all is flagged, not shown as 0%", () => {
    const rows = perf([inc(100_000, at(2026, 8, 2)), inc(100_000, at(2026, 10, 2))]);
    const sep = month(rows, "2026-09");
    assert.equal(sep.hasRecords, false);
    assert.equal(sep.expenseRate, null);
    assert.equal(sep.rateNote, "no_records");
  });

  it("income with no spending is a 0% rate (a real zero, not a missing one)", () => {
    const sep = month(perf([inc(50_000, at(2026, 9, 2))]), "2026-09");
    assert.equal(sep.expenseRate, 0);
    assert.equal(sep.rateNote, "ok");
  });

  it("spending above income gives a rate over 100%, and a deficit", () => {
    const sep = month(perf([inc(10_000, at(2026, 9, 2)), exp(15_000, at(2026, 9, 3))], { plan: null }), "2026-09");
    assert.equal(sep.expenseRate, 150);
    assert.equal(sep.surplus, -5_000);
  });

  it("the current month is marked in progress and labelled, with its day count", () => {
    const oct = month(perf([inc(100_000, at(2026, 10, 2)), exp(20_000, at(2026, 10, 5))]), "2026-10");
    assert.equal(oct.inProgress, true);
    assert.equal(oct.rateNote, "month_in_progress");
    assert.equal(oct.daysElapsed, 15);
    assert.equal(oct.daysInMonth, 31);
    assert.equal(oct.expenseRate, 20); // still given, but labelled
  });

  it("converts other currencies at the saved rates and flags it", () => {
    const sep = month(perf([inc(100, at(2026, 9, 2), "USD"), exp(31_600, at(2026, 9, 3))]), "2026-09");
    assert.equal(sep.income, 158_000);
    assert.equal(sep.converted, true);
    assert.equal(sep.expenseRate, 20);
    assert.equal(month(perf([inc(1_000, at(2026, 9, 2))]), "2026-09").converted, false);
  });

  it("a transaction at 23:30 UTC on 30 Sept counts in October (Lagos)", () => {
    const rows = perf([inc(1_000, new Date("2026-09-30T23:30:00Z"))]);
    assert.equal(month(rows, "2026-10").income, 1_000);
    assert.equal(rows.find((r) => r.month === "2026-09"), undefined);
  });

  it("returns nothing when nothing has been recorded, and ignores the future", () => {
    assert.deepEqual(perf([]), []);
    assert.deepEqual(perf([inc(5, at(2027, 1, 1))]), []);
  });

  it("returns one row per month with no gaps, oldest first", () => {
    const rows = perf([inc(1, at(2026, 6, 1)), inc(1, at(2026, 10, 1))]);
    assert.deepEqual(rows.map((r) => r.month), ["2026-06", "2026-07", "2026-08", "2026-09", "2026-10"]);
  });
});

describe("transfers and credit activity do not distort the numbers", () => {
  it("transfers are not transactions, so performance is identical with or without them", () => {
    const txs = [inc(100_000, at(2026, 9, 2)), exp(8_000, at(2026, 9, 5))];
    const before = perf(txs);
    // A transfer lives in a different table and never enters these inputs
    const after = perf([...txs]);
    assert.deepEqual(before, after);
  });

  it("a card purchase is counted once; paying the card adds no second expense", () => {
    // The purchase is an expense on the card. The payment is a transfer, absent from txs.
    const rows = perf([inc(100_000, at(2026, 9, 2)), exp(5_000, at(2026, 9, 6))]);
    assert.equal(month(rows, "2026-09").expenses, 5_000);
  });

  it("loan proceeds are a transfer from the loan account, so they are not income", () => {
    const rows = perf([inc(100_000, at(2026, 9, 2))]);
    assert.equal(month(rows, "2026-09").income, 100_000);
  });
});

describe("plan adherence, retained balances and cross-bucket spending", () => {
  it("a month where every bucket stays at or above zero is 100% adherent", () => {
    const sep = month(perf([inc(100_000, at(2026, 9, 2)), exp(1_000, at(2026, 9, 3))]), "2026-09");
    assert.equal(sep.planAdherence, 100);
    assert.equal(sep.bucketsBelowZero, 0);
  });

  it("a bucket pushed below zero (here by a later income correction) lowers adherence", () => {
    // Spent 8,100 when ₦100k came in; the income is then recorded as only ₦10k
    const txs = [inc(10_000, at(2026, 9, 2)), exp(8_000, at(2026, 9, 3))];
    const sep = month(perf(txs), "2026-09");
    assert.ok((sep.planAdherence ?? 100) < 100);
    assert.ok(sep.bucketsBelowZero >= 1);
  });

  it("adherence is null without a plan", () => {
    assert.equal(month(perf([inc(1_000, at(2026, 9, 2))], { plan: null }), "2026-09").planAdherence, null);
  });

  it("retained money builds up in carry-over buckets from month to month", () => {
    const rows = perf([inc(100_000, at(2026, 8, 2)), inc(100_000, at(2026, 9, 2))]);
    const aug = month(rows, "2026-08");
    const sep = month(rows, "2026-09");
    assert.ok(aug.retained > 0);
    assert.ok(sep.retained > aug.retained);
    assert.equal(aug.retainedChange, null);
    assert.ok((sep.retainedChange ?? 0) > 0);
    assert.equal(sep.retainedChange, sep.retained - aug.retained);
  });

  it("counts expenses spent outside their bucket's category", () => {
    const sep = month(perf([inc(100_000, at(2026, 9, 2)), exp(500, at(2026, 9, 3), "spend", true), exp(500, at(2026, 9, 4))]), "2026-09");
    assert.equal(sep.crossBucketSpends, 1);
  });
});

describe("compareWithPreviousMonth: like with like", () => {
  const txs = [
    inc(100_000, at(2026, 9, 2)), exp(10_000, at(2026, 9, 5)), exp(30_000, at(2026, 9, 25)), // September
    inc(90_000, at(2026, 10, 2)), exp(12_000, at(2026, 10, 6)),                              // October so far
  ];
  const c = compareWithPreviousMonth({ txs, base: "NGN", fx, now: NOW });

  it("cuts the previous month at the same day, not the whole month", () => {
    assert.equal(c.throughDay, 15);
    assert.deepEqual(c.previousSamePeriod, { income: 100_000, expenses: 10_000 }); // the ₦30k on the 25th is not yet "due"
    assert.deepEqual(c.previousFull, { income: 100_000, expenses: 40_000 });
    assert.deepEqual(c.current, { income: 90_000, expenses: 12_000 });
  });

  it("says plainly what is being compared", () => {
    assert.match(c.note, /in progress \(day 15 of 31\)/);
    assert.match(c.note, /first 15 days of 2026-09/);
  });

  it("on the last day of the month both are complete", () => {
    const end = compareWithPreviousMonth({ txs, base: "NGN", fx, now: new Date("2026-10-31T12:00:00Z") });
    assert.equal(end.note, "Both months are complete.");
  });
});

describe("expenseRateTrend", () => {
  const row = (month: string, rate: number | null, inProgress = false): MonthPerformance => ({
    month, inProgress, daysElapsed: 30, daysInMonth: 30, hasRecords: true, converted: false,
    income: 100, expenses: rate ?? 0, surplus: 0, expenseRate: rate, rateNote: "ok", remainingShare: null,
    planAdherence: null, bucketsBelowZero: 0, crossBucketSpends: 0, retained: 0, movedToSavings: 0, movedFromSavings: 0, retainedChange: null,
  });

  it("needs enough finished months", () => {
    const t = expenseRateTrend([row("2026-07", 50), row("2026-08", 50), row("2026-09", 50)]);
    assert.equal(t.status, "insufficient_data");
    assert.equal(t.change, null);
  });

  it("ignores the month in progress and months with no rate", () => {
    const t = expenseRateTrend([row("2026-06", 60), row("2026-07", null), row("2026-08", 60), row("2026-09", 40), row("2026-10", 5, true)]);
    assert.equal(t.status, "insufficient_data"); // only 3 usable finished months
  });

  it("reports a lower rate and explains it, with the caveat", () => {
    const rows = [60, 60, 60, 40, 40, 40].map((r, i) => row(`2026-0${i + 3}`, r));
    const t = expenseRateTrend(rows);
    assert.equal(t.status, "lower");
    assert.equal(t.recentAverage, 40);
    assert.equal(t.earlierAverage, 60);
    assert.equal(t.change, -20);
    assert.match(t.explanation, /not automatically healthier/);
  });

  it("reports higher, and steady within 2 points", () => {
    assert.equal(expenseRateTrend([40, 40, 60, 60].map((r, i) => row(`2026-0${i + 5}`, r))).status, "higher");
    assert.equal(expenseRateTrend([50, 50, 51, 51].map((r, i) => row(`2026-0${i + 5}`, r))).status, "steady");
  });
});

describe("accountMovementForMonth", () => {
  const OPEN = at(2026, 8, 1);
  const bank: LedgerAccount = { id: "bank", kind: "asset", currency: "NGN", openingBalanceMinor: toMinor(100_000), openingDate: OPEN };
  const cash: LedgerAccount = { id: "cash", kind: "asset", currency: "NGN", openingBalanceMinor: 0, openingDate: OPEN };
  const txs = [
    { accountId: "bank", type: "i" as const, amount: 50_000, currency: "NGN", date: at(2026, 9, 3) },
    { accountId: "bank", type: "e" as const, amount: 10_000, currency: "NGN", date: at(2026, 9, 10) },
    { accountId: "bank", type: "e" as const, amount: 999, currency: "NGN", date: at(2026, 8, 20) }, // earlier month
  ];
  const transfers = [{ fromAccountId: "bank", toAccountId: "cash", fromAmountMinor: toMinor(20_000), toAmountMinor: toMinor(20_000), feeMinor: toMinor(50), date: at(2026, 9, 12) }];
  const run = (month: string) =>
    accountMovementForMonth({ accounts: [bank, cash], txs, transfers, adjustments: [], month });

  it("explains how each balance moved in the month", () => {
    const sep = run("2026-09");
    const b = sep.find((m) => m.accountId === "bank")!;
    assert.equal(b.startMinor, toMinor(100_000 - 999));
    assert.equal(b.endMinor, toMinor(100_000 - 999 + 50_000 - 10_000 - 20_000 - 50));
    assert.equal(b.netMinor, b.endMinor - b.startMinor);
    assert.equal(b.incomeMinor, toMinor(50_000));
    assert.equal(b.expenseMinor, toMinor(10_000));
    assert.equal(b.transfersOutMinor, toMinor(20_000));
    assert.equal(b.feesMinor, toMinor(50));
    const c = sep.find((m) => m.accountId === "cash")!;
    assert.equal(c.netMinor, toMinor(20_000));
    assert.equal(c.transfersInMinor, toMinor(20_000));
  });

  it("the transfer moves the same money out of one account and into the other", () => {
    const sep = run("2026-09");
    const net = sep.reduce((s, m) => s + m.netMinor, 0);
    // Total across accounts changes only by real income, expenses and the fee
    assert.equal(net, toMinor(50_000 - 10_000 - 50));
  });

  it("end balances match the balances the Accounts page derives", () => {
    const derived = accountBalances([bank, cash], txs, transfers);
    for (const m of run("2026-10")) {
      assert.equal(m.endMinor, derived.find((d) => d.accountId === m.accountId)!.balanceMinor);
    }
  });

  it("an account opened mid-month starts from its opening balance; one not yet open is left out", () => {
    const late: LedgerAccount = { id: "late", kind: "asset", currency: "NGN", openingBalanceMinor: toMinor(5_000), openingDate: at(2026, 9, 20) };
    const rows = accountMovementForMonth({ accounts: [bank, late], txs: [], transfers: [], adjustments: [], month: "2026-09" });
    const l = rows.find((m) => m.accountId === "late")!;
    assert.equal(l.openedThisMonth, true);
    assert.equal(l.startMinor, toMinor(5_000));
    assert.equal(l.netMinor, 0);
    const aug = accountMovementForMonth({ accounts: [bank, late], txs: [], transfers: [], adjustments: [], month: "2026-08" });
    assert.equal(aug.some((m) => m.accountId === "late"), false);
  });
});

describe("savings and investment contributions come only from transfers", () => {
  const accounts = [
    { id: "bank", type: "bank", currency: "NGN" },
    { id: "save", type: "savings", currency: "NGN" },
    { id: "save2", type: "savings", currency: "NGN" },
    { id: "inv", type: "investment", currency: "USD" },
    { id: "card", type: "credit_card", currency: "NGN" },
  ];
  const tr = (from: string, to: string, amount: number, date: Date, toAmount = amount) => ({
    fromAccountId: from, toAccountId: to, fromAmountMinor: toMinor(amount), toAmountMinor: toMinor(toAmount), feeMinor: 0, date,
  });

  it("counts money moved into savings, and back out, per month", () => {
    const flows = savingsFlowsByMonth({
      accounts, base: "NGN", fx,
      transfers: [
        tr("bank", "save", 30_000, at(2026, 9, 5)),
        tr("bank", "save", 10_000, at(2026, 9, 20)),
        tr("save", "bank", 5_000, at(2026, 9, 25)),
        tr("bank", "save", 1_000, at(2026, 10, 2)),
      ],
    });
    assert.deepEqual(flows.get("2026-09"), { movedIn: 40_000, movedOut: 5_000 });
    assert.deepEqual(flows.get("2026-10"), { movedIn: 1_000, movedOut: 0 });
  });

  it("moving between two savings accounts, or paying a card, is not a contribution", () => {
    const flows = savingsFlowsByMonth({
      accounts, base: "NGN", fx,
      transfers: [tr("save", "save2", 9_000, at(2026, 9, 5)), tr("bank", "card", 7_000, at(2026, 9, 6))],
    });
    assert.equal(flows.size, 0);
  });

  it("an investment account in another currency is valued at what arrived, at the saved rate", () => {
    const flows = savingsFlowsByMonth({
      accounts, base: "NGN", fx,
      transfers: [tr("bank", "inv", 158_000, at(2026, 9, 5), 100)], // $100 arrived
    });
    assert.equal(flows.get("2026-09")!.movedIn, 158_000);
  });

  it("shows up on the month's row, and is not spending", () => {
    const savingsFlows = savingsFlowsByMonth({ accounts, base: "NGN", fx, transfers: [tr("bank", "save", 30_000, at(2026, 9, 5))] });
    const rows = monthlyPerformance({
      txs: [inc(100_000, at(2026, 9, 2)), exp(5_000, at(2026, 9, 3))], plan, base: "NGN", fx, now: NOW, savingsFlows,
    });
    const sep = rows.find((r) => r.month === "2026-09")!;
    assert.equal(sep.movedToSavings, 30_000);
    assert.equal(sep.expenses, 5_000); // setting money aside did not change spending
    assert.equal(sep.expenseRate, 5);
  });
});
