/**
 * Changing a saved plan — the only way an existing plan is modified.
 *
 * FinTrack rebuilds history with the current plan (plan versions are post-MVP),
 * so a change to how income is split or carried over recalculates every past
 * month. That is allowed, but never silently:
 *
 *   1. An invalid plan is never saved.
 *   2. A bucket that history depends on can be archived, not removed.
 *   3. A change that recalculates history is NOT saved until the caller sends
 *      confirmHistoryChange: true. Without it the caller gets the before/after
 *      so the user can be shown the consequence first.
 *
 * Transactions are only read here, never written.
 */
import {
  checkBucketRemovals,
  finalizePlanBuckets,
  getTemplate,
  planChangeImpact,
  planRulesChanged,
  validatePlan,
  type BudgetPlan,
  type MoneyTx,
  type PlanBucket,
  type PlanChangeImpact,
  type PlanIssue,
} from "@fintrack/domain";
import { prisma } from "./db";
import { parseFx } from "./money";
import { ensureMonthPacked } from "./month-close";
import { getBucketUsage, parsePlan, writePlan } from "./plan";

export type PlanChangeResult =
  | { status: "saved"; plan: BudgetPlan; warnings: string[] }
  | { status: "invalid"; errors: string[]; issues: PlanIssue[] }
  | {
      status: "needs_confirmation";
      impact: PlanChangeImpact;
      warnings: string[];
    };

export async function proposePlanChange(
  user: { id: string; baseCurrency: string; fxRates: string; onboarding: string },
  input: {
    name: string;
    buckets: PlanBucket[];
    templateId?: string | null;
    confirmHistoryChange?: boolean;
  },
  now: Date = new Date()
): Promise<PlanChangeResult> {
  const name = input.name.trim();
  const buckets = finalizePlanBuckets(input.buckets);

  // 1. Invalid plans are never saved
  const check = validatePlan({ name, buckets });
  if (!check.ok) {
    return {
      status: "invalid",
      errors: check.errors,
      issues: check.issues.filter((i) => i.level === "error"),
    };
  }

  const [currentRow, usage] = await Promise.all([
    prisma.budgetPlan.findUnique({ where: { userId: user.id } }),
    getBucketUsage(user.id),
  ]);
  const current = currentRow ? parsePlan(currentRow) : null;

  // 2. Buckets with history are archived, not erased
  const removals = checkBucketRemovals(current, { buckets }, usage);
  if (!removals.ok) {
    return {
      status: "invalid",
      errors: removals.errors,
      issues: removals.blocked.map((b, i) => ({
        level: "error" as const,
        code: "bucket_has_history",
        message: removals.errors[i],
        bucketId: b.bucketId,
      })),
    };
  }

  // 3. A change that recalculates history needs an explicit yes
  if (current && planRulesChanged(current, { buckets })) {
    const rows = await prisma.transaction.findMany({
      where: { userId: user.id },
      select: {
        type: true,
        amount: true,
        currency: true,
        bucketId: true,
        sourceId: true,
        date: true,
      },
    });
    if (rows.length > 0 && !input.confirmHistoryChange) {
      const txs: MoneyTx[] = rows.map((t) => ({
        type: t.type as "i" | "e",
        amount: t.amount,
        currency: t.currency,
        bucketId: t.bucketId,
        sourceId: t.sourceId,
        date: t.date,
      }));
      return {
        status: "needs_confirmation",
        warnings: check.warnings,
        impact: planChangeImpact({
          txs,
          before: current,
          after: { ...current, name, buckets },
          base: user.baseCurrency,
          fx: parseFx(user.fxRates),
          now,
        }),
      };
    }
  }

  const templateId =
    input.templateId && getTemplate(input.templateId) ? input.templateId : null;
  const row = await writePlan(user.id, { name, templateId, buckets });

  if (user.onboarding !== "completed") {
    await prisma.user.update({
      where: { id: user.id },
      data: { onboarding: "completed" },
    });
  }

  // The stored opening balances are a cache of history under the OLD plan.
  // Rebuild them now so no screen reads stale numbers after the change.
  await ensureMonthPacked(user.id, now);

  return { status: "saved", plan: parsePlan(row), warnings: check.warnings };
}
