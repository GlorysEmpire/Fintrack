/**
 * GET /api/dashboard
 * One payload for the overview: month income/expenses, waterfall, bucket states,
 * recent transactions, sources. Keeps the page from making many round-trips.
 */
import { NextResponse } from "next/server";
import {
  filterMonthTxs,
  monthSnapshot,
  type MoneyTx,
} from "@fintrack/domain";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getUserPlan } from "@/lib/plan";
import {
  ensureDefaultSources,
  parseFx,
  parseOpeningBalances,
} from "@/lib/money";

export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  await ensureDefaultSources(user.id);

  const plan = await getUserPlan(user.id);
  const planRow = await prisma.budgetPlan.findUnique({
    where: { userId: user.id },
  });
  const opening = planRow
    ? parseOpeningBalances(planRow.openingBalancesJson)
    : {};
  const fx = parseFx(user.fxRates);

  const [sources, allTxs] = await Promise.all([
    prisma.incomeSource.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "asc" },
    }),
    prisma.transaction.findMany({
      where: { userId: user.id },
      orderBy: { date: "desc" },
      take: 100,
    }),
  ]);

  const moneyTxs: MoneyTx[] = allTxs.map((t) => ({
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

  const start = new Date();
  start.setDate(1);
  start.setHours(0, 0, 0, 0);
  const monthRows = allTxs.filter((t) => t.date >= start);

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
    recentAll: allTxs.slice(0, 20),
  });
}
