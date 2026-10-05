/**
 * Money helpers used by the web API when turning DB rows into dashboard numbers.
 * Keep pure (no Prisma / no React) so mobile can reuse later.
 */
import type { BudgetPlan } from "./types";
import type { CurrencyCode } from "./fx";
import { toBase } from "./fx";
import { allocateWaterfall } from "./waterfall";
import {
  monthBucketStates,
  nextOpeningBalances,
  type MonthBucketState,
} from "./carryover";

/** Minimal transaction shape from the DB layer */
export interface MoneyTx {
  type: "i" | "e";
  amount: number;
  currency: string;
  bucketId?: string | null;
  sourceId?: string | null;
  date: Date | string;
}

/** First moment of the current calendar month (local browser/server time) */
export function startOfMonth(d = new Date()): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
}

export function isInCurrentMonth(date: Date | string, now = new Date()): boolean {
  const t = typeof date === "string" ? new Date(date) : date;
  return t >= startOfMonth(now);
}

export function filterMonthTxs<T extends MoneyTx>(txs: T[], now = new Date()): T[] {
  const start = startOfMonth(now);
  return txs.filter((t) => {
    const d = typeof t.date === "string" ? new Date(t.date) : t.date;
    return d >= start;
  });
}

/** Convert amount into user's base currency using their FX table */
export function amountInBase(
  amount: number,
  currency: string,
  base: string,
  fx: Record<string, number>
): number {
  return toBase(
    amount,
    currency as CurrencyCode,
    base as CurrencyCode,
    fx
  );
}

export function sumIncome(
  txs: MoneyTx[],
  base: string,
  fx: Record<string, number>
): number {
  return txs
    .filter((t) => t.type === "i")
    .reduce((s, t) => s + amountInBase(t.amount, t.currency, base, fx), 0);
}

export function sumExpenses(
  txs: MoneyTx[],
  base: string,
  fx: Record<string, number>
): number {
  return txs
    .filter((t) => t.type === "e")
    .reduce((s, t) => s + amountInBase(t.amount, t.currency, base, fx), 0);
}

/** Spend per bucket id this month (base currency) */
export function spentByBucket(
  txs: MoneyTx[],
  base: string,
  fx: Record<string, number>
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const t of txs) {
    if (t.type !== "e" || !t.bucketId) continue;
    const n = amountInBase(t.amount, t.currency, base, fx);
    out[t.bucketId] = (out[t.bucketId] || 0) + n;
  }
  return out;
}

/**
 * Totals across any set of transactions (usually the user's full history).
 * Pure "what actually happened": no waterfall, no plan allocations, no
 * projections — only logged income minus logged expenses, converted to base.
 */
export function transactionTotals(
  txs: MoneyTx[],
  base: string,
  fx: Record<string, number>
): { income: number; expenses: number; net: number } {
  const income = sumIncome(txs, base, fx);
  const expenses = sumExpenses(txs, base, fx);
  return { income, expenses, net: income - expenses };
}

/** Calendar-month key in local time: July 2026 → "2026-07" */
export function monthKeyOf(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Every month key from `first` to `last` inclusive, e.g. "2026-07".."2026-09" */
function monthKeysBetween(first: string, last: string): string[] {
  const out: string[] = [];
  let [y, m] = first.split("-").map(Number);
  for (let key = first; key <= last; ) {
    out.push(key);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
    key = `${y}-${String(m).padStart(2, "0")}`;
  }
  return out;
}

/**
 * Replay calendar months [first tx month .. lastMonth] in order through the
 * month-packing chain (monthBucketStates -> nextOpeningBalances).
 *
 * Months with no transactions are replayed too (zero income, zero spend), so
 * carry-over buckets keep their balance and monthly-reset buckets reset —
 * exactly what would have happened had the app packed each month live.
 */
function replayMonths(
  txs: MoneyTx[],
  plan: BudgetPlan,
  base: string,
  fx: Record<string, number>,
  lastMonth: string,
  initialOpenings: Record<string, number> = {}
): { states: MonthBucketState[] | null; openings: Record<string, number> } {
  const byMonth = new Map<string, MoneyTx[]>();
  for (const t of txs) {
    const key = monthKeyOf(t.date);
    if (key > lastMonth) continue;
    const list = byMonth.get(key) ?? [];
    list.push(t);
    byMonth.set(key, list);
  }
  const keys = [...byMonth.keys()].sort();
  if (keys.length === 0) return { states: null, openings: { ...initialOpenings } };

  let openings = { ...initialOpenings };
  let states: MonthBucketState[] | null = null;
  for (const key of monthKeysBetween(keys[0], lastMonth)) {
    const monthTxs = byMonth.get(key) ?? [];
    const income = sumIncome(monthTxs, base, fx);
    const spent = spentByBucket(monthTxs, base, fx);
    states = monthBucketStates(income, plan, spent, openings);
    openings = nextOpeningBalances(states);
  }
  return { states, openings };
}

/**
 * Opening balances a month SHOULD start with, derived from history.
 *
 * Replays every month before `month` (transactions + current plan + FX) and
 * returns the carry-over that opens `month`. This is the authoritative value
 * behind BudgetPlan.openingBalancesJson: the DB copy is only a cache of this
 * result, so it can be recomputed whenever the plan or past transactions
 * change, without touching any transaction.
 */
export function openingBalancesForMonth(
  txs: MoneyTx[],
  plan: BudgetPlan | null,
  base: string,
  fx: Record<string, number>,
  month: Date = new Date()
): Record<string, number> {
  if (!plan) return {};
  const prev = new Date(month.getFullYear(), month.getMonth() - 1, 1);
  return replayMonths(txs, plan, base, fx, monthKeyOf(prev)).openings;
}

/**
 * Per-bucket state as of `now`, after replaying the entire transaction history.
 *
 * The DB stores no per-month bucket snapshots: month packing keeps only the
 * CURRENT accumulated carry-over (BudgetPlan.openingBalancesJson) plus the last
 * packed month key. So the authoritative way to reconstruct bucket state is to
 * replay every calendar month — from the first month with transactions up to
 * and including the current month — through the SAME chain the packer uses
 * (monthBucketStates -> nextOpeningBalances).
 *
 * TOTAL scope = the reconstructed MonthBucketState for the current month:
 *   opening   = carry-over that opened this month
 *   allocated = this month's waterfall allocation (0 if no income yet)
 *   spent     = this month's spending in that bucket
 *   closing   = opening + allocated - spent (what is available now)
 *   carryOver = whether the bucket carries over by plan rule
 *
 * Replaying up to the current month (not just the last month that happened to
 * have transactions) matters: with no activity this month, a carry-over bucket
 * must show last month's closing as available (₦1,000 of ₦1,000), and a
 * monthly-reset bucket must show 0 rather than last month's leftover.
 *
 * Note: plan rules are not versioned per month, so reconstruction uses the
 * current plan for every month — the same plan the packer reconciles with.
 */
export function allTimeBucketStates(
  txs: MoneyTx[],
  plan: BudgetPlan | null,
  base: string,
  fx: Record<string, number>,
  initialOpenings: Record<string, number> = {},
  now: Date = new Date()
): MonthBucketState[] {
  if (!plan) return [];

  // Future-dated transactions extend the replay past the current month.
  let lastMonth = monthKeyOf(now);
  for (const t of txs) {
    const key = monthKeyOf(t.date);
    if (key > lastMonth) lastMonth = key;
  }

  const { states } = replayMonths(txs, plan, base, fx, lastMonth, initialOpenings);
  if (!states) {
    // No history yet -> every bucket is empty (matching THIS MONTH semantics
    // for a user with no activity).
    return plan.buckets.map((b) => ({
      bucketId: b.id,
      opening: 0,
      allocated: 0,
      spent: 0,
      closing: 0,
      carryOver: b.carryOver,
    }));
  }
  return states;
}

/** True when two opening-balance maps hold the same amounts (missing = 0). */
export function sameOpeningBalances(
  a: Record<string, number>,
  b: Record<string, number>,
  tolerance = 0.005
): boolean {
  const ids = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const id of ids) {
    if (Math.abs((a[id] || 0) - (b[id] || 0)) > tolerance) return false;
  }
  return true;
}

/**
 * Full month picture: waterfall from actual income + opening carry-over + spent.
 */
export function monthSnapshot(
  plan: BudgetPlan | null,
  monthTxs: MoneyTx[],
  base: string,
  fx: Record<string, number>,
  openingBalances: Record<string, number> = {}
): {
  income: number;
  expenses: number;
  net: number;
  waterfall: ReturnType<typeof allocateWaterfall> | null;
  buckets: MonthBucketState[];
} {
  const income = sumIncome(monthTxs, base, fx);
  const expenses = sumExpenses(monthTxs, base, fx);
  if (!plan) {
    return {
      income,
      expenses,
      net: income - expenses,
      waterfall: null,
      buckets: [],
    };
  }
  const waterfall = allocateWaterfall(income, plan);
  const spent = spentByBucket(monthTxs, base, fx);
  const buckets = monthBucketStates(income, plan, spent, openingBalances);
  return {
    income,
    expenses,
    net: income - expenses,
    waterfall,
    buckets,
  };
}

/**
 * Check remaining balance before saving an expense.
 * Hard-block when amount exceeds remaining (or bucket is empty).
 */
export function expenseFriction(opts: {
  amountBase: number;
  bucketId: string;
  plan: BudgetPlan | null;
  monthTxs: MoneyTx[];
  base: string;
  fx: Record<string, number>;
  openingBalances?: Record<string, number>;
}): {
  remaining: number;
  allocated: number;
  spent: number;
  overBy: number;
  /** true if this spend would exceed what's left in the bucket */
  wouldOverspend: boolean;
  /** true if bucket has no allocation yet (no income / no plan) */
  emptyBucket: boolean;
  /** true when save must be rejected (empty or would overspend) */
  blocked: boolean;
  message: string;
} {
  const {
    amountBase,
    bucketId,
    plan,
    monthTxs,
    base,
    fx,
    openingBalances = {},
  } = opts;

  if (!plan) {
    return {
      remaining: 0,
      allocated: 0,
      spent: 0,
      overBy: amountBase,
      wouldOverspend: false,
      emptyBucket: true,
      blocked: false,
      message:
        "No budget plan yet. Expense can still log. Set a plan in Settings when ready.",
    };
  }

  const snap = monthSnapshot(plan, monthTxs, base, fx, openingBalances);
  const row = snap.buckets.find((b) => b.bucketId === bucketId);
  const remaining = row ? row.closing : 0;
  const allocated = row ? row.opening + row.allocated : 0;
  const spent = row?.spent || 0;
  const emptyBucket = remaining <= 0;
  const wouldOverspend = amountBase > remaining + 1e-9;
  const overBy = wouldOverspend ? amountBase - remaining : 0;
  const blocked = emptyBucket || wouldOverspend;

  let message = "";
  if (emptyBucket) {
    message = `This bucket has no remaining balance this month. Log income first or choose another bucket.`;
  } else if (wouldOverspend) {
    message = `Blocked: amount exceeds remaining balance. You need more than ${remaining.toFixed(0)} left in this bucket.`;
  } else {
    message = "Within plan for this bucket.";
  }

  return {
    remaining,
    allocated,
    spent,
    overBy,
    wouldOverspend,
    emptyBucket,
    blocked,
    message,
  };
}
