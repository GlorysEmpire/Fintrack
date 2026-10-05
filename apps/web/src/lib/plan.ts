/**
 * Budget plan persistence — bridges the DB (Prisma) and domain math (@fintrack/domain).
 *
 * Plans are stored as JSON for buckets so we can evolve the shape without
 * a rigid column per bucket field. Domain package owns the pure logic;
 * this file only loads and saves.
 *
 * A saved plan is the user's own configuration. It is copied from a template
 * once, when the user chooses that template; a later change to a template in
 * code never reaches a plan that is already saved.
 */
import type { BucketUsage, BudgetPlan, PlanBucket } from "@fintrack/domain";
import {
  bucketUsageCount,
  finalizePlanBuckets,
  normalizePlanBuckets,
  planFromTemplate,
  validatePlan,
} from "@fintrack/domain";
import { prisma } from "./db";

/** Turn a Prisma BudgetPlan row into a domain BudgetPlan object */
export function parsePlan(row: {
  id: string;
  name: string;
  templateId: string | null;
  emergencyCarryOverDefault: boolean;
  bucketsJson: string;
}): BudgetPlan {
  let raw: unknown = [];
  try {
    raw = JSON.parse(row.bucketsJson);
  } catch {
    raw = [];
  }
  return {
    id: row.id,
    name: row.name,
    templateId: row.templateId || undefined,
    emergencyCarryOverDefault: row.emergencyCarryOverDefault,
    // Read defensively: older rows may lack `layer` (see normalizePlanBuckets)
    buckets: normalizePlanBuckets(raw),
  };
}

export async function getUserPlan(userId: string): Promise<BudgetPlan | null> {
  const row = await prisma.budgetPlan.findUnique({ where: { userId } });
  if (!row) return null;
  return parsePlan(row);
}

/**
 * How many of the user's transactions and recurring rules point at each bucket.
 * A bucket with any may be archived but not removed.
 */
export async function getBucketUsage(userId: string): Promise<BucketUsage> {
  const [transactions, rules] = await Promise.all([
    prisma.transaction.groupBy({
      by: ["bucketId"],
      where: { userId, bucketId: { not: null } },
      _count: { _all: true },
    }),
    prisma.recurringRule.groupBy({
      by: ["bucketId"],
      where: { userId, bucketId: { not: null } },
      _count: { _all: true },
    }),
  ]);
  const usage: BucketUsage = {};
  for (const group of [...transactions, ...rules]) {
    const id = group.bucketId;
    if (!id || id === "__proto__") continue;
    usage[id] = bucketUsageCount(usage, id) + group._count._all;
  }
  return usage;
}

/**
 * The single place a plan is written. Callers have already validated it.
 *
 * Only the plan itself is written. The cached opening balances are left alone:
 * they are derived, and ensureMonthPacked() rebuilds them from history.
 * No transaction is ever touched here.
 */
export async function writePlan(
  userId: string,
  data: { name: string; templateId: string | null; buckets: PlanBucket[] }
) {
  const bucketsJson = JSON.stringify(finalizePlanBuckets(data.buckets));
  return prisma.budgetPlan.upsert({
    where: { userId },
    create: {
      userId,
      name: data.name,
      templateId: data.templateId,
      bucketsJson,
    },
    update: {
      name: data.name,
      templateId: data.templateId,
      bucketsJson,
    },
  });
}

/**
 * Create the user's FIRST plan as a copy of a named template
 * (tithe_first, pay_yourself_first, 50_30_20, …). Used by onboarding only;
 * changing an existing plan goes through proposePlanChange().
 */
export async function savePlanFromTemplate(userId: string, templateId: string) {
  const plan = planFromTemplate(templateId, "tmp");
  if (!plan) throw new Error("Unknown template");
  if (!validatePlan(plan).ok) throw new Error("Template is not a valid plan");

  return writePlan(userId, {
    name: plan.name,
    templateId: plan.templateId ?? null,
    buckets: plan.buckets,
  });
}
