/**
 * Expenses tab — full list of expense transactions this month.
 */
import { redirect } from "next/navigation";
import { formatMoney, type CurrencyCode } from "@fintrack/domain";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { unreadCount } from "@/lib/inbox";
import { getUserPlan } from "@/lib/plan";
import { AppShell } from "@/components/AppShell";
import { formatTxDate } from "@/lib/format-date";
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
      orderBy: { date: "desc" },
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
        Overrides are tagged. Steward messages land in{" "}
        <Link href="/inbox">Inbox</Link>.
      </p>

      <div className="card">
        {txs.length === 0 ? (
          <div className="empty">
            No expenses yet.{" "}
            <Link href="/dashboard">Log one from Overview →</Link>
          </div>
        ) : (
          txs.map((t) => {
            const bucket =
              plan?.buckets.find((b) => b.id === t.bucketId) || null;
            return (
              <div className="tx-item" key={t.id}>
                <div>
                  <div className="tx-name">
                    {bucket
                      ? `${bucket.emoji} ${bucket.name}`
                      : t.bucketId || "Expense"}
                    {t.note ? (
                      <span className="muted"> · {t.note}</span>
                    ) : null}
                    {t.override && (
                      <span className="pill pill-y" style={{ marginLeft: 6 }}>
                        override
                      </span>
                    )}
                  </div>
                  <div className="tx-meta">
                    {formatTxDate(t.date)}
                    {t.reason ? ` · “${t.reason}”` : ""}
                  </div>
                </div>
                <div className="amt-neg">
                  −
                  {formatMoney(
                    t.amount,
                    t.currency as CurrencyCode
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </AppShell>
  );
}
