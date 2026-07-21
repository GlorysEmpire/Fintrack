/**
 * Budget plan persistence — bridges the DB (Prisma) and domain math (@fintrack/domain).
 *
 * Plans are stored as JSON for buckets so we can evolve the shape without
 * a rigid column per bucket field. Domain package owns the pure logic;
 * this file only loads/saves and applies settings like emergency carry-over.
 */
import type { BudgetPlan, PlanBucket } from "@fintrack/domain";
import {
  applyEmergencyCarryOverSetting,
  planFromTemplate,
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
  const buckets = JSON.parse(row.bucketsJson) as PlanBucket[];
  return {
    id: row.id,
    name: row.name,
    templateId: row.templateId || undefined,
    emergencyCarryOverDefault: row.emergencyCarryOverDefault,
    buckets,
  };
}

export async function getUserPlan(userId: string): Promise<BudgetPlan | null> {
  const row = await prisma.budgetPlan.findUnique({ where: { userId } });
  if (!row) return null;
  return parsePlan(row);
}

/**
 * Create/replace the user's plan from a named template
 * (tithe_first, pay_yourself_first, 50_30_20, …).
 * Emergency carry-over is ON by default.
 */
export async function savePlanFromTemplate(
  userId: string,
  templateId: string
) {
  const plan = planFromTemplate(templateId, `tmp`);
  if (!plan) throw new Error("Unknown template");

  const withCarry = applyEmergencyCarryOverSetting(plan, true);

  return prisma.budgetPlan.upsert({
    where: { userId },
    create: {
      userId,
      name: withCarry.name,
      templateId: withCarry.templateId,
      emergencyCarryOverDefault: true,
      bucketsJson: JSON.stringify(withCarry.buckets),
    },
    update: {
      name: withCarry.name,
      templateId: withCarry.templateId,
      emergencyCarryOverDefault: true,
      bucketsJson: JSON.stringify(withCarry.buckets),
    },
  });
}

/** Save a fully custom plan (API / future bucket editor) */
export async function saveCustomPlan(
  userId: string,
  data: {
    name: string;
    buckets: PlanBucket[];
    emergencyCarryOverDefault?: boolean;
    templateId?: string | null;
  }
) {
  const emergencyCarryOverDefault = data.emergencyCarryOverDefault ?? true;
  let buckets = data.buckets;
  const planLike = {
    id: "x",
    name: data.name,
    buckets,
    emergencyCarryOverDefault,
  };
  // Keep emergency bucket flag in sync with the global setting
  buckets = applyEmergencyCarryOverSetting(
    planLike,
    emergencyCarryOverDefault
  ).buckets;

  return prisma.budgetPlan.upsert({
    where: { userId },
    create: {
      userId,
      name: data.name,
      templateId: data.templateId ?? null,
      emergencyCarryOverDefault,
      bucketsJson: JSON.stringify(buckets),
    },
    update: {
      name: data.name,
      templateId: data.templateId ?? null,
      emergencyCarryOverDefault,
      bucketsJson: JSON.stringify(buckets),
    },
  });
}

/**
 * Settings toggle: should leftover Emergency money roll into next month?
 * Updates both the boolean flag and the emergency bucket's carryOver field.
 */
export async function setEmergencyCarryOver(userId: string, enabled: boolean) {
  const row = await prisma.budgetPlan.findUnique({ where: { userId } });
  if (!row) return null;
  const plan = parsePlan(row);
  const updated = applyEmergencyCarryOverSetting(plan, enabled);
  return prisma.budgetPlan.update({
    where: { userId },
    data: {
      emergencyCarryOverDefault: enabled,
      bucketsJson: JSON.stringify(updated.buckets),
    },
  });
}
