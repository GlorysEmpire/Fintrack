/**
 * Creating, changing, pausing and deleting recurring rules.
 *
 * A rule only says "record this on these days". Nothing here records a
 * transaction: the daily job does (recurring.ts), under the same rules as a
 * transaction typed in by hand. Every read and write is scoped to the
 * signed-in user's id.
 *
 *  - The first occurrence is today or later. Rules never back-fill the past.
 *  - Pausing stops generation. Resuming picks up from the next scheduled day
 *    on or after today; days missed while paused are not filled in.
 *  - Changing the schedule restarts it from today (or the start date given).
 *  - Deleting a rule keeps every transaction it already made.
 */
import {
  APP_TIME_ZONE,
  dateFromDateKey,
  dateKeyInTimeZone,
  isDateKey,
  nextOccurrenceOnOrAfter,
  type RecurringCadence,
} from "@fintrack/domain";
import type { RecurringRule } from "@prisma/client";
import { prisma } from "./db";
import { getUserPlan } from "./plan";
import { withUserLock } from "./user-lock";

export const MAX_RULES_PER_USER = 100;

export type NewRuleInput = {
  type: "i" | "e";
  amount: number;
  currency: string;
  bucketId?: string | null;
  sourceId?: string | null;
  note?: string | null;
  cadence: RecurringCadence;
  dayOfMonth?: number | null;
  /** "YYYY-MM-DD", today or later. Omitted = today. */
  startDate?: string | null;
};

export type RulePatch = Partial<Omit<NewRuleInput, "type">> & { active?: boolean };

export type RuleView = RecurringRule & {
  /** The next day it will fire, "YYYY-MM-DD" */
  nextDate: string;
};

export type RuleResult =
  | { status: "ok"; rule: RuleView }
  | { status: "invalid"; error: string }
  | { status: "not_found" };

export function toRuleView(rule: RecurringRule): RuleView {
  return { ...rule, nextDate: dateKeyInTimeZone(rule.nextRunAt, APP_TIME_ZONE) };
}

const invalid = (error: string): RuleResult => ({ status: "invalid", error });

export async function listRules(userId: string): Promise<RuleView[]> {
  const rules = await prisma.recurringRule.findMany({
    where: { userId },
    orderBy: [{ active: "desc" }, { nextRunAt: "asc" }],
  });
  return rules.map(toRuleView);
}

/** Checks the money side of a rule against the user's own plan and income sources. */
async function checkTargets(
  userId: string,
  type: string,
  bucketId: string | null,
  sourceId: string | null,
  keepsBucket: boolean
): Promise<string | null> {
  if (type === "i") {
    if (sourceId) {
      const source = await prisma.incomeSource.findFirst({
        where: { id: sourceId, userId },
        select: { id: true },
      });
      if (!source) return "Pick one of your income sources.";
    }
    return null;
  }
  const plan = await getUserPlan(userId);
  if (!plan) return null; // no plan yet: expenses log without a bucket
  if (!bucketId) return "Pick a bucket for this expense.";
  const bucket = plan.buckets.find((b) => b.id === bucketId);
  if (!bucket) return "Pick one of the buckets in your plan.";
  if (bucket.archived && !keepsBucket) {
    return `${bucket.name} is archived, so it can not be used for a new rule.`;
  }
  return null;
}

function scheduleError(
  cadence: RecurringCadence,
  dayOfMonth: number | null | undefined,
  startDate: string | null | undefined,
  todayKey: string
): string | null {
  if (cadence === "monthly" && dayOfMonth != null) {
    if (!Number.isInteger(dayOfMonth) || dayOfMonth < 1 || dayOfMonth > 31) {
      return "Pick a day of the month from 1 to 31.";
    }
  }
  if (startDate) {
    if (!isDateKey(startDate)) return "Enter a valid start date.";
    if (startDate < todayKey) {
      return "The start date can not be in the past. A rule records what happens from now on.";
    }
  }
  return null;
}

export async function createRule(
  userId: string,
  input: NewRuleInput,
  now: Date = new Date()
): Promise<RuleResult> {
  const todayKey = dateKeyInTimeZone(now, APP_TIME_ZONE);
  const startKey = input.startDate || todayKey;
  const bad = scheduleError(input.cadence, input.dayOfMonth, input.startDate, todayKey);
  if (bad) return invalid(bad);

  const bucketId = input.type === "e" ? input.bucketId || null : null;
  const sourceId = input.type === "i" ? input.sourceId || null : null;
  const badTarget = await checkTargets(userId, input.type, bucketId, sourceId, false);
  if (badTarget) return invalid(badTarget);

  if ((await prisma.recurringRule.count({ where: { userId } })) >= MAX_RULES_PER_USER) {
    return invalid(`You can have up to ${MAX_RULES_PER_USER} recurring rules.`);
  }

  const dayOfMonth = input.cadence === "monthly" ? input.dayOfMonth ?? null : null;
  const nextKey = nextOccurrenceOnOrAfter(startKey, input.cadence, dayOfMonth, startKey);
  const rule = await prisma.recurringRule.create({
    data: {
      userId,
      type: input.type,
      amount: input.amount,
      currency: input.currency,
      bucketId,
      sourceId,
      note: input.note?.trim() || null,
      cadence: input.cadence,
      dayOfMonth,
      nextRunAt: dateFromDateKey(nextKey),
    },
  });
  return { status: "ok", rule: toRuleView(rule) };
}

export async function updateRule(
  userId: string,
  id: string,
  patch: RulePatch,
  now: Date = new Date()
): Promise<RuleResult> {
  // Same lock the daily job takes, so an edit and a run never overlap
  return withUserLock(userId, async () => {
    const existing = await prisma.recurringRule.findFirst({ where: { id, userId } });
    if (!existing) return { status: "not_found" };

    const todayKey = dateKeyInTimeZone(now, APP_TIME_ZONE);
    const cadence = (patch.cadence ?? existing.cadence) as RecurringCadence;
    const dayOfMonth =
      cadence === "monthly"
        ? patch.dayOfMonth !== undefined
          ? patch.dayOfMonth
          : existing.dayOfMonth
        : null;
    const bad = scheduleError(cadence, dayOfMonth, patch.startDate, todayKey);
    if (bad) return invalid(bad);

    const bucketId =
      existing.type === "e"
        ? patch.bucketId !== undefined
          ? patch.bucketId || null
          : existing.bucketId
        : null;
    const sourceId =
      existing.type === "i"
        ? patch.sourceId !== undefined
          ? patch.sourceId || null
          : existing.sourceId
        : null;
    const badTarget = await checkTargets(
      userId,
      existing.type,
      bucketId,
      sourceId,
      bucketId === existing.bucketId
    );
    if (badTarget) return invalid(badTarget);

    const scheduleChanged =
      cadence !== existing.cadence ||
      dayOfMonth !== existing.dayOfMonth ||
      Boolean(patch.startDate);
    const active = patch.active ?? existing.active;
    const resumed = active && !existing.active;

    let nextRunAt = existing.nextRunAt;
    if (scheduleChanged) {
      const anchor = patch.startDate || todayKey;
      nextRunAt = dateFromDateKey(
        nextOccurrenceOnOrAfter(anchor, cadence, dayOfMonth, anchor)
      );
    } else if (resumed) {
      // Keep the rhythm (and weekday) it had; skip whatever was missed while paused
      const anchor = dateKeyInTimeZone(existing.nextRunAt, APP_TIME_ZONE);
      nextRunAt = dateFromDateKey(
        nextOccurrenceOnOrAfter(anchor, cadence, dayOfMonth, todayKey)
      );
    }

    const rule = await prisma.recurringRule.update({
      where: { id: existing.id },
      data: {
        amount: patch.amount ?? existing.amount,
        currency: patch.currency ?? existing.currency,
        bucketId,
        sourceId,
        note: patch.note !== undefined ? patch.note?.trim() || null : existing.note,
        cadence,
        dayOfMonth,
        active,
        nextRunAt,
        ...(scheduleChanged || resumed ? { lastError: null } : {}),
      },
    });
    return { status: "ok", rule: toRuleView(rule) };
  });
}

/** Transactions the rule already made are kept: they are what happened. */
export async function deleteRule(userId: string, id: string): Promise<boolean> {
  return withUserLock(userId, async () => {
    const { count } = await prisma.recurringRule.deleteMany({ where: { id, userId } });
    return count > 0;
  });
}
