/**
 * GET /api/dashboard
 * One payload for the overview: month income/expenses, waterfall, bucket states,
 * recent transactions, sources. Keeps the page from making many round-trips.
 */
import { NextResponse } from "next/server";
import {
  filterMonthTxs,
  monthSnapshot,
  startOfMonth,
  type MoneyTx,
} from "@fintrack/domain";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getUserPlan } from "@/lib/plan";
import { parseFx, parseOpeningBalances } from "@/lib/money";
import { ensureMonthPacked } from "@/lib/month-close";

export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  // Human: pack last month if needed, then read openings
  await ensureMonthPacked(user.id);

  const plan = await getUserPlan(user.id);
  const planRow = await prisma.budgetPlan.findUnique({
    where: { userId: user.id },
  });
  const opening = planRow
    ? parseOpeningBalances(planRow.openingBalancesJson)
    : {};
  const fx = parseFx(user.fxRates);

  const [sources, monthRows, recentRows] = await Promise.all([
    prisma.incomeSource.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "asc" },
    }),
    // The whole month, never a capped slice: the month's numbers must not
    // depend on how many transactions there happen to be.
    prisma.transaction.findMany({
      where: { userId: user.id, date: { gte: startOfMonth() } },
      orderBy: { date: "desc" },
    }),
    prisma.transaction.findMany({
      where: { userId: user.id },
      orderBy: { date: "desc" },
      take: 20,
    }),
  ]);

  const moneyTxs: MoneyTx[] = monthRows.map((t) => ({
    type: t.type as "i" | "e",
    amount: t.amount,
    currency: t.currency,
    bucketId: t.bucketId,
    sourceId: t.sourceId,
    date: t.date,
  }));
  const monthTxs = filterMonthTxs(moneyTxs);
  const snap = monthSnapshot(plan, monthTxs, user.baseCurrency, fx, opening);

  // No sample balances on empty months
  const sampleWaterfall = null;

  return NextResponse.json({
    ok: true,
    user: {
      email: user.email,
      baseCurrency: user.baseCurrency,
      onboarding: user.onboarding,
    },
    plan,
    fx,
    sources,
    snapshot: {
      income: snap.income,
      expenses: snap.expenses,
      net: snap.net,
      waterfall: snap.waterfall,
      buckets: snap.buckets,
    },
    sampleWaterfall,
    transactions: monthRows,
    recentAll: recentRows,
  });
}
