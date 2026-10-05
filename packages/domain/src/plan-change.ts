/**
 * PLAN CHANGE IMPACT — what a plan change does to the numbers a user sees.
 *
 * FinTrack keeps no per-month snapshots and (for the MVP) no plan versions:
 * history is rebuilt from transactions using the CURRENT plan. So changing how
 * income is split or carried over recalculates every past month. That is by
 * design, but it must never happen silently. This file works out the
 * before/after so the user can be shown the consequence and asked to confirm.
 *
 * Nothing here writes anything. Transactions are only read.
 */
import type { BudgetPlan } from "./types";
import type { CurrencyCode } from "./fx";
import {
  MONEY_EPSILON,
  allTimeBucketStates,
  monthKeyOf,
  type MoneyTx,
} from "./money";
import {
  activeBuckets,
  describePlanChanges,
  planRulesChanged,
  sortBucketsByPlanOrder,
} from "./plan";

export interface BucketBalanceChange {
  bucketId: string;
  name: string;
  emoji: string;
  /** What the bucket holds today under the current plan (null: not an active bucket there) */
  before: number | null;
  /** What it would hold today under the new plan (null: archived or removed) */
  after: number | null;
}

export interface PlanChangeImpact {
  /** true when the split / carry-over rules differ (a rename is not a rule change) */
  rulesChanged: boolean;
  /** Transactions that will be recalculated under the new plan */
  transactionCount: number;
  /** Calendar months that contain those transactions */
  monthsAffected: number;
  /** Plain sentences: what is different in the plan itself */
  changes: string[];
  /** What each bucket holds today, before and after */
  buckets: BucketBalanceChange[];
}

export function planChangeImpact(opts: {
  txs: MoneyTx[];
  before: BudgetPlan;
  after: BudgetPlan;
  base: string;
  fx: Record<string, number>;
  now?: Date;
}): PlanChangeImpact {
  const { txs, before, after, base, fx } = opts;
  const now = opts.now ?? new Date();

  const closingById = (plan: BudgetPlan) =>
    new Map(
      allTimeBucketStates(txs, plan, base, fx, {}, now).map((s) => [
        s.bucketId,
        s.closing,
      ])
    );
  const beforeClosing = closingById(before);
  const afterClosing = closingById(after);

  const afterActive = sortBucketsByPlanOrder(activeBuckets(after.buckets));
  const afterIds = new Set(afterActive.map((b) => b.id));
  // New plan's buckets first, then buckets that stop being active
  const rows = [
    ...afterActive,
    ...sortBucketsByPlanOrder(activeBuckets(before.buckets)).filter(
      (b) => !afterIds.has(b.id)
    ),
  ];

  return {
    rulesChanged: planRulesChanged(before, after),
    transactionCount: txs.length,
    monthsAffected: new Set(txs.map((t) => monthKeyOf(t.date))).size,
    changes: describePlanChanges(before, after, base as CurrencyCode),
    buckets: rows.map((b) => ({
      bucketId: b.id,
      name: b.name,
      emoji: b.emoji,
      before: beforeClosing.has(b.id) ? (beforeClosing.get(b.id) as number) : null,
      after: afterClosing.has(b.id) ? (afterClosing.get(b.id) as number) : null,
    })),
  };
}

/** True when a bucket's balance today is different after the change. */
export function balanceChanged(change: BucketBalanceChange): boolean {
  if (change.before === null || change.after === null) {
    return change.before !== change.after;
  }
  return Math.abs(change.before - change.after) > MONEY_EPSILON;
}
