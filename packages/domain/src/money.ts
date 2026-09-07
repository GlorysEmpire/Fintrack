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

/**
 * Final per-bucket state after replaying the entire transaction history.
 *
 * The DB stores no per-month bucket snapshots: month packing keeps only the
 * CURRENT accumulated carry-over (BudgetPlan.openingBalancesJson) plus the last
 * packed month key. So the authoritative way to reconstruct historical bucket
 * state is to replay every calendar month that has transactions through the SAME
 * chain the packer uses (monthBucketStates -> nextOpeningBalances), carrying
 * positive closings forward exactly as ensureMonthPacked does.
 *
 * TOTAL scope = the final reconstructed MonthBucketState for each bucket after
 * the latest historical month:
 *   opening  = opening balance used in the latest month the bucket was active
 *   allocated = latest month's waterfall allocation
 *   spent     = latest month's spending in that bucket
 *   closing   = opening + allocated - spent (final balance after latest month)
 *   carryOver = whether the bucket carries over by plan rule
 *
 * This is the functional counterpart to THIS MONTH's snapshot.buckets, which
 * is the current month's MonthBucketState. The dashboard UI renders both with
 * the same formula: alloc = opening + allocated, available = closing.
 *
 * For carry-over buckets, the latest month already received the right opening
 * because nextOpeningBalances feeds the following month's opening. So the final
 * state already includes the full carry-over chain for all but the absolute
 * latest month, and the absolute latest month opens from that chain.
 *
 * For monthly-reset buckets, opening is always 0 in every month, so the final
 * state is simply the latest month's allocation - spending (the reset is by
 * design; TOTAL does not resurrect old allocation that the plan resets).
 *
 * Note: plan rules are not versioned per month, so reconstruction uses the
 * current plan for every month — the packer itself reads the current plan on
 * each run, so this matches how the app already packs.
 */
export function allTimeBucketStates(
  txs: MoneyTx[],
  plan: BudgetPlan | null,
  base: string,
  fx: Record<string, number>,
  initialOpenings: Record<string, number> = {}
): MonthBucketState[] {
  if (!plan) return [];

  // Group by calendar month (local time), ascending.
  const byMonth = new Map<string, MoneyTx[]>();
  for (const t of txs) {
    const d = typeof t.date === "string" ? new Date(t.date) : t.date;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const list = byMonth.get(key) ?? [];
    list.push(t);
    byMonth.set(key, list);
  }
  const monthKeys = [...byMonth.keys()].sort();

  if (monthKeys.length === 0) {
    // No history yet -> final state is empty for every bucket (matching THIS
    // MONTH semantics for a user with no current-month activity).
    return plan.buckets.map((b) => ({
      bucketId: b.id,
      opening: 0,
      allocated: 0,
      spent: 0,
      closing: 0,
      carryOver: b.carryOver,
    }));
  }

  let opening = { ...initialOpenings };
  let latestStates: MonthBucketState[] = [];
  for (const key of monthKeys) {
    const monthTxs = byMonth.get(key)!;
    const income = sumIncome(monthTxs, base, fx);
    const spent = spentByBucket(monthTxs, base, fx);
    latestStates = monthBucketStates(income, plan, spent, opening);
    opening = nextOpeningBalances(latestStates);
  }

  return latestStates;
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
