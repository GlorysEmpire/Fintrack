/**
 * MONTHLY CARRY-OVER
 *
 * Some buckets (Emergency, Tithe, Save…) should build up over time instead of
 * resetting to ₦0 every month.
 *
 * - carryOver: true  → leftover closing balance becomes next month's opening
 * - carryOver: false → month starts fresh; only that month's allocation counts
 *
 * Carry-over is an ordinary per-bucket rule in the plan. The plain-language
 * text for it lives in plan.ts (carryOverCopy).
 */
import type { BudgetPlan } from "./types";
import { allocateWaterfall } from "./waterfall";

export interface MonthBucketState {
  bucketId: string;
  /** Money rolled in from last month (0 if carry-over off) */
  opening: number;
  /** This month's waterfall allocation from logged income */
  allocated: number;
  /** Expenses drawn from this bucket this month */
  spent: number;
  /** opening + allocated - spent */
  closing: number;
  carryOver: boolean;
}

/**
 * Build per-bucket numbers for one calendar month.
 * openingBalances: map of leftover from previous month (only used if carryOver).
 */
export function monthBucketStates(
  grossIncome: number,
  plan: BudgetPlan,
  spentByBucket: Record<string, number>,
  openingBalances: Record<string, number> = {}
): MonthBucketState[] {
  const w = allocateWaterfall(grossIncome, plan);
  return w.lines.map((line) => {
    const opening = line.carryOver ? openingBalances[line.bucketId] || 0 : 0;
    const spent = spentByBucket[line.bucketId] || 0;
    const closing = opening + line.allocated - spent;
    return {
      bucketId: line.bucketId,
      opening,
      allocated: line.allocated,
      spent,
      closing,
      carryOver: line.carryOver,
    };
  });
}

/**
 * From this month's closing balances, what opens next month?
 *
 * Only money that is left carries over. A bucket that ends the month below zero
 * opens the next month at zero: the shortfall is not carried forward.
 *
 * A new expense is never accepted past a bucket's balance (expenseFriction), so
 * a bucket can only end a month below zero when history is recalculated, for
 * example after a plan change or a corrected income.
 */
export function nextOpeningBalances(
  states: MonthBucketState[]
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const s of states) {
    if (s.carryOver && s.closing > 0) {
      out[s.bucketId] = s.closing;
    }
  }
  return out;
}
