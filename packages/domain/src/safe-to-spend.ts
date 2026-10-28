/**
 * "Safe to spend": what the user can spend today without touching the rest of
 * their plan. Spend is the free-choice bucket (any category except the tithe
 * payment), and every other bucket is already set aside for its purpose, so
 * the answer is what is left in Spend this month. It is a view of a bucket
 * balance, never a new balance: it can not be negative and it never counts
 * money from another bucket.
 */
import type { MonthBucketState } from "./carryover";

export const SPEND_BUCKET_ID = "spend";

export interface SafeToSpend {
  /** The plan has a Spend bucket this month. When false the numbers below are all 0. */
  hasSpendBucket: boolean;
  /** Left in Spend right now, never below zero */
  amount: number;
  /** What Spend held this month before any spending: opening + allocated + moved */
  total: number;
  /** amount / total, from 0 to 1 (0 when Spend holds nothing) */
  fraction: number;
  /** amount spread over the days left this month, including today (0 when none left) */
  perDay: number;
}

export function safeToSpend(buckets: MonthBucketState[], daysLeft: number): SafeToSpend {
  const spend = buckets.find((b) => b.bucketId === SPEND_BUCKET_ID);
  if (!spend) return { hasSpendBucket: false, amount: 0, total: 0, fraction: 0, perDay: 0 };
  const amount = Math.max(0, spend.closing);
  const total = Math.max(amount, spend.opening + spend.allocated + spend.moved);
  return {
    hasSpendBucket: true,
    amount,
    total,
    fraction: total > 0 ? Math.min(1, amount / total) : 0,
    perDay: daysLeft > 0 ? amount / daysLeft : 0,
  };
}
