/**
 * Domain types — shared shapes for budget plans.
 * No React, no database: pure data so web + future mobile use the same rules.
 */

/**
 * How a bucket takes money from income in an ordered plan.
 *
 * - of_gross: take percent of original gross, then continue with less remaining
 * - of_remaining: take percent of current remaining, then continue
 * - share_remainder: consecutive buckets with this mode split the *same*
 *   leftover pot by their percent weights (e.g. 40/10/40/10)
 */
export type AllocationMode = "of_gross" | "of_remaining" | "share_remainder";
/** The layer to which a bucket belongs in the waterfall (e.g., mandatory, off_the_top, life_plan) */
export type WaterfallLayer = "mandatory" | "off_the_top" | "life_plan";
/** One envelope in the user's budget (Tithe, Emergency, Spend, …) */
export interface PlanBucket {
  /**
   * Stable identity. Transactions point at this id, so it never changes once
   * the bucket exists: renaming a bucket changes `name` only.
   */
  id: string;
  name: string;
  emoji: string;
  /** 0–100. Not used when `fixed` is set. */
  percent: number;
  /**
   * Fixed amount in the user's base currency. Filled once per month, in bucket
   * order, from whatever income is left at that point (never more than is left).
   */
  fixed?: number;
  mode: AllocationMode;
  /** If true, unused balance rolls into next month */
  carryOver: boolean;
  order: number;
  layer: WaterfallLayer;
  /**
   * Archived buckets keep their identity so past transactions stay labelled,
   * but they receive no income and cannot be spent from. Archiving is how a
   * bucket with history is retired without erasing that history.
   */
  archived?: boolean;
}

/** A full customizable budget plan owned by one user */
export interface BudgetPlan {
  id: string;
  name: string;
  /** e.g. "tithe_first" if created from a template */
  templateId?: string;
  buckets: PlanBucket[];
  /**
   * Legacy flag kept for stored plans. Carry-over is decided per bucket
   * (PlanBucket.carryOver); nothing uses this to change a bucket.
   */
  emergencyCarryOverDefault: boolean;
}

/** One line of a waterfall result (what a bucket got from this income) */
export interface WaterfallLine {
  bucketId: string;
  name: string;
  emoji: string;
  allocated: number;
  percentOfGross: number;
  mode: AllocationMode;
  carryOver: boolean;
}

export interface WaterfallResult {
  gross: number;
  lines: WaterfallLine[];
  allocatedTotal: number;
  unallocated: number;
}

/** Starter plan users can pick at onboarding */
export interface PlanTemplate {
  id: string;
  name: string;
  description: string;
  plan: Omit<BudgetPlan, "id">;
}
