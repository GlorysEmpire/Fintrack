/**
 * Money helpers used by the web API when turning DB rows into dashboard numbers.
 * Keep pure (no Prisma / no React) so mobile can reuse later.
 */
import type { BudgetPlan } from "./types";
import type { CurrencyCode } from "./fx";
import { toBase } from "./fx";
import { allocateWaterfall } from "./waterfall";
import { monthBucketStates, type MonthBucketState } from "./carryover";

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
 * Soft-friction check before saving an expense.
 * We NEVER hard-block — we return warnings so the UI can require a reason + confirm.
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
      wouldOverspend: true,
      emptyBucket: true,
      message:
        "No budget plan yet. You can still log this — set a plan in Settings when ready.",
    };
  }

  const snap = monthSnapshot(plan, monthTxs, base, fx, openingBalances);
  const row = snap.buckets.find((b) => b.bucketId === bucketId);
  const remaining = row ? row.closing : 0;
  const allocated = row ? row.opening + row.allocated : 0;
  const spent = row?.spent || 0;
  const emptyBucket = allocated <= 0 && remaining <= 0;
  const wouldOverspend = amountBase > remaining;
  const overBy = wouldOverspend ? amountBase - remaining : 0;

  let message = "";
  if (emptyBucket) {
    message =
      "This bucket has no balance this month (log income first, or confirm you still want to spend).";
  } else if (wouldOverspend) {
    message = `This is ${overBy.toFixed(0)} over what's left in this bucket. Your money — but pause and name the reason.`;
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
    message,
  };
}
