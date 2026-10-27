/**
 * FINANCIAL PERFORMANCE — am I doing better over time?
 *
 * Deterministic arithmetic over the recorded transactions, plan and accounts.
 * An AI may explain these numbers; it must never be where they come from.
 *
 * What is counted:
 *   Income and expenses are the user's income and expense TRANSACTIONS only.
 *   Transfers between accounts and balance adjustments are separate records
 *   (accounts.ts), so they can not appear here: moving money is not earning or
 *   spending it. A credit-card purchase is spending on the day it is recorded;
 *   paying the card is a transfer, so it is not counted a second time. Loan
 *   money is a transfer from the loan account, so it is not income.
 *
 * What is honest about it:
 *   - Expense rate is NOT shown (null, with a reason) when there is no income,
 *     when the month has no records, and it is labelled while a month is still
 *     in progress. Absolute spending always sits next to it.
 *   - Different currencies are converted at the user's saved rates, today's
 *     rates applied to old months: that is flagged.
 *   - Refunds and "one-off" expenses are not modelled yet, so they are not
 *     treated specially (see PERFORMANCE_LIMITS).
 *   - Surplus is cash flow (income - expenses). It is not a change in wealth.
 *
 * Pure rules only: no database, no React.
 */
import type { BudgetPlan } from "./types";
import {
  MONEY_EPSILON,
  appDayOfMonth,
  daysInMonthKey,
  monthKeyOf,
  replayMonthStates,
  startOfMonthOffset,
  sumExpenses,
  sumIncome,
  type MoneyTx,
} from "./money";
import {
  accountBalances,
  type AccountBalance,
  type LedgerAccount,
  type LedgerAdjustment,
  type LedgerTransfer,
  type LedgerTx,
} from "./accounts";

/** Things the numbers do not do (yet), for screens to state plainly */
export const PERFORMANCE_LIMITS = [
  "Income and expenses are your recorded transactions. Transfers between your accounts and balance adjustments are never counted as either.",
  "Amounts in other currencies are converted at your saved exchange rates, including for past months.",
  "Refunds and one-off expenses are not modelled yet, so they are counted like any other transaction.",
  "Surplus is income minus expenses for the month. It is not a change in your wealth.",
  "A lower expense rate is not automatically healthier: look at the amounts too.",
] as const;

export interface PerfTx extends MoneyTx {
  /** Spent on a category outside the bucket (with a written reason) */
  override?: boolean;
}

export type ExpenseRateNote = "ok" | "no_records" | "no_income" | "month_in_progress";

export interface MonthPerformance {
  /** "YYYY-MM" */
  month: string;
  /** The current month: not finished, so not comparable with a full month */
  inProgress: boolean;
  /** Days of the month that have passed (all of them for a finished month) */
  daysElapsed: number;
  daysInMonth: number;
  hasRecords: boolean;
  /** Some transactions were in a currency other than the base currency */
  converted: boolean;
  /** Base currency */
  income: number;
  expenses: number;
  /** Cash-flow surplus (or deficit when negative): income - expenses */
  surplus: number;
  /** expenses / income × 100. null when it would mislead: see rateNote */
  expenseRate: number | null;
  rateNote: ExpenseRateNote;
  /** surplus / income × 100: how much of income remained. null without income */
  remainingShare: number | null;
  /** Share (0-100) of active buckets that finished the month at or above zero. null: no plan or no activity */
  planAdherence: number | null;
  /** Buckets that finished the month below zero (after a plan change or a corrected income) */
  bucketsBelowZero: number;
  /** Expenses outside their bucket's category, with a written reason */
  crossBucketSpends: number;
  /** Money sitting in carry-over buckets at month end (base currency) */
  retained: number;
  /** Change in retained money from the month before; null for the first month */
  retainedChange: number | null;
}

function keyParts(key: string): { y: number; m: number } {
  const [y, m] = key.split("-").map(Number);
  return { y, m };
}

function nextKey(key: string): string {
  const { y, m } = keyParts(key);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
}

function keysBetween(first: string, last: string): string[] {
  const out: string[] = [];
  for (let k = first; k <= last; k = nextKey(k)) out.push(k);
  return out;
}

/** A date inside the given month, for helpers that take an instant */
function midMonth(key: string): Date {
  const { y, m } = keyParts(key);
  return new Date(Date.UTC(y, m - 1, 15, 12));
}

/**
 * One row per calendar month, oldest first, from the first transaction to the
 * current month (at most the last `months`).
 */
export function monthlyPerformance(opts: {
  txs: PerfTx[];
  plan: BudgetPlan | null;
  base: string;
  fx: Record<string, number>;
  now?: Date;
  /** How many months to return (default 12) */
  months?: number;
}): MonthPerformance[] {
  const { txs, plan, base, fx } = opts;
  const now = opts.now ?? new Date();
  if (txs.length === 0) return [];

  const currentKey = monthKeyOf(now);
  const byMonth = new Map<string, PerfTx[]>();
  for (const t of txs) {
    const key = monthKeyOf(t.date);
    if (key > currentKey) continue; // nothing is recorded in the future
    const list = byMonth.get(key) ?? [];
    list.push(t);
    byMonth.set(key, list);
  }
  const recorded = [...byMonth.keys()].sort();
  if (recorded.length === 0) return [];

  const allKeys = keysBetween(recorded[0], currentKey);
  const shown = new Set(allKeys.slice(-(opts.months ?? 12)));
  const states = replayMonthStates(txs, plan, base, fx, currentKey);

  const rows: MonthPerformance[] = [];
  let previousRetained: number | null = null;
  for (const key of allKeys) {
    const monthTxs = byMonth.get(key) ?? [];
    const income = sumIncome(monthTxs, base, fx);
    const expenses = sumExpenses(monthTxs, base, fx);
    const inProgress = key === currentKey;
    const daysInMonth = daysInMonthKey(key);
    const hasRecords = monthTxs.length > 0;

    const buckets = states.get(key) ?? [];
    const active = buckets.filter(
      (b) => b.allocated > MONEY_EPSILON || b.spent > MONEY_EPSILON || b.opening > MONEY_EPSILON
    );
    const below = active.filter((b) => b.closing < -MONEY_EPSILON).length;
    const retained = buckets
      .filter((b) => b.carryOver && b.closing > MONEY_EPSILON)
      .reduce((sum, b) => sum + b.closing, 0);

    let rateNote: ExpenseRateNote = "ok";
    if (!hasRecords) rateNote = "no_records";
    else if (income <= MONEY_EPSILON) rateNote = "no_income";
    else if (inProgress) rateNote = "month_in_progress";

    const row: MonthPerformance = {
      month: key,
      inProgress,
      daysElapsed: inProgress ? appDayOfMonth(now) : daysInMonth,
      daysInMonth,
      hasRecords,
      converted: monthTxs.some((t) => t.currency !== base),
      income,
      expenses,
      surplus: income - expenses,
      expenseRate:
        hasRecords && income > MONEY_EPSILON ? (expenses / income) * 100 : null,
      rateNote,
      remainingShare:
        hasRecords && income > MONEY_EPSILON ? ((income - expenses) / income) * 100 : null,
      planAdherence:
        plan && active.length > 0 ? ((active.length - below) / active.length) * 100 : null,
      bucketsBelowZero: below,
      crossBucketSpends: monthTxs.filter((t) => t.type === "e" && t.override).length,
      retained,
      retainedChange: previousRetained === null ? null : retained - previousRetained,
    };
    previousRetained = retained;
    if (shown.has(key)) rows.push(row);
  }
  return rows;
}

/* ─── Comparing like with like ────────────────────────────────────── */

export interface PeriodTotals {
  income: number;
  expenses: number;
}

export interface MonthComparison {
  currentMonth: string;
  previousMonth: string;
  /** The day of the month "today" is: both sides are cut at this day */
  throughDay: number;
  current: PeriodTotals;
  /** The previous month, only up to the same day: the fair comparison */
  previousSamePeriod: PeriodTotals;
  /** The previous month in full, for context */
  previousFull: PeriodTotals;
  /** Plain sentence saying what is being compared */
  note: string;
}

/**
 * This month so far against the previous month up to the SAME day, so an
 * unfinished month is never set against a finished one.
 */
export function compareWithPreviousMonth(opts: {
  txs: MoneyTx[];
  base: string;
  fx: Record<string, number>;
  now?: Date;
}): MonthComparison {
  const { txs, base, fx } = opts;
  const now = opts.now ?? new Date();
  const currentMonth = monthKeyOf(now);
  const previousMonth = monthKeyOf(startOfMonthOffset(-1, now));
  const throughDay = appDayOfMonth(now);

  const totalsOf = (list: MoneyTx[]): PeriodTotals => ({
    income: sumIncome(list, base, fx),
    expenses: sumExpenses(list, base, fx),
  });
  const dayOf = (t: MoneyTx) =>
    appDayOfMonth(typeof t.date === "string" ? new Date(t.date) : t.date);
  const inMonth = (key: string) => txs.filter((t) => monthKeyOf(t.date) === key);

  const previous = inMonth(previousMonth);
  const comparableDays = Math.min(throughDay, daysInMonthKey(previousMonth));
  return {
    currentMonth,
    previousMonth,
    throughDay,
    current: totalsOf(inMonth(currentMonth)),
    previousSamePeriod: totalsOf(previous.filter((t) => dayOf(t) <= throughDay)),
    previousFull: totalsOf(previous),
    note:
      throughDay >= daysInMonthKey(currentMonth)
        ? "Both months are complete."
        : `This month is in progress (day ${throughDay} of ${daysInMonthKey(currentMonth)}), so it is compared with the first ${comparableDays} day${comparableDays === 1 ? "" : "s"} of ${previousMonth}, not with the whole month.`,
  };
}

/* ─── Is the expense rate moving? ─────────────────────────────────── */

export type TrendStatus = "insufficient_data" | "lower" | "steady" | "higher";

export interface ExpenseRateTrend {
  status: TrendStatus;
  /** Average expense rate of the most recent finished months used (percent) */
  recentAverage: number | null;
  /** Average of the finished months before those */
  earlierAverage: number | null;
  /** recent − earlier, in percentage points */
  change: number | null;
  monthsUsed: number;
  explanation: string;
}

/** A change smaller than this many percentage points is called steady */
export const TREND_STEADY_POINTS = 2;

/**
 * Compares the expense rate of the latest finished months (up to 3) with the
 * 3 before them. Needs at least 2 finished months with income on each side.
 * The result is a direction, not a verdict: lower is not automatically better.
 */
export function expenseRateTrend(rows: MonthPerformance[]): ExpenseRateTrend {
  const rates = rows.filter((r) => !r.inProgress && r.expenseRate !== null).map((r) => r.expenseRate as number);
  const recentCount = Math.min(3, Math.floor(rates.length / 2));
  if (recentCount < 2) {
    return {
      status: "insufficient_data",
      recentAverage: null,
      earlierAverage: null,
      change: null,
      monthsUsed: rates.length,
      explanation:
        "Not enough finished months with income yet. A trend needs at least 4 of them, so two can be set against two.",
    };
  }
  const recent = rates.slice(-recentCount);
  const earlier = rates.slice(-recentCount * 2, -recentCount);
  const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const change = avg(recent) - avg(earlier);
  const status: TrendStatus =
    Math.abs(change) < TREND_STEADY_POINTS ? "steady" : change < 0 ? "lower" : "higher";
  const words =
    status === "steady"
      ? "about the same as"
      : status === "lower"
        ? "lower than"
        : "higher than";
  return {
    status,
    recentAverage: avg(recent),
    earlierAverage: avg(earlier),
    change,
    monthsUsed: recentCount * 2,
    explanation: `Over the last ${recentCount} finished months you spent ${Math.round(avg(recent))}% of your income, ${words} the ${recentCount} months before (${Math.round(avg(earlier))}%). A lower rate is not automatically healthier: check the amounts too.`,
  };
}

/* ─── Account movement ────────────────────────────────────────────── */

export interface AccountMonthMovement {
  accountId: string;
  /** Minor units */
  startMinor: number;
  endMinor: number;
  netMinor: number;
  /** The account opened during the month, so it starts from its opening balance */
  openedThisMonth: boolean;
  incomeMinor: number;
  expenseMinor: number;
  transfersInMinor: number;
  transfersOutMinor: number;
  feesMinor: number;
  adjustmentsMinor: number;
}

/**
 * What happened to each account in one month, from the same derived balances
 * the Accounts page shows: the balance at the start, at the end, and why it moved.
 */
export function accountMovementForMonth(opts: {
  accounts: LedgerAccount[];
  txs: LedgerTx[];
  transfers: LedgerTransfer[];
  adjustments: LedgerAdjustment[];
  /** "YYYY-MM" */
  month: string;
}): AccountMonthMovement[] {
  const { accounts, txs, transfers, adjustments } = opts;
  const monthStart = startOfMonthOffset(0, midMonth(opts.month));
  const monthEnd = startOfMonthOffset(1, midMonth(opts.month));
  const t = (d: Date | string) => (typeof d === "string" ? new Date(d) : d).getTime();

  const asOf = (limit: Date, only: LedgerAccount[]) =>
    new Map<string, AccountBalance>(
      accountBalances(
        only,
        txs.filter((x) => t(x.date) < limit.getTime()),
        transfers.filter((x) => t(x.date) < limit.getTime()),
        adjustments.filter((x) => t(x.date) < limit.getTime())
      ).map((b) => [b.accountId, b])
    );

  const openByEnd = accounts.filter((a) => t(a.openingDate) < monthEnd.getTime());
  const end = asOf(monthEnd, openByEnd);
  const openByStart = openByEnd.filter((a) => t(a.openingDate) < monthStart.getTime());
  const start = asOf(monthStart, openByStart);

  return openByEnd.map((a) => {
    const e = end.get(a.id) as AccountBalance;
    const s = start.get(a.id);
    const openedThisMonth = !s;
    const startMinor = s ? s.balanceMinor : a.openingBalanceMinor;
    const diff = (key: keyof AccountBalance) =>
      (e[key] as number) - (s ? (s[key] as number) : 0);
    return {
      accountId: a.id,
      startMinor,
      endMinor: e.balanceMinor,
      netMinor: e.balanceMinor - startMinor,
      openedThisMonth,
      incomeMinor: diff("incomeMinor"),
      expenseMinor: diff("expenseMinor"),
      transfersInMinor: diff("transfersInMinor"),
      transfersOutMinor: diff("transfersOutMinor"),
      feesMinor: diff("feesMinor"),
      adjustmentsMinor: diff("adjustmentsMinor"),
    };
  });
}
