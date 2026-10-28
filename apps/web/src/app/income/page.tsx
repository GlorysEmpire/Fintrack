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
import { PageHeader } from "@/components/PageHeader";
import { MetricCard } from "@/components/overview/MetricCard";
import { ListChecks, Wallet } from "lucide-react";

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
      <PageHeader
        title="Income"
        infoLabel="About income sources"
        info="Income sources label where money came from when you log income. An empty list is fine: we never invent sources for you."
      />
      <div className="m-grid">
        <MetricCard icon={Wallet} label="Logged this month" sub="all sources" valueClassName="text-primary">
          {formatMoney(total, base)}
        </MetricCard>
        <MetricCard icon={ListChecks} label="Sources" sub={`${sourcesWithLogged.filter((s) => s.loggedBase > 0).length} logged this month`}>
          {sources.length}
        </MetricCard>
      </div>

      <IncomeSourcesManager
        sources={sourcesWithLogged}
        baseCurrency={user.baseCurrency}
      />
    </AppShell>
  );
}
