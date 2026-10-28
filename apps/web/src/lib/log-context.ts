/**
 * What the log sheet needs to know, loaded on demand so the + button works
 * from every page: the plan, income sources, accounts, FX rates, what each
 * bucket has left this month and the income already logged this month.
 */
import {
  activeBuckets,
  filterMonthTxs,
  loggingStreak,
  type LoggingStreak,
  monthSnapshot,
  startOfMonth,
  type BudgetPlan,
  type MoneyTx,
} from "@fintrack/domain";
import { prisma } from "@/lib/db";
import { ensureMonthPacked } from "@/lib/month-close";
import { parseFx, parseOpeningBalances } from "@/lib/money";
import { getUserPlan } from "@/lib/plan";
import { reallocationTxs } from "@/lib/reallocations";

export type LogContext = {
  baseCurrency: string;
  plan: BudgetPlan | null;
  fx: Record<string, number>;
  sources: { id: string; name: string; emoji: string; currency: string }[];
  accounts: { id: string; name: string; currency: string; kind: string }[];
  /** Left in each bucket this month, base currency */
  bucketRemaining: Record<string, number>;
  /** Income logged this month, base currency */
  monthIncome: number;
  /** Days in a row something was recorded, as of before the sheet opens */
  streak: LoggingStreak;
};

export async function getLogContext(user: {
  id: string;
  baseCurrency: string;
  fxRates: string;
}): Promise<LogContext> {
  await ensureMonthPacked(user.id);
  const fx = parseFx(user.fxRates);
  const now = new Date();
  const [plan, planRow, sources, accounts, monthRows, moves, recorded] = await Promise.all([
    getUserPlan(user.id),
    prisma.budgetPlan.findUnique({ where: { userId: user.id } }),
    prisma.incomeSource.findMany({ where: { userId: user.id }, orderBy: { createdAt: "asc" } }),
    prisma.account.findMany({ where: { userId: user.id, status: "active" }, orderBy: { name: "asc" } }),
    prisma.transaction.findMany({ where: { userId: user.id, date: { gte: startOfMonth() } } }),
    reallocationTxs(user.id),
    prisma.transaction.findMany({
      where: { userId: user.id, createdAt: { gte: new Date(now.getTime() - 61 * 86_400_000) } },
      select: { createdAt: true },
    }),
  ]);

  const moneyTxs: MoneyTx[] = [
    ...monthRows.map((t) => ({
      type: t.type as "i" | "e",
      amount: t.amount,
      currency: t.currency,
      bucketId: t.bucketId,
      sourceId: t.sourceId,
      date: t.date,
    })),
    ...moves,
  ];
  const opening = planRow ? parseOpeningBalances(planRow.openingBalancesJson) : {};
  const snap = monthSnapshot(plan, filterMonthTxs(moneyTxs), user.baseCurrency, fx, opening);

  const bucketRemaining: Record<string, number> = {};
  for (const b of snap.buckets) bucketRemaining[b.bucketId] = b.closing;
  if (plan) {
    for (const b of activeBuckets(plan.buckets)) {
      if (!(b.id in bucketRemaining)) bucketRemaining[b.id] = 0;
    }
  }

  return {
    baseCurrency: user.baseCurrency,
    plan,
    fx,
    sources: sources.map((s) => ({ id: s.id, name: s.name, emoji: s.emoji, currency: s.currency })),
    accounts: accounts.map((a) => ({ id: a.id, name: a.name, currency: a.currency, kind: a.kind })),
    bucketRemaining,
    monthIncome: snap.income,
    streak: loggingStreak(recorded.map((r) => r.createdAt), now),
  };
}
