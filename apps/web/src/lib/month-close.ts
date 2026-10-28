/**
 * Month pack-up helpers.
 * Human: label a calendar month so we can store "which month we packed"
 * and compare to "month we are in now".
 */
import { prisma } from "./db";
import { writeSteward } from "./inbox";
import { reallocationTxs } from "./reallocations";
import {
  formatMoney,
  monthKeyOf,
  monthlyRecapDraft,
  openingBalancesForMonth,
  transactionTotals,
  type CurrencyCode,
  startOfMonth,
  startOfMonthOffset,
  sameOpeningBalances,
  type MoneyTx,
} from "@fintrack/domain";
import { parsePlan } from "./plan";
import { parseFx, parseOpeningBalances } from "./money";
/** Human: "July 2026" → Code: "2026-07" (Lagos time, never the server's) */
export function monthKey(d: Date): string {
  return monthKeyOf(d);
}

/** Human: the calendar month before this date → Code: Date at day 1 of previous month */
export function previousMonthDate(d: Date = new Date()): Date {
  return startOfMonthOffset(-1, d);
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
  const currentStart = startOfMonth(now);
  const pastTxs = await prisma.transaction.findMany({
    where: { userId, date: { lt: currentStart } },
  });
  const moneyTxs: MoneyTx[] = [...pastTxs.map((t) => ({
    type: t.type as "i" | "e",
    amount: t.amount,
    currency: t.currency,
    bucketId: t.bucketId,
    sourceId: t.sourceId,
    date: t.date,
  })), ...(await reallocationTxs(userId, { before: currentStart }))];

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
    console.log("MONTH PACK: packed", { packedMonth: previous });
    await writeRecap(userId, previous, moneyTxs, user.baseCurrency, fx);
    return { status: "packed" };
  }

  // Human: the month was already packed, but under different rules/data
  // (a plan change, or a past transaction added, edited or deleted).
  // Log THAT it happened, never the balances themselves: the caller gets the
  // before/after in the result if it needs them.
  console.log("MONTH PACK: reconciled stale openings", {
    lastMonthClosed: planRow.lastMonthClosed,
    bucketsChanged: changedBucketCount(stored, expected),
  });
  return { status: "reconciled", before: stored, after: expected };
}

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** Steward's short recap of the month that just ended. Skipped for a month with nothing recorded. */
async function writeRecap(
  userId: string,
  month: string,
  all: MoneyTx[],
  baseCurrency: string,
  fx: Record<string, number>
) {
  try {
    const inMonth = all.filter((t) => (t.type === "i" || t.type === "e") && monthKeyOf(t.date) === month);
    if (inMonth.length === 0) return;
    const t = transactionTotals(inMonth, baseCurrency, fx);
    const base = baseCurrency as CurrencyCode;
    const [y, m] = month.split("-").map(Number);
    const draft = monthlyRecapDraft({
      monthLabel: `${MONTH_NAMES[m - 1]} ${y}`,
      incomeLabel: formatMoney(t.income, base),
      expensesLabel: formatMoney(t.expenses, base),
      net: t.net,
      netLabel: formatMoney(Math.abs(t.net), base),
      expenseRate: t.income > 0 ? Math.round((t.expenses / t.income) * 100) : null,
    });
    await writeSteward({ userId, kind: "monthly_review", ...draft, since: new Date(0) });
  } catch (e) {
    console.error("Monthly recap failed", e instanceof Error ? e.message : e);
  }
}

/** How many buckets' opening balances differ (for logging without amounts). */
function changedBucketCount(
  a: Record<string, number>,
  b: Record<string, number>
): number {
  const ids = new Set([...Object.keys(a), ...Object.keys(b)]);
  let n = 0;
  for (const id of ids) {
    if (!sameOpeningBalances({ [id]: a[id] || 0 }, { [id]: b[id] || 0 })) n += 1;
  }
  return n;
}
