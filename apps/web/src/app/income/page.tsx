/**
 * Income tab — sources + this month logged by source.
 * Never auto-seeds sources.
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
import { parseFx } from "@/lib/money";
import { AppShell } from "@/components/AppShell";
import { IncomeSourcesManager } from "@/components/IncomeSourcesManager";
import Link from "next/link";

export default async function IncomePage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.onboarding === "pending") redirect("/onboarding");

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

  const sourcesWithLogged = sources.map((s) => {
    const loggedBase = month
      .filter((t) => t.sourceId === s.id)
      .reduce(
        (sum, t) =>
          sum + amountInBase(t.amount, t.currency, user.baseCurrency, fx),
        0
      );
    return {
      id: s.id,
      name: s.name,
      type: s.type,
      emoji: s.emoji,
      currency: s.currency,
      amount: s.amount,
      loggedBase,
    };
  });

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

      <IncomeSourcesManager
        sources={sourcesWithLogged}
        baseCurrency={user.baseCurrency}
      />

      <p className="muted" style={{ marginTop: 16 }}>
        Log income from Overview with the + button.{" "}
        <Link href="/dashboard">Go to Overview →</Link>
      </p>
    </AppShell>
  );
}
