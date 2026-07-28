/**
 * Income tab — sources + this month logged by source.
 */
import { redirect } from "next/navigation";
import {
  amountInBase,
  filterMonthTxs,
  formatMoney,
  type CurrencyCode,
  type MoneyTx,
} from "@fintrack/domain";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { unreadCount } from "@/lib/inbox";
import {
  ensureDefaultSources,
  parseFx,
} from "@/lib/money";
import { AppShell } from "@/components/AppShell";
import Link from "next/link";

export default async function IncomePage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.onboarding === "pending") redirect("/onboarding");

  await ensureDefaultSources(user.id);
  const fx = parseFx(user.fxRates);
  const base = user.baseCurrency as CurrencyCode;

  const [sources, txs, inboxUnread] = await Promise.all([
    prisma.incomeSource.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "asc" },
    }),
    prisma.transaction.findMany({
      where: { userId: user.id, type: "i" },
      orderBy: { date: "desc" },
    }),
    unreadCount(user.id),
  ]);

  const money: MoneyTx[] = txs.map((t) => ({
    type: "i",
    amount: t.amount,
    currency: t.currency,
    sourceId: t.sourceId,
    date: t.date,
  }));
  const month = filterMonthTxs(money);
  const total = month.reduce(
    (s, t) => s + amountInBase(t.amount, t.currency, user.baseCurrency, fx),
    0
  );

  return (
    <AppShell
      baseCurrency={user.baseCurrency}
      email={user.email}
      inboxUnread={inboxUnread}
    >
      <div className="metric-grid">
        <div className="metric">
          <div className="lbl">Logged this month</div>
          <div className="val" style={{ color: "var(--g)" }}>
            {formatMoney(total, base)}
          </div>
        </div>
        <div className="metric">
          <div className="lbl">Sources</div>
          <div className="val" style={{ fontSize: 18 }}>
            {sources.length}
          </div>
        </div>
      </div>

      <div className="sec">Income sources</div>
      {sources.map((s) => {
        const logged = month
          .filter((t) => t.sourceId === s.id)
          .reduce(
            (sum, t) =>
              sum + amountInBase(t.amount, t.currency, user.baseCurrency, fx),
            0
          );
        return (
          <div className="card" key={s.id}>
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              <div style={{ fontSize: 22 }}>{s.emoji}</div>
              <div style={{ flex: 1 }}>
                <strong>{s.name}</strong>
                <div className="muted">
                  {s.type} · expected {formatMoney(s.amount, s.currency as CurrencyCode)}/{s.currency}
                </div>
              </div>
              <div style={{ textAlign: "right", color: "var(--g)", fontWeight: 700 }}>
                {formatMoney(logged, base)}
                <div className="muted" style={{ fontWeight: 400 }}>
                  logged
                </div>
              </div>
            </div>
          </div>
        );
      })}

      <p className="muted" style={{ marginTop: 16 }}>
        Log income from Overview with the + button.{" "}
        <Link href="/dashboard">Go to Overview →</Link>
      </p>
    </AppShell>
  );
}
