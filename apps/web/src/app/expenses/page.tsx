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
import { listRules } from "@/lib/recurring-rules";
import { AppShell } from "@/components/AppShell";
import { ExpensesView } from "@/components/ExpensesView";
import { PageHeader } from "@/components/PageHeader";
import { EDIT_WINDOW_RULE, startOfMonth } from "@fintrack/domain";
import Link from "next/link";

export default async function ExpensesPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.onboarding === "pending") redirect("/onboarding");

  const start = startOfMonth();

  const [plan, txs, inboxUnread, activeAccounts, rules] = await Promise.all([
    getUserPlan(user.id),
    prisma.transaction.findMany({
      where: { userId: user.id, type: "e", date: { gte: start } },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    }),
    unreadCount(user.id),
    prisma.account.findMany({
      where: { userId: user.id, status: "active" },
      orderBy: { name: "asc" },
    }),
    listRules(user.id),
  ]);

  return (
    <AppShell
      baseCurrency={user.baseCurrency}
      email={user.email}
      inboxUnread={inboxUnread}
    >
      <PageHeader
        title="Expenses this month"
        infoLabel="About expenses"
        info={
          <>
            Cross-bucket spends are tagged. Steward messages land in <Link href="/inbox">Inbox</Link>. {EDIT_WINDOW_RULE}
          </>
        }
      />
      <ExpensesView
        rows={txs.map(toTxRow)}
        plan={plan}
        accounts={activeAccounts.map((a) => ({ id: a.id, name: a.name, currency: a.currency, kind: a.kind }))}
        baseCurrency={user.baseCurrency}
        fx={parseFx(user.fxRates)}
        serverNow={new Date().toISOString()}
        upcoming={rules
          .filter((r) => r.active && r.type === "e")
          .sort((a, b) => a.nextDate.localeCompare(b.nextDate))
          .slice(0, 4)
          .map((r) => ({ id: r.id, note: r.note, amount: r.amount, currency: r.currency, nextDate: r.nextDate }))}
      />
    </AppShell>
  );
}
