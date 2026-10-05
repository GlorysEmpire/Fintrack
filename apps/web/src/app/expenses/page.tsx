/**
 * Expenses tab — full list of expense transactions this month.
 */
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { unreadCount } from "@/lib/inbox";
import { parseFx } from "@/lib/money";
import { getUserPlan } from "@/lib/plan";
import { toTxRow } from "@/lib/tx-row";
import { AppShell } from "@/components/AppShell";
import { TransactionList } from "@/components/TransactionList";
import { EDIT_WINDOW_RULE } from "@fintrack/domain";
import Link from "next/link";

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
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    }),
    unreadCount(user.id),
  ]);

  return (
    <AppShell
      baseCurrency={user.baseCurrency}
      email={user.email}
      inboxUnread={inboxUnread}
    >
      <h1 style={{ fontSize: 20, marginBottom: 8 }}>Expenses this month</h1>
      <p className="sub">
        Overspends and cross-bucket spends are tagged. Steward messages land in{" "}
        <Link href="/inbox">Inbox</Link>. {EDIT_WINDOW_RULE}
      </p>

      <div className="card">
        {txs.length === 0 ? (
          <div className="empty">
            No expenses yet.{" "}
            <Link href="/dashboard">Log one from Overview →</Link>
          </div>
        ) : (
          <TransactionList
            rows={txs.map(toTxRow)}
            plan={plan}
            sources={[]}
            baseCurrency={user.baseCurrency}
            fx={parseFx(user.fxRates)}
            serverNow={new Date().toISOString()}
          />
        )}
      </div>
    </AppShell>
  );
}
