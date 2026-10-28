/**
 * Overview route — loads month snapshot + inbox unread for shell badge.
 */
import { redirect } from "next/navigation";
import {
  allTimeBucketStates,
  daysLeftInMonth,
  filterMonthTxs,
  forecast,
  monthSnapshot,
  startOfMonth,
  transactionTotals,
  type MoneyTx,
} from "@fintrack/domain";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { reallocationTxs } from "@/lib/reallocations";
import { unreadCount } from "@/lib/inbox";
import { getUserPlan } from "@/lib/plan";
import { parseFx, parseOpeningBalances } from "@/lib/money";
import { getUserDashboardLayout } from "@/lib/dashboard-layout";
import { DashboardClient } from "@/components/DashboardClient";
import { ensureMonthPacked } from "@/lib/month-close";
import { toTxRow } from "@/lib/tx-row";

export default async function DashboardPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.onboarding === "pending") redirect("/onboarding");

  // Rebuild this month's opening balances from history if anything changed
  // (a plan change, or a past transaction added, edited or deleted).
  await ensureMonthPacked(user.id);

  const plan = await getUserPlan(user.id);
  const planRow = await prisma.budgetPlan.findUnique({
    where: { userId: user.id },
  });
  const opening = planRow
    ? parseOpeningBalances(planRow.openingBalancesJson)
    : {};
  const fx = parseFx(user.fxRates);

  const [sources, allTxs, inboxUnread, layout, recurring, activeAccounts] = await Promise.all([
    prisma.incomeSource.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "asc" },
    }),
    prisma.transaction.findMany({
      where: { userId: user.id },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    }),
    unreadCount(user.id),
    getUserDashboardLayout(user.id),
    prisma.recurringRule.findMany({
      where: { userId: user.id, active: true },
    }),
    prisma.account.findMany({
      where: { userId: user.id, status: "active" },
      orderBy: { name: "asc" },
    }),
  ]);

  const moneyTxs: MoneyTx[] = [...allTxs.map((t) => ({
    type: t.type as "i" | "e",
    amount: t.amount,
    currency: t.currency,
    bucketId: t.bucketId,
    sourceId: t.sourceId,
    date: t.date,
  })), ...(await reallocationTxs(user.id))];
  const monthTxs = filterMonthTxs(moneyTxs);
  const snap = monthSnapshot(plan, monthTxs, user.baseCurrency, fx, opening);
  // Actual financial reality across ALL history (income − expenses), not a
  // projection and not tied to the waterfall / month plan.
  const totals = transactionTotals(moneyTxs, user.baseCurrency, fx);
  // All-time per-bucket numbers, replayed through the same month-packing chain
  // (monthBucketStates -> nextOpeningBalances) so history matches how the app
  // itself packs months — never guessed from the current month only.
  const allTimeBuckets = allTimeBucketStates(
    moneyTxs,
    plan,
    user.baseCurrency,
    fx
  );

  const start = startOfMonth();
  const monthRows = allTxs.filter((t) => t.date >= start);

  // No sample / demo balances when income is zero
  const sampleWaterfall = null;

  const now = new Date();
  const daysLeft = daysLeftInMonth(now);

  const forecastResult = forecast(plan, moneyTxs, 1, {
    base: user.baseCurrency,
    fx,
    recurring: recurring.map((r) => ({
      amount: r.amount,
      currency: r.currency,
      type: r.type as "i" | "e",
      cadence: r.cadence,
      active: r.active,
    })),
  });
  const next = forecastResult.months[0];
  const forecastNext =
    next && next.expectedGross > 0
      ? {
          gross: next.expectedGross,
          lines: next.waterfall.lines.map((l) => ({
            bucketId: l.bucketId,
            name: l.name,
            emoji: l.emoji,
            allocated: l.allocated,
          })),
        }
      : null;

  return (
    <DashboardClient
      email={user.email}
      baseCurrency={user.baseCurrency}
      onboarding={user.onboarding}
      hasPassword={Boolean(user.passwordHash)}
      plan={plan}
      fx={fx}
      accounts={activeAccounts.map((a) => ({
        id: a.id,
        name: a.name,
        currency: a.currency,
        kind: a.kind,
      }))}
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
      totals={totals}
      allTimeBuckets={allTimeBuckets}
      sampleWaterfall={sampleWaterfall}
      transactions={monthRows.map(toTxRow)}
      historyTransactions={allTxs.filter((t) => t.date < start).map(toTxRow)}
      inboxUnread={inboxUnread}
      daysLeft={daysLeft}
      serverNow={now.toISOString()}
      layout={layout}
      forecastNext={forecastNext}
    />
  );
}
