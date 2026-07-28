/**
 * Goals timeline from plan buckets (UI presentation of existing data).
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
import { parseFx } from "@/lib/money";
import { GoalsClient } from "@/components/GoalsClient";

const VARS = [
  "--primary",
  "--accent-violet",
  "--accent-cyan",
  "--success",
  "--bucket-give",
  "--bucket-spend",
];

export default async function GoalsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.onboarding === "pending") redirect("/onboarding");

  const [plan, txs, inboxUnread] = await Promise.all([
    getUserPlan(user.id),
    prisma.transaction.findMany({
      where: { userId: user.id },
      orderBy: { date: "desc" },
      take: 200,
    }),
    unreadCount(user.id),
  ]);

  const fx = parseFx(user.fxRates);
  const money: MoneyTx[] = txs.map((t) => ({
    type: t.type as "i" | "e",
    amount: t.amount,
    currency: t.currency,
    bucketId: t.bucketId,
    sourceId: t.sourceId,
    date: t.date,
  }));
  const month = filterMonthTxs(money);
  const income = month
    .filter((t) => t.type === "i")
    .reduce(
      (s, t) => s + amountInBase(t.amount, t.currency, user.baseCurrency, fx),
      0
    );

  const goals =
    plan?.buckets
      .slice()
      .sort((a, b) => a.order - b.order)
      .map((b, i) => {
        const progress = month
          .filter((t) => t.type === "e" && t.bucketId === b.id)
          .reduce(
            (s, t) =>
              s + amountInBase(t.amount, t.currency, user.baseCurrency, fx),
            0
          );
        const target =
          income > 0 ? income * (Math.max(0, b.percent) / 100) : b.percent * 1000;
        return {
          id: b.id,
          name: b.name,
          emoji: b.emoji,
          target,
          progress,
          colorVar: VARS[i % VARS.length],
        };
      }) || [];

  return (
    <GoalsClient
      baseCurrency={user.baseCurrency}
      email={user.email}
      inboxUnread={inboxUnread}
      goals={goals}
    />
  );
}
