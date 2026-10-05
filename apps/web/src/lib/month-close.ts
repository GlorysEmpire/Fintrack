/**
 * Month pack-up helpers.
 * Human: label a calendar month so we can store "which month we packed"
 * and compare to "month we are in now".
 */
import { prisma } from "./db";
import {
  openingBalancesForMonth,
  sameOpeningBalances,
  type MoneyTx,
} from "@fintrack/domain";
import { parsePlan } from "./plan";
import { parseFx, parseOpeningBalances } from "./money";
/** Human: "July 2026" → Code: "2026-07" */
export function monthKey(d: Date): string {
  const y = d.getFullYear();
  const m = d.getMonth() + 1; // getMonth() is 0–11; people use 1–12
  return `${y}-${String(m).padStart(2, "0")}`;
}

/** Human: the calendar month before this date → Code: Date at day 1 of previous month */
export function previousMonthDate(d: Date = new Date()): Date {
  return new Date(d.getFullYear(), d.getMonth() - 1, 1);
}

export type EnsureMonthResult =
  | { status: "skipped"; reason: string }
  | { status: "already" }
  | { status: "packed" }
  | {
      status: "reconciled";
      before: Record<string, number>;
      after: Record<string, number>;
    };

/**
 * Human: On load, make sure this month opens with the right carry-over.
 *
 * BudgetPlan.openingBalancesJson is a CACHE, not a source of truth: it is only
 * ever written here, from transactions + plan + FX. The truth is
 * openingBalancesForMonth(), which replays every past month through the
 * current plan. So instead of packing just last month on top of whatever was
 * stored, we recompute the openings and rewrite the cache when:
 *   - last month has not been packed yet (normal month transition), or
 *   - the stored openings no longer match the replay — e.g. the plan changed
 *     after a month was packed (Tithe carryOver false → true), a past
 *     transaction was edited/deleted, or a month was skipped.
 * Transactions are only read, never changed.
 */
export async function ensureMonthPacked(
  userId: string,
  now: Date = new Date()
): Promise<EnsureMonthResult> {
  const previous = monthKey(previousMonthDate(now)); // e.g. "2026-09"

  // Guard 1 — Human: no plan sheet → nothing to pack
  const planRow = await prisma.budgetPlan.findUnique({
    where: { userId },
  });
  if (!planRow) {
    return { status: "skipped", reason: "no_plan" };
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    return { status: "skipped", reason: "no_user" };
  }

  // Human: every transaction before this month (they decide this month's openings)
  const currentStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const pastTxs = await prisma.transaction.findMany({
    where: { userId, date: { lt: currentStart } },
  });
  const moneyTxs: MoneyTx[] = pastTxs.map((t) => ({
    type: t.type as "i" | "e",
    amount: t.amount,
    currency: t.currency,
    bucketId: t.bucketId,
    sourceId: t.sourceId,
    date: t.date,
  }));

  const plan = parsePlan(planRow);
  const fx = parseFx(user.fxRates);
  const expected = openingBalancesForMonth(
    moneyTxs,
    plan,
    user.baseCurrency,
    fx,
    now
  );
  const stored = parseOpeningBalances(planRow.openingBalancesJson);

  // Code: lastMonthClosed holds "2026-09" after packing September.
  const lastMonthPacked =
    !!planRow.lastMonthClosed && planRow.lastMonthClosed >= previous;
  const openingsMatch = sameOpeningBalances(stored, expected);

  if (lastMonthPacked && openingsMatch) {
    return { status: "already" };
  }

  await prisma.budgetPlan.update({
    where: { userId },
    data: {
      openingBalancesJson: JSON.stringify(expected),
      ...(lastMonthPacked ? {} : { lastMonthClosed: previous }),
    },
  });

  if (!lastMonthPacked) {
    console.log("MONTH PACK: packed", { userId, packedMonth: previous });
    return { status: "packed" };
  }

  // Human: the month was already packed, but under different rules/data.
  // Log the before/after so a correction is always traceable.
  console.log("MONTH PACK: reconciled stale openings", {
    userId,
    lastMonthClosed: planRow.lastMonthClosed,
    before: stored,
    after: expected,
  });
  return { status: "reconciled", before: stored, after: expected };
}
