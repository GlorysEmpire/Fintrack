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

/** One envelope in the user's budget (Tithe, Emergency, Spend, …) */
export interface PlanBucket {
  id: string;
  name: string;
  emoji: string;
  /** 0–100 */
  percent: number;
  mode: AllocationMode;
  /** If true, unused balance rolls into next month */
  carryOver: boolean;
  order: number;
}

/** A full customizable budget plan owned by one user */
export interface BudgetPlan {
  id: string;
  name: string;
  /** e.g. "tithe_first" if created from a template */
  templateId?: string;
  buckets: PlanBucket[];
  /** Product default for emergency-style buckets (Settings toggle) */
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
