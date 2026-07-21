/**
 * Overview route — loads month snapshot + inbox unread for shell badge.
 */
import { redirect } from "next/navigation";
import {
  allocateWaterfall,
  filterMonthTxs,
  monthSnapshot,
  type MoneyTx,
} from "@fintrack/domain";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { unreadCount } from "@/lib/inbox";
import { getUserPlan } from "@/lib/plan";
import {
  ensureDefaultSources,
  parseFx,
  parseOpeningBalances,
} from "@/lib/money";
import { getUserDashboardLayout } from "@/lib/dashboard-layout";
import { DashboardClient } from "@/components/DashboardClient";

export default async function DashboardPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.onboarding === "pending") redirect("/onboarding");

  await ensureDefaultSources(user.id);

  const plan = await getUserPlan(user.id);
  const planRow = await prisma.budgetPlan.findUnique({
    where: { userId: user.id },
  });
  const opening = planRow
    ? parseOpeningBalances(planRow.openingBalancesJson)
    : {};
  const fx = parseFx(user.fxRates);

  const [sources, allTxs, inboxUnread, layout] = await Promise.all([
    prisma.incomeSource.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "asc" },
    }),
    prisma.transaction.findMany({
      where: { userId: user.id },
      orderBy: { date: "desc" },
      take: 100,
    }),
    unreadCount(user.id),
    getUserDashboardLayout(user.id),
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

  const start = new Date();
  start.setDate(1);
  start.setHours(0, 0, 0, 0);
  const monthRows = allTxs.filter((t) => t.date >= start);

  const sampleWaterfall =
    plan && snap.income === 0 ? allocateWaterfall(100_000, plan) : null;

  // Days remaining in calendar month (like legacy app)
  const now = new Date();
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const daysLeft = Math.max(0, lastDay - now.getDate());

  return (
    <DashboardClient
      email={user.email}
      baseCurrency={user.baseCurrency}
      onboarding={user.onboarding}
      plan={plan}
      fx={fx}
      sources={sources.map((s) => ({
        id: s.id,
        name: s.name,
        emoji: s.emoji,
        currency: s.currency,
      }))}
      snapshot={{
        income: snap.income,
        expenses: snap.expenses,
        net: snap.net,
        waterfall: snap.waterfall,
        buckets: snap.buckets,
      }}
      sampleWaterfall={sampleWaterfall}
      transactions={monthRows.map((t) => ({
        id: t.id,
        type: t.type,
        amount: t.amount,
        currency: t.currency,
        bucketId: t.bucketId,
        sourceId: t.sourceId,
        note: t.note,
        reason: t.reason,
        override: t.override,
        date: t.date.toISOString(),
      }))}
      inboxUnread={inboxUnread}
      daysLeft={daysLeft}
      layout={layout}
    />
  );
}
