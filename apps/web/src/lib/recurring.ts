/**
 * Generating the transactions that recurring rules are due to create.
 *
 * Called by the daily cron (api/public/cron/recurring). The guarantees:
 *
 *  - Each occurrence is recorded AT MOST ONCE. A transaction carries its rule
 *    and its occurrence day, and the database refuses a second one, so a retry,
 *    an overlapping run, or a crash half-way can not duplicate money.
 *  - Missed days are caught up, each filed under its own date.
 *  - Rules are independent: one that fails is recorded on the rule and the
 *    others carry on.
 *  - Recurring does not bypass the buckets. An expense is checked exactly like
 *    one typed in by hand. If the bucket can not cover it, that occurrence is
 *    SKIPPED (never forced through), the rule moves on, and the user is told in
 *    their Inbox.
 *  - Nothing moves money outside FinTrack. This only writes records.
 *
 * Each occurrence runs under the user's lock (user-lock.ts): look for it, record
 * it, move the rule on, all as one step with respect to anything else that user
 * is doing.
 */
import {
  APP_TIME_ZONE,
  dateFromDateKey,
  dateKeyInTimeZone,
  dueOccurrences,
  occurrenceAfter,
  type CurrencyCode,
  type RecurringCadence,
} from "@fintrack/domain";
import type { RecurringRule } from "@prisma/client";
import { prisma } from "./db";
import { createTransactionWithinLock } from "./transactions";
import { withUserLock } from "./user-lock";

export const MAX_RULES_PER_RUN = 200;
/** Occurrences one rule may catch up in a single run; the rest follow next run */
export const MAX_OCCURRENCES_PER_RULE = 62;

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export type RuleOutcome = {
  ruleId: string;
  created: number;
  skipped: number;
  /** Already recorded by an earlier run */
  alreadyDone: number;
  failed: boolean;
};

export type RunSummary = {
  rulesChecked: number;
  created: number;
  skipped: number;
  alreadyDone: number;
  failedRules: number;
  /** More rules or occurrences were due than one run handles */
  moreToDo: boolean;
  outcomes: RuleOutcome[];
};

type OccurrenceResult = "created" | "skipped" | "already_done" | "stale";

function dayLabel(key: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(dateFromDateKey(key));
}

async function processOccurrence(
  ruleId: string,
  userId: string,
  key: string,
  now: Date
): Promise<OccurrenceResult> {
  return withUserLock(userId, async () => {
    // Read again now that we hold the lock: the rule may have been paused,
    // edited, or moved on by an overlapping run since the job listed it.
    const rule = await prisma.recurringRule.findFirst({
      where: { id: ruleId, userId, active: true },
    });
    if (!rule) return "stale";
    if (dateKeyInTimeZone(rule.nextRunAt, APP_TIME_ZONE) !== key) return "stale";

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return "stale";

    const occurrenceDate = dateFromDateKey(key);
    const nextKey = occurrenceAfter(
      key,
      rule.cadence as RecurringCadence,
      rule.dayOfMonth
    );
    const advance = (lastError: string | null) =>
      prisma.recurringRule.update({
        where: { id: rule.id },
        data: {
          nextRunAt: dateFromDateKey(nextKey),
          lastRunAt: now,
          lastError,
        },
      });

    const existing = await prisma.transaction.findFirst({
      where: { recurringRuleId: rule.id, occurrenceDate },
      select: { id: true },
    });
    if (existing) {
      await advance(null);
      return "already_done";
    }

    const result = await createTransactionWithinLock(
      user,
      {
        type: rule.type === "i" ? "i" : "e",
        amount: rule.amount,
        currency: rule.currency as CurrencyCode,
        bucketId: rule.type === "e" ? rule.bucketId : null,
        sourceId: rule.type === "i" ? rule.sourceId : null,
        note: rule.note || "Recurring",
        date: key,
        recurring: { ruleId: rule.id, occurrenceDate },
      },
      now
    );

    if (result.status === "ok") {
      await advance(null);
      return "created";
    }

    // Refused by the same rules as a hand-typed transaction. Skip THIS
    // occurrence, move on, and tell the user. Never force it through.
    const reason =
      result.status === "blocked"
        ? "the bucket could not cover it"
        : result.status === "invalid"
          ? result.error
          : "it could not be recorded";
    const what = rule.note?.trim() || "A recurring expense";
    await prisma.inboxMessage.create({
      data: {
        userId,
        kind: "system",
        title: `Recurring ${rule.type === "i" ? "income" : "expense"} skipped`,
        body:
          result.status === "blocked"
            ? `${what} for ${dayLabel(key)} was not recorded. ${result.error}`
            : `${what} for ${dayLabel(key)} was not recorded: ${reason}`,
      },
    });
    await advance(`Skipped ${dayLabel(key)}: ${reason}.`);
    return "skipped";
  });
}

async function processRule(
  rule: RecurringRule,
  todayKey: string,
  now: Date
): Promise<{ outcome: RuleOutcome; more: boolean }> {
  const outcome: RuleOutcome = {
    ruleId: rule.id,
    created: 0,
    skipped: 0,
    alreadyDone: 0,
    failed: false,
  };
  const due = dueOccurrences({
    nextKey: dateKeyInTimeZone(rule.nextRunAt, APP_TIME_ZONE),
    cadence: rule.cadence as RecurringCadence,
    dayOfMonth: rule.dayOfMonth,
    todayKey,
    limit: MAX_OCCURRENCES_PER_RULE,
  });

  try {
    for (const key of due.keys) {
      const result = await processOccurrence(rule.id, rule.userId, key, now);
      if (result === "created") outcome.created += 1;
      else if (result === "skipped") outcome.skipped += 1;
      else if (result === "already_done") outcome.alreadyDone += 1;
      else break; // paused, edited or advanced elsewhere: leave it to its owner
    }
  } catch (e) {
    outcome.failed = true;
    // Kind only: never the amounts or notes that were being handled
    const kind = e instanceof Error ? e.name : "Error";
    try {
      await prisma.recurringRule.update({
        where: { id: rule.id },
        data: {
          lastRunAt: now,
          lastError: "The last run hit an error and will be retried.",
        },
      });
    } catch {
      // The error is already logged below; there is nothing more to do here
    }
    console.error(`[recurring] rule run failed: ${kind}`);
  }
  return { outcome, more: due.more };
}

/** Handle every occurrence that is due as of `now`. Safe to run any number of times. */
export async function runDueRecurring(now: Date = new Date()): Promise<RunSummary> {
  const todayKey = dateKeyInTimeZone(now, APP_TIME_ZONE);
  // Everything that could be due today: up to the end of today in Lagos
  const endOfToday = new Date(dateFromDateKey(todayKey).getTime() + ONE_DAY_MS);
  const candidates = await prisma.recurringRule.findMany({
    where: { active: true, nextRunAt: { lt: endOfToday } },
    orderBy: { nextRunAt: "asc" },
    take: MAX_RULES_PER_RUN + 1,
  });

  const summary: RunSummary = {
    rulesChecked: 0,
    created: 0,
    skipped: 0,
    alreadyDone: 0,
    failedRules: 0,
    moreToDo: candidates.length > MAX_RULES_PER_RUN,
    outcomes: [],
  };

  for (const rule of candidates.slice(0, MAX_RULES_PER_RUN)) {
    if (dateKeyInTimeZone(rule.nextRunAt, APP_TIME_ZONE) > todayKey) continue;
    const { outcome, more } = await processRule(rule, todayKey, now);
    summary.rulesChecked += 1;
    summary.created += outcome.created;
    summary.skipped += outcome.skipped;
    summary.alreadyDone += outcome.alreadyDone;
    if (outcome.failed) summary.failedRules += 1;
    if (more) summary.moreToDo = true;
    summary.outcomes.push(outcome);
  }
  return summary;
}
