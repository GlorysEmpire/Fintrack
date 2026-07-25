/**
 * Project next 1–3 months of bucket totals using waterfall allocation
 * on expected gross (history average + optional recurring income).
 *
 * Pure domain — no Prisma / React.
 */
import type { BudgetPlan, WaterfallLine, WaterfallResult } from "./types";
import { allocateWaterfall } from "./waterfall";
import type { MoneyTx } from "./money";
import { amountInBase } from "./money";
export type RecurringCadence = "daily" | "weekly" | "monthly";

/** Minimal recurring rule shape for projection (income-like additions). */
export interface ForecastRecurringRule {
  amount: number;
  currency: string;
  /** Only income-style rules boost projected gross */
  type?: "i" | "e";
  cadence: RecurringCadence;
  active?: boolean;
}

export interface ForecastMonth {
  /** 0 = next month, 1 = month after, … */
  offset: number;
  expectedGross: number;
  waterfall: WaterfallResult;
}

export interface ForecastResult {
  months: ForecastMonth[];
  baselineGross: number;
}

function monthsInCadence(cadence: RecurringCadence): number {
  if (cadence === "daily") return 30;
  if (cadence === "weekly") return 4;
  return 1;
}

/**
 * Average monthly income from history (base currency), plus monthlyized
 * active recurring income rules.
 */
export function expectedMonthlyGross(opts: {
  history: MoneyTx[];
  base: string;
  fx: Record<string, number>;
  recurring?: ForecastRecurringRule[];
  /** How many calendar months of history to average (default 3) */
  lookbackMonths?: number;
}): number {
  const lookback = opts.lookbackMonths ?? 3;
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - lookback, 1);
  const incomes = opts.history.filter((t) => {
    if (t.type !== "i") return false;
    const d = typeof t.date === "string" ? new Date(t.date) : t.date;
    return d >= start;
  });

  let sum = 0;
  for (const t of incomes) {
    sum += amountInBase(t.amount, t.currency, opts.base, opts.fx);
  }
  const avg = lookback > 0 ? sum / lookback : 0;

  let recurringMonthly = 0;
  for (const r of opts.recurring || []) {
    if (r.active === false) continue;
    if (r.type === "e") continue;
    const baseAmt = amountInBase(r.amount, r.currency, opts.base, opts.fx);
    recurringMonthly += baseAmt * monthsInCadence(r.cadence);
  }

  // Prefer history average; if no history, fall back to recurring only
  return avg > 0 ? avg + recurringMonthly : recurringMonthly;
}

/**
 * Project waterfall allocation for the next `monthsAhead` months (1–3).
 */
export function forecast(
  plan: Pick<BudgetPlan, "buckets"> | null,
  history: MoneyTx[],
  monthsAhead: number,
  opts: {
    base: string;
    fx: Record<string, number>;
    recurring?: ForecastRecurringRule[];
  }
): ForecastResult {
  const n = Math.max(1, Math.min(3, Math.floor(monthsAhead) || 1));
  const baselineGross = expectedMonthlyGross({
    history,
    base: opts.base,
    fx: opts.fx,
    recurring: opts.recurring,
  });

  if (!plan || plan.buckets.length === 0) {
    return {
      baselineGross,
      months: Array.from({ length: n }, (_, offset) => ({
        offset,
        expectedGross: baselineGross,
        waterfall: {
          gross: baselineGross,
          lines: [] as WaterfallLine[],
          allocatedTotal: 0,
          unallocated: baselineGross,
        },
      })),
    };
  }

  const months: ForecastMonth[] = [];
  for (let offset = 0; offset < n; offset++) {
    const waterfall = allocateWaterfall(baselineGross, plan);
    months.push({
      offset,
      expectedGross: baselineGross,
      waterfall,
    });
  }

  return { months, baselineGross };
}
