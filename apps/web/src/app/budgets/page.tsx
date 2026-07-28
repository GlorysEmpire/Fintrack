/**
 * Budgets — rings from plan buckets + month spend (UI only).
 */
import { redirect } from "next/navigation";
import {
  amountInBase,
  filterMonthTxs,
  type MoneyTx,
} from "@fintrack/domain";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { unreadCount } from "@/lib/inbox";
import { getUserPlan } from "@/lib/plan";
import { parseFx, parseOpeningBalances } from "@/lib/money";
import { BudgetsClient } from "@/components/BudgetsClient";

const VARS = [
  "--primary",
  "--accent-violet",
  "--accent-cyan",
  "--success",
  "--bucket-give",
  "--bucket-spend",
];

export default async function BudgetsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.onboarding === "pending") redirect("/onboarding");

  const plan = await getUserPlan(user.id);
  const planRow = await prisma.budgetPlan.findUnique({
    where: { userId: user.id },
  });
  const opening = planRow
    ? parseOpeningBalances(planRow.openingBalancesJson)
    : {};
  const fx = parseFx(user.fxRates);

  const txs = await prisma.transaction.findMany({
    where: { userId: user.id },
    orderBy: { date: "desc" },
    take: 200,
  });
  const money: MoneyTx[] = txs.map((t) => ({
    type: t.type as "i" | "e",
    amount: t.amount,
    currency: t.currency,
    bucketId: t.bucketId,
    sourceId: t.sourceId,
    date: t.date,
  }));
  const month = filterMonthTxs(money);

  // Simple month allocation: income waterfall lines if available via plan %
  const income = month
    .filter((t) => t.type === "i")
    .reduce(
      (s, t) => s + amountInBase(t.amount, t.currency, user.baseCurrency, fx),
      0
    );

  const items =
    plan?.buckets
      .slice()
      .sort((a, b) => a.order - b.order)
      .map((b, i) => {
        const spent = month
          .filter((t) => t.type === "e" && t.bucketId === b.id)
          .reduce(
            (s, t) =>
              s + amountInBase(t.amount, t.currency, user.baseCurrency, fx),
            0
          );
        const open = opening[b.id] || 0;
        // approximate allocated share of gross for display
        const alloc =
          open +
          (income > 0
            ? income * (Math.max(0, b.percent) / 100)
            : 0);
        return {
          id: b.id,
          name: b.name,
          emoji: b.emoji,
          percent: b.percent,
          alloc,
          spent,
          colorVar: VARS[i % VARS.length],
        };
      }) || [];

  const inboxUnread = await unreadCount(user.id);

  return (
    <BudgetsClient
      baseCurrency={user.baseCurrency}
      email={user.email}
      inboxUnread={inboxUnread}
      items={items}
    />
  );
}
