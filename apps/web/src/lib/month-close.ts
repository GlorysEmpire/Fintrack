/**
 * Month pack-up helpers.
 * Human: label a calendar month so we can store "which month we packed"
 * and compare to "month we are in now".
 */
import { prisma } from "./db";
import {
  monthBucketStates,
  nextOpeningBalances,
  type MoneyTx,
} from "@fintrack/domain";
import { parsePlan } from "./plan";
import { parseFx, parseOpeningBalances } from "./money";
import { amountInBase, spentByBucket, sumIncome } from "@fintrack/domain";
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
  | { status: "packed" };

/**
 * Human: On dashboard load, pack last month if needed.
 * For this slice: only decide skip / already — no write yet.
 */
export async function ensureMonthPacked(
  userId: string
): Promise<EnsureMonthResult> {
  const now = new Date();
  const current = monthKey(now); // e.g. "2026-08"
  const previous = monthKey(previousMonthDate(now)); // e.g. "2026-07"

  console.log("MONTH PACK: started", {
    userId,
    current,
    previous,
  });

  // Guard 1 — Human: no plan sheet → nothing to pack
  const planRow = await prisma.budgetPlan.findUnique({
    where: { userId },
  });

  console.log("MONTH PACK: plan row", {
    exists: !!planRow,
    lastMonthClosed: planRow?.lastMonthClosed,
  });

  if (!planRow) {
    console.log("MONTH PACK: skipped — no plan");
    return { status: "skipped", reason: "no_plan" };
  }

  // Guard 2 — Human: if we already packed, and that pack was for last month
  // (or later), do not pack again.
  // Code: lastMonthClosed holds "2026-07" after packing July.
  if (planRow.lastMonthClosed && planRow.lastMonthClosed >= previous) {
     console.log("MONTH PACK: already packed", {
      lastMonthClosed: planRow.lastMonthClosed,
      previous,
    });
    return { status: "already" };
  }

    console.log("MONTH PACK: packing required", {
    previous,
    lastMonthClosed: planRow.lastMonthClosed,
  });

  // Human: range for previous calendar month [start, nextMonthStart)
  const prevDate = previousMonthDate(now);
  const prevStart = new Date(prevDate.getFullYear(), prevDate.getMonth(), 1);
  const nextAfterPrev = new Date(prevDate.getFullYear(), prevDate.getMonth() + 1, 1);

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    return { status: "skipped", reason: "no_user" };
  }

  const prevTxs = await prisma.transaction.findMany({
    where: {
      userId,
      date: { gte: prevStart, lt: nextAfterPrev },
    },
  });

  const moneyTxs: MoneyTx[] = prevTxs.map((t) => ({
    type: t.type as "i" | "e",
    amount: t.amount,
    currency: t.currency,
    bucketId: t.bucketId,
    sourceId: t.sourceId,
    date: t.date,
  }));

  const plan = parsePlan(planRow);
  const fx = parseFx(user.fxRates);
  const base = user.baseCurrency;
  // Human: openings that were true at the start of that previous month
  const opening = parseOpeningBalances(planRow.openingBalancesJson);

  const income = sumIncome(moneyTxs, base, fx);
  const spent = spentByBucket(moneyTxs, base, fx);
  const states = monthBucketStates(income, plan, spent, opening);
  const nextOpenings = nextOpeningBalances(states);

   console.log("MONTH PACK: updating budget plan", {
    openingBalances: nextOpenings,
    lastMonthClosed: previous,
  });

  await prisma.budgetPlan.update({
    where: { userId },
    data: {
      openingBalancesJson: JSON.stringify(nextOpenings),
      lastMonthClosed: previous, // e.g. "2026-07"
    },
  });

    console.log("MONTH PACK: SUCCESS", {
    userId,
    packedMonth: previous,
  });


  return { status: "packed" };
}