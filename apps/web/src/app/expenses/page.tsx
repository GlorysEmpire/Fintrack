/**
 * Expenses tab — glass transactions table (UI PR3).
 */
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { unreadCount } from "@/lib/inbox";
import { getUserPlan } from "@/lib/plan";
import { TransactionsClient } from "@/components/TransactionsClient";

export default async function ExpensesPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.onboarding === "pending") redirect("/onboarding");

  const start = new Date();
  start.setDate(1);
  start.setHours(0, 0, 0, 0);

  const [plan, txs, inboxUnread] = await Promise.all([
    getUserPlan(user.id),
    prisma.transaction.findMany({
      where: { userId: user.id, type: "e", date: { gte: start } },
      orderBy: { date: "desc" },
    }),
    unreadCount(user.id),
  ]);

  return (
    <TransactionsClient
      baseCurrency={user.baseCurrency}
      email={user.email}
      inboxUnread={inboxUnread}
      buckets={(plan?.buckets || []).map((b) => ({
        id: b.id,
        name: b.name,
        emoji: b.emoji,
      }))}
      rows={txs.map((t) => ({
        id: t.id,
        amount: t.amount,
        currency: t.currency,
        bucketId: t.bucketId,
        note: t.note,
        reason: t.reason,
        override: t.override,
        date: t.date.toISOString(),
        category: t.category,
      }))}
    />
  );
}
