/**
 * MONTHLY CARRY-OVER
 *
 * Some buckets (especially Emergency) should build up over time instead of
 * resetting to ₦0 every month.
 *
 * - carryOver: true  → leftover closing balance becomes next month's opening
 * - carryOver: false → month starts fresh; only that month's allocation counts
 *
 * Default product rule: Emergency carry-over is ON; user can turn it off
 * in Settings with plain-language copy (see emergencyCarryOverCopy).
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

/** From this month's closing balances, what opens next month? */
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

/**
 * Apply the Settings toggle for emergency carry-over.
 * Updates any bucket whose id/name looks like "emergency".
 */
export function applyEmergencyCarryOverSetting(
  plan: BudgetPlan,
  enabled: boolean
): BudgetPlan {
  return {
    ...plan,
    emergencyCarryOverDefault: enabled,
    buckets: plan.buckets.map((b) => {
      const isEmergency =
        b.id === "emergency" || b.name.toLowerCase().includes("emergency");
      if (isEmergency) {
        return { ...b, carryOver: enabled };
      }
      return b;
    }),
  };
}

/** Plain-English text for the Settings UI toggle */
export function emergencyCarryOverCopy(enabled: boolean): {
  title: string;
  body: string;
  example: string;
} {
  if (enabled) {
    return {
      title: "Carry over emergency balance (recommended)",
      body: "Money left in Emergency at month end stays there and adds to next month. Best for building a real safety reserve over time.",
      example:
        "Example: You allocated ₦90,000 and spent ₦10,000. Next month starts with ₦80,000 already in Emergency, plus that month’s new allocation.",
    };
  }
  return {
    title: "Reset emergency each month",
    body: "Emergency bucket restarts from zero each month based only on that month’s income split. Use this if you want a fresh monthly envelope.",
    example:
      "Example: Leftover emergency money does not roll forward. Each month only gets what that month’s plan allocates.",
  };
}
