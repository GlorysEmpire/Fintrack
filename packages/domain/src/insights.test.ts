import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { deriveInsights, insightLines, type InsightInput } from "./insights";
import type { MonthPerformance } from "./performance";

const month = (key: string, over: Partial<MonthPerformance> = {}): MonthPerformance => ({
  month: key, inProgress: false, daysElapsed: 30, daysInMonth: 30, hasRecords: true, converted: false,
  income: 100_000, expenses: 50_000, surplus: 50_000, expenseRate: 50, rateNote: "ok", remainingShare: 50,
  planAdherence: 100, bucketsBelowZero: 0, crossBucketSpends: 0, retained: 0, movedToSavings: 0, movedFromSavings: 0,
  retainedChange: null, ...over,
});

const base = (over: Partial<InsightInput> = {}): InsightInput => ({
  baseCurrency: "NGN",
  months: [month("2026-08"), month("2026-09")],
  comparison: {
    currentMonth: "2026-10", previousMonth: "2026-09", throughDay: 15,
    current: { income: 0, expenses: 0 }, previousSamePeriod: { income: 0, expenses: 0 }, previousFull: { income: 0, expenses: 0 },
    note: "",
  },
  trend: { status: "insufficient_data", recentAverage: null, earlierAverage: null, change: null, monthsUsed: 0, explanation: "" },
  buckets: [], accounts: [], unassignedCount: 0, pendingImports: 0, changedImports: 0, rulesWithProblems: 0, crossBucketThisMonth: 0,
  ...over,
});

const ids = (i: InsightInput) => deriveInsights(i).map((x) => x.id);

describe("deriveInsights", () => {
  it("says nothing when there is nothing to say", () => {
    // two finished months, income each, no savings moved, but no asset account either
    assert.deepEqual(ids(base()), []);
  });

  it("reports the expense-rate direction, with evidence and the caveat", () => {
    const [i] = deriveInsights(base({
      trend: { status: "higher", recentAverage: 70, earlierAverage: 50, change: 20, monthsUsed: 4, explanation: "…not automatically healthier…" },
    }));
    assert.equal(i.id, "expense-rate-trend");
    assert.equal(i.severity, "attention");
    assert.deepEqual(i.evidence, ["Recent average expense rate: 70%", "Earlier average: 50%", "Finished months compared: 4"]);
    assert.equal(deriveInsights(base({ trend: { status: "lower", recentAverage: 40, earlierAverage: 60, change: -20, monthsUsed: 4, explanation: "" } }))[0].severity, "good");
    assert.equal(deriveInsights(base({ trend: { status: "steady", recentAverage: 50, earlierAverage: 51, change: -1, monthsUsed: 4, explanation: "" } }))[0].severity, "info");
  });

  it("flags spending pace only when it is 20% or more above the same days last month", () => {
    const cmp = (current: number) => ({
      ...base().comparison, previousSamePeriod: { income: 0, expenses: 10_000 }, current: { income: 0, expenses: current },
    });
    assert.deepEqual(ids(base({ comparison: cmp(11_900) })), []);
    const [i] = deriveInsights(base({ comparison: cmp(12_000) }));
    assert.equal(i.id, "spending-pace");
    assert.match(i.detail, /20% more/);
    assert.equal(ids(base({ comparison: { ...cmp(5_000), previousSamePeriod: { income: 0, expenses: 0 } } })).length, 0);
  });

  it("notes a bucket nearly used up, not one that is simply unused", () => {
    assert.deepEqual(ids(base({ buckets: [{ name: "Spend", available: 10_000, spent: 9_100, closing: 900 }] })), ["bucket-nearly-empty:Spend"]);
    assert.deepEqual(ids(base({ buckets: [{ name: "Spend", available: 10_000, spent: 5_000, closing: 5_000 }] })), []);
    assert.deepEqual(ids(base({ buckets: [{ name: "Save", available: 0, spent: 0, closing: 0 }] })), []);
  });

  it("flags an account below zero, and mentions debts and unassigned transactions", () => {
    const out = deriveInsights(base({
      accounts: [
        { name: "Cash", kind: "asset", currency: "NGN", balance: -500, owed: 0, belowZero: true },
        { name: "Visa", kind: "liability", currency: "NGN", balance: -20_000, owed: 20_000, belowZero: false },
      ],
      unassignedCount: 3,
    }));
    assert.deepEqual(out.map((x) => x.id), ["account-below-zero:Cash", "debt:Visa", "unassigned-transactions", "nothing-moved-to-savings"]);
    assert.equal(out[0].severity, "attention");
    assert.equal(out[1].evidence[0], "Owed: ₦20,000.00");
  });

  it("does not talk about unassigned transactions when there are no accounts", () => {
    assert.deepEqual(ids(base({ unassignedCount: 9 })), []);
  });

  it("notices money set aside, or none for two months, from transfers only", () => {
    const withAsset = { accounts: [{ name: "Bank", kind: "asset" as const, currency: "NGN", balance: 1, owed: 0, belowZero: false }] };
    assert.deepEqual(ids(base(withAsset)), ["nothing-moved-to-savings"]);
    const set = base({ ...withAsset, months: [month("2026-08"), month("2026-09", { movedToSavings: 20_000 })] });
    const [i] = deriveInsights(set);
    assert.equal(i.id, "moved-to-savings");
    assert.match(i.detail, /does not by itself show that the account grew/);
    // no income in those months: nothing to compare against, so no nag
    assert.deepEqual(ids(base({ ...withAsset, months: [month("2026-08", { income: 0 }), month("2026-09", { income: 0 })] })), []);
  });

  it("flags a month that spent more than it recorded earning", () => {
    const out = deriveInsights(base({ months: [month("2026-08"), month("2026-09", { income: 10_000, expenses: 15_000, surplus: -5_000 })] }));
    assert.equal(out[0].id, "deficit-month");
  });

  it("flags a run of cross-bucket spends, and buckets that ended below zero", () => {
    assert.deepEqual(ids(base({ crossBucketThisMonth: 2 })), []);
    assert.deepEqual(ids(base({ crossBucketThisMonth: 3 })), ["cross-bucket-pattern"]);
    assert.deepEqual(ids(base({ months: [month("2026-08"), month("2026-09", { bucketsBelowZero: 2 })] })), ["buckets-below-zero"]);
  });

  it("surfaces things waiting on the user", () => {
    assert.deepEqual(ids(base({ pendingImports: 2, changedImports: 1, rulesWithProblems: 1 })), ["imports-changed", "recurring-problems", "imports-to-review"]);
  });

  it("points out months with no records, but not the one in progress", () => {
    const out = deriveInsights(base({ months: [month("2026-07", { hasRecords: false, income: 0, expenses: 0 }), month("2026-08"), month("2026-09"), month("2026-10", { inProgress: true, hasRecords: false })] }));
    assert.deepEqual(out.map((x) => x.id), ["months-without-records"]);
    assert.equal(out[0].evidence[0], "Months with nothing recorded: 2026-07");
  });

  it("puts what needs attention first", () => {
    const out = deriveInsights(base({
      pendingImports: 1,
      accounts: [{ name: "Cash", kind: "asset", currency: "NGN", balance: -1, owed: 0, belowZero: true }],
      months: [month("2026-08"), month("2026-09", { movedToSavings: 5_000 })],
    }));
    assert.deepEqual(out.map((x) => x.severity), ["attention", "info", "good"]);
  });

  it("never gives investment advice or claims about wealth", () => {
    const everything = deriveInsights(base({
      trend: { status: "lower", recentAverage: 40, earlierAverage: 60, change: -20, monthsUsed: 4, explanation: "x" },
      accounts: [{ name: "Vault", kind: "asset", currency: "NGN", balance: -5, owed: 0, belowZero: true }, { name: "Loan", kind: "liability", currency: "NGN", balance: -9, owed: 9, belowZero: false }],
      unassignedCount: 1, pendingImports: 1, changedImports: 1, rulesWithProblems: 1, crossBucketThisMonth: 5,
      months: [month("2026-08"), month("2026-09", { movedToSavings: 1, bucketsBelowZero: 1, income: 10, expenses: 20, surplus: -10 })],
    }));
    const text = JSON.stringify(everything).toLowerCase();
    assert.doesNotMatch(text, /\b(buy|sell|stock|etf|crypto|guaranteed|return on|net worth|wealth (rose|grew|increased))\b/);
    assert.ok(everything.every((i) => i.evidence.length > 0), "every insight shows its numbers");
  });

  it("renders as plain lines, capped", () => {
    const lines = insightLines(deriveInsights(base({ pendingImports: 1 })), 1);
    assert.equal(lines.length, 1);
    assert.match(lines[0], /^- \[info\] Bank transactions are waiting/);
  });
});
